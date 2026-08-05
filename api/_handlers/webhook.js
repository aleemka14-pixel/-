import { 
  db, 
  getPaymentSettings, 
  recordProviderFailure, 
  recordProviderSuccess,
  addPaymentLog
} from '../_services/payment-service.js';
import { doc, getDoc, runTransaction } from 'firebase/firestore';
import walletService from '../../services/wallet-service.js';
import { nowpaymentsService } from '../../services/payment/nowpayments.js';

/**
 * Vercel Serverless Function Handler: webhook
 * Processes incoming IPN webhook notifications from NOWPayments Crypto Gateway.
 */
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
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
    let payload = req.body || {};
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
        console.warn("[NOWPayments Webhook] Raw body string parsing failed:", e);
      }
    }

    console.log("[NOWPayments Webhook Received] Headers:", JSON.stringify(req.headers));
    console.log("[NOWPayments Webhook Received] Payload:", JSON.stringify(payload, null, 2));

    const settings = await getPaymentSettings();
    const nowpaymentsConfig = settings.providers?.nowpayments || {};
    const ipnSecret = (nowpaymentsConfig.credentials?.ipnSecret || process.env.NOWPAYMENTS_IPN_SECRET || '').trim();

    // Verify HMAC SHA-512 signature
    const verification = nowpaymentsService.verifyWebhookSignature(req.headers, payload, ipnSecret);

    const orderId = payload.order_id || payload.payment_id || payload.invoice_id;
    const rawStatus = String(payload.payment_status || '').toLowerCase();
    const rawAmount = Number(payload.actually_paid || payload.pay_amount || payload.price_amount || 0);

    if (!orderId) {
      console.error("[NOWPayments Webhook Error] Missing order_id in webhook payload.");
      return res.status(400).json({
        success: false,
        error: "Missing required order ID (order_id) in webhook payload."
      });
    }

    if (!verification.isValid) {
      console.error(`[NOWPayments Webhook Error] Signature verification failed for order '${orderId}': ${verification.reason}`);
      await recordProviderFailure('nowpayments', `Webhook signature validation failed: ${verification.reason}`);
      return res.status(401).json({
        success: false,
        error: "Invalid webhook signature or authentication failed."
      });
    }

    // Fetch deposit document from Firestore
    const depositRef = doc(db, 'deposits', String(orderId));
    let depositSnap = await getDoc(depositRef);

    if (!depositSnap.exists()) {
      console.error(`[NOWPayments Webhook Error] Deposit '${orderId}' not found in database.`);
      return res.status(404).json({
        success: false,
        error: `Deposit request '${orderId}' was not found in database.`
      });
    }

    const depositData = depositSnap.data();

    // Idempotency check: verify if deposit was already processed and credited
    if (depositData.status === 'confirmed' || depositData.status === 'completed' || depositData.credited === true) {
      console.log(`[Idempotency Enforced] NOWPayments Deposit '${orderId}' was already processed and credited previously.`);
      return res.status(200).json({
        success: true,
        message: "Deposit has already been confirmed and processed previously.",
        depositId: orderId,
        status: depositData.status
      });
    }

    const isConfirmedState = ['confirmed', 'finished'].includes(rawStatus);

    if (!isConfirmedState) {
      // Non-terminal or failed state: update deposit document status
      await runTransaction(db, async (transaction) => {
        const freshSnap = await transaction.get(depositRef);
        if (freshSnap.exists()) {
          const freshData = freshSnap.data();
          if (freshData.status !== 'confirmed' && freshData.status !== 'completed') {
            transaction.update(depositRef, {
              status: rawStatus || 'pending',
              nowpaymentsStatus: rawStatus,
              updatedAt: Date.now()
            });
          }
        }
      });

      return res.status(200).json({
        success: true,
        message: `Webhook received. Payment status updated to '${rawStatus}'.`,
        depositId: orderId,
        status: rawStatus
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
        throw new Error(`Deposit document '${orderId}' not found.`);
      }
      const freshData = freshSnap.data();
      if (freshData.status === 'confirmed' || freshData.status === 'completed' || freshData.credited === true) {
        throw new Error("Concurrency Conflict: NOWPayments deposit was already confirmed in parallel.");
      }

      transaction.update(depositRef, {
        status: 'confirmed',
        credited: true,
        confirmedAt: timestampNow,
        updatedAt: timestampNow,
        nowpaymentsStatus: rawStatus,
        provider: 'nowpayments',
        paidAmount: creditedAmount,
        actuallyPaid: creditedAmount
      });
    });

    // Credit player wallet atomically via WalletService ledger
    const walletRes = await walletService.deposit(
      playerId,
      creditedAmount,
      {
        depositId: orderId,
        provider: 'nowpayments',
        currency: depositData.currency || 'USD',
        description: `Crypto Deposit: $${creditedAmount} (NOWPayments)`
      },
      `dep_${orderId}`,
      db
    );

    await recordProviderSuccess('nowpayments');

    await addPaymentLog(
      'success',
      'nowpayments',
      `NOWPayments Deposit '${orderId}' confirmed. Credited $${creditedAmount} to player '${playerId}'.`,
      `New balance: $${walletRes.balanceAfter}`
    );

    console.log(`[NOWPayments Webhook Success] Order '${orderId}' confirmed & credited $${creditedAmount} to player '${playerId}'.`);

    return res.status(200).json({
      success: true,
      message: "NOWPayments crypto payment successfully verified and credited.",
      depositId: orderId,
      playerId,
      creditedAmount,
      newBalance: walletRes.balanceAfter
    });

  } catch (error) {
    console.error("CRITICAL: Error in NOWPayments webhook handler:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Webhook Error"
    });
  }
}
