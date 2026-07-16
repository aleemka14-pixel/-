import crypto from 'crypto';
import { 
  db, 
  getPaymentSettings, 
  getProviderAdapter, 
  recordProviderFailure, 
  recordProviderSuccess,
  addPaymentLog
} from './payment-service.js';
import { doc, getDoc, runTransaction, collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Vercel Serverless Function: payment-webhook
 * 
 * Secure webhook receiver for processing crypto payment confirmations.
 * Uses centralized Payment Service adapters to verify signatures.
 */
export default async function handler(req, res) {
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

    // 1. Fetch config and check signature/auth via Adapter
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

    // 2. Enforce that payment state must be 'confirmed' or 'completed'
    const statusLower = status.toLowerCase();
    if (statusLower !== 'confirmed' && statusLower !== 'completed' && statusLower !== 'finished') {
      return res.status(200).json({
        success: true,
        message: `Webhook received but skipped processing because status is '${status}' (only confirmed states credit balances).`
      });
    }

    // 3. Look up existing Deposit document in Firestore
    const depositRef = doc(db, 'deposits', depositId);
    const depositSnap = await getDoc(depositRef);

    if (!depositSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: `Deposit request with ID '${depositId}' was not found in the database.`
      });
    }

    const depositData = depositSnap.data();

    // 4. Idempotency Check: Prevent duplicate processing if already completed
    if (depositData.status === 'confirmed' || depositData.status === 'completed') {
      console.log(`[Idempotency Enforced] Deposit '${depositId}' is already processed/confirmed.`);
      return res.status(200).json({
        success: true,
        message: "Deposit has already been confirmed and processed previously.",
        depositId,
        status: depositData.status
      });
    }

    // 5. Validate Webhook Data vs. Original DB Document (Integrity Guard)
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

    // 6. Prevent double spend: Check if transaction hash already exists for another completed deposit
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

    // 7. Execute Atomic Firestore Transaction for Balance Credit
    const playerId = depositData.playerId || depositData.userId;
    const playerRef = doc(db, 'players', playerId);
    const userRef = doc(db, 'users', playerId);
    
    const timestampNow = Date.now();
    let updatedBalance = 0;

    await runTransaction(db, async (transaction) => {
      const freshPlayerSnap = await transaction.get(playerRef);
      const freshDepositSnap = await transaction.get(depositRef);

      if (!freshPlayerSnap.exists()) {
        throw new Error(`Player document with ID '${playerId}' does not exist.`);
      }

      if (!freshDepositSnap.exists()) {
        throw new Error(`Deposit document with ID '${depositId}' does not exist.`);
      }

      const freshDepositData = freshDepositSnap.data();
      if (freshDepositData.status === 'confirmed' || freshDepositData.status === 'completed') {
        throw new Error("Concurrency Conflict: Deposit is already confirmed in a parallel thread.");
      }

      const playerData = freshPlayerSnap.data();
      let balanceBefore = playerData.balance || 0;

      const freshUserSnap = await transaction.get(userRef);
      if (freshUserSnap.exists()) {
        balanceBefore = freshUserSnap.data().balance ?? freshUserSnap.data().walletBalance ?? balanceBefore;
      }

      updatedBalance = balanceBefore + dbAmount;

      // Update Player Balance
      transaction.update(playerRef, { balance: updatedBalance });

      // Update User Balance
      if (freshUserSnap.exists()) {
        transaction.update(userRef, {
          balance: updatedBalance,
          walletBalance: updatedBalance,
          updatedAt: timestampNow
        });
      } else {
        transaction.set(userRef, {
          userId: playerId,
          username: playerData.name || 'Player',
          email: playerData.email || '',
          balance: updatedBalance,
          walletBalance: updatedBalance,
          createdAt: timestampNow,
          updatedAt: timestampNow,
          status: 'active'
        });
      }

      // Update Deposit request status
      transaction.update(depositRef, {
        status: 'confirmed',
        transactionHash: transactionHash.trim(),
        confirmedAt: timestampNow,
        updatedAt: timestampNow
      });

      // Create transaction history document deterministically to prevent duplicate rows
      const txnId = `TXN-CONF-${transactionHash.trim()}`;
      const txnRef = doc(db, 'transactions', txnId);
      
      const transactionDoc = {
        id: txnId,
        transactionId: txnId,
        playerId: playerId,
        userId: playerId,
        type: 'deposit',
        amount: dbAmount,
        balanceBefore: balanceBefore,
        balanceAfter: updatedBalance,
        referenceId: depositId,
        network: netUpper,
        status: 'completed',
        transactionHash: transactionHash.trim(),
        timestamp: timestampNow,
        createdAt: timestampNow
      };

      transaction.set(txnRef, transactionDoc);
    });

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
