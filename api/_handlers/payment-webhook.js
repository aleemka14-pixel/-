import { 
  db, 
  getPaymentSettings, 
  getProviderAdapter, 
  recordProviderFailure, 
  recordProviderSuccess,
  addPaymentLog
} from '../_services/payment-service.js';
import { doc, getDoc, runTransaction } from 'firebase/firestore';
import walletService from '../../services/wallet-service.js';
import { sunpayService } from '../../services/payment/sunpay.js';

/**
 * Vercel Serverless Function Handler: payment-webhook
 * Processes incoming webhook notifications from Sunpay payment gateway.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} Not Allowed. Webhooks only support POST requests.`
    });
  }

  try {
    const payload = req.body || {};
    console.log("[Sunpay Webhook Received] Payload:", JSON.stringify(payload, null, 2));

    const webhookResult = sunpayService.processWebhook(req.headers, payload);

    const depositId = webhookResult.orderId || payload.out_trade_no || payload.depositId || payload.orderId;
    const rawStatus = String(webhookResult.status || payload.status || payload.trade_status || '').toLowerCase();
    const rawAmount = Number(webhookResult.amount || payload.amount || payload.pay_amount || 0);

    if (!depositId) {
      return res.status(400).json({
        success: false,
        error: "Missing required order ID (out_trade_no / depositId) in webhook payload."
      });
    }

    if (!webhookResult.isValid) {
      console.error("[Sunpay Webhook] Signature verification failed for order:", depositId);
      await recordProviderFailure('sunpay', 'Webhook signature validation failed.');
      return res.status(401).json({
        success: false,
        error: "Invalid webhook signature or authentication failed."
      });
    }

    const isConfirmedState = ['confirmed', 'success', '1', 'completed', 'paid', 'trade_success'].includes(rawStatus);
    if (!isConfirmedState) {
      return res.status(200).json({
        success: true,
        message: `Webhook received but skipped credit. Order status: '${rawStatus}'`
      });
    }

    // Fetch deposit document from Firestore
    const depositRef = doc(db, 'deposits', depositId);
    const depositSnap = await getDoc(depositRef);

    if (!depositSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: `Deposit request '${depositId}' was not found in database.`
      });
    }

    const depositData = depositSnap.data();

    // Idempotency check: verify if deposit was already processed
    if (depositData.status === 'confirmed' || depositData.status === 'completed') {
      console.log(`[Idempotency Enforced] Deposit '${depositId}' has already been processed and credited.`);
      return res.status(200).json({
        success: true,
        message: "Deposit has already been confirmed and processed previously.",
        depositId,
        status: depositData.status
      });
    }

    const playerId = depositData.playerId || depositData.userId;
    const expectedAmount = Number(depositData.amount || 0);
    const creditedAmount = rawAmount > 0 ? rawAmount : expectedAmount;
    const timestampNow = Date.now();

    // Atomic transaction to update deposit document
    await runTransaction(db, async (transaction) => {
      const freshSnap = await transaction.get(depositRef);
      if (!freshSnap.exists()) {
        throw new Error(`Deposit document '${depositId}' not found.`);
      }
      const freshData = freshSnap.data();
      if (freshData.status === 'confirmed' || freshData.status === 'completed') {
        throw new Error("Concurrency Conflict: Deposit was already confirmed in parallel.");
      }

      transaction.update(depositRef, {
        status: 'confirmed',
        confirmedAt: timestampNow,
        updatedAt: timestampNow,
        provider: 'sunpay',
        paidAmount: creditedAmount
      });
    });

    // Credit player wallet atomically via WalletService ledger
    const walletRes = await walletService.deposit(
      playerId,
      creditedAmount,
      {
        depositId,
        provider: 'sunpay',
        currency: depositData.currency || 'INR',
        description: `Sunpay Deposit: ₹${creditedAmount}`
      },
      `dep_${depositId}`,
      db
    );

    await recordProviderSuccess('sunpay');

    await addPaymentLog(
      'success',
      'sunpay',
      `Deposit '${depositId}' confirmed. Credited ₹${creditedAmount} to player '${playerId}'.`,
      `New balance: ₹${walletRes.balanceAfter}`
    );

    return res.status(200).json({
      success: true,
      message: "Sunpay payment successfully verified and credited.",
      depositId,
      playerId,
      creditedAmount,
      newBalance: walletRes.balanceAfter
    });

  } catch (error) {
    console.error("CRITICAL: Error in payment-webhook handler:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}
