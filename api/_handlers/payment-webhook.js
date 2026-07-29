import crypto from 'crypto';
import { 
  db, 
  getPaymentSettings, 
  getProviderAdapter, 
  recordProviderFailure, 
  recordProviderSuccess,
  addPaymentLog
} from '../_services/payment-service.js';
import { doc, getDoc, runTransaction, collection, query, where, getDocs } from 'firebase/firestore';
import walletService from '../../services/wallet-service.js';

/**
 * Vercel Serverless Function Handler: payment-webhook
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-nowpayments-sig, np-sig'
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
    const payload = req.body;
    console.log("[Payment Webhook Received] Payload:", JSON.stringify(payload, null, 2));

    const { depositId, walletAddress, amount, network, transactionHash, status } = payload;

    if (!depositId || !walletAddress || !amount || !network || !transactionHash || !status) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields in webhook payload. Must include: depositId, walletAddress, amount, network, transactionHash, status."
      });
    }

    if (isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid amount value. Must be a positive number."
      });
    }

    const settings = await getPaymentSettings();
    const providerConfig = settings.providers.cryptodirect;

    if (!providerConfig || !providerConfig.enabled) {
      return res.status(403).json({
        success: false,
        error: "Crypto Direct webhook receiver is currently disabled."
      });
    }

    const adapter = getProviderAdapter(providerConfig);
    const isAuthenticated = adapter.verifyWebhook(req.headers, payload);

    if (!isAuthenticated) {
      console.error("CRITICAL: Webhook signature validation failed for cryptodirect.");
      await recordProviderFailure('cryptodirect', 'Webhook authentication signature validation failed.');
      return res.status(401).json({
        success: false,
        error: "Webhook signature verification failed."
      });
    }

    const statusLower = status.toLowerCase();
    if (statusLower !== 'confirmed' && statusLower !== 'completed' && statusLower !== 'finished') {
      return res.status(200).json({
        success: true,
        message: `Webhook received but skipped processing because status is '${status}' (only confirmed states credit balances).`
      });
    }

    const depositRef = doc(db, 'deposits', depositId);
    const depositSnap = await getDoc(depositRef);

    if (!depositSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: `Deposit request with ID '${depositId}' was not found in the database.`
      });
    }

    const depositData = depositSnap.data();

    if (depositData.status === 'confirmed' || depositData.status === 'completed') {
      console.log(`[Idempotency Enforced] Deposit '${depositId}' is already processed/confirmed.`);
      return res.status(200).json({
        success: true,
        message: "Deposit has already been confirmed and processed previously.",
        depositId,
        status: depositData.status
      });
    }

    const netUpper = network.toUpperCase();
    const dbNet = (depositData.network || depositData.method || '').toUpperCase();
    
    if (dbNet !== netUpper) {
      return res.status(400).json({
        success: false,
        error: `Network mismatch. Expected: ${dbNet}, Received: ${netUpper}.`
      });
    }

    const dbAddress = (depositData.walletAddress || depositData.details || '').trim();
    if (dbAddress.toLowerCase() !== walletAddress.trim().toLowerCase() && !dbAddress.includes(walletAddress.trim())) {
      return res.status(400).json({
        success: false,
        error: `Wallet address mismatch. Expected: ${dbAddress}, Received: ${walletAddress}.`
      });
    }

    const dbAmount = Number(depositData.amount);
    const webAmount = Number(amount);
    if (Math.abs(dbAmount - webAmount) > 0.01) {
      return res.status(400).json({
        success: false,
        error: `Deposit amount mismatch. Expected: ${dbAmount}, Received: ${webAmount}.`
      });
    }

    try {
      const depositsRef = collection(db, 'deposits');
      const q = query(
        depositsRef, 
        where('transactionHash', '==', transactionHash.trim()), 
        where('status', 'in', ['confirmed', 'completed'])
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        console.error(`CRITICAL: transactionHash '${transactionHash}' has already been credited.`);
        return res.status(400).json({
          success: false,
          error: `Transaction hash '${transactionHash}' was already processed. Potential double-spending attempt.`
        });
      }
    } catch (e) {
      console.warn("[API Webhook Info] Duplicate transaction hash search bypassed:", e.message);
    }

    const playerId = depositData.playerId || depositData.userId;
    const timestampNow = Date.now();
    let updatedBalance = 0;

    await runTransaction(db, async (transaction) => {
      const freshDepositSnap = await transaction.get(depositRef);
      if (!freshDepositSnap.exists()) {
        throw new Error(`Deposit document with ID '${depositId}' does not exist.`);
      }
      const freshDepositData = freshDepositSnap.data();
      if (freshDepositData.status === 'confirmed' || freshDepositData.status === 'completed') {
        throw new Error("Concurrency Conflict: Deposit is already confirmed in a parallel thread.");
      }
      transaction.update(depositRef, {
        status: 'confirmed',
        transactionHash: transactionHash.trim(),
        confirmedAt: timestampNow,
        updatedAt: timestampNow
      });
    });

    const walletRes = await walletService.deposit(
      playerId,
      dbAmount,
      {
        depositId,
        network: netUpper,
        transactionHash: transactionHash.trim(),
        description: `Crypto Deposit: ${dbAmount} USDT via ${netUpper}`
      },
      `dep_${depositId}`,
      db
    );
    updatedBalance = walletRes.balanceAfter;

    await recordProviderSuccess('cryptodirect');

    await addPaymentLog(
      'success',
      'cryptodirect',
      `Deposit request '${depositId}' successfully verified and confirmed. Credited ${dbAmount} USDT to player '${playerId}'.`,
      `TxHash: ${transactionHash}`
    );

    return res.status(200).json({
      success: true,
      message: "Payment successfully verified, balance credited.",
      depositId,
      playerId,
      creditedAmount: dbAmount,
      newBalance: updatedBalance,
      transactionHash
    });

  } catch (error) {
    console.error("CRITICAL: Webhook error processing payment:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}
