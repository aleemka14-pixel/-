import crypto from 'crypto';
import { 
  db, 
  getPaymentSettings, 
  getProviderAdapter, 
  recordProviderFailure, 
  recordProviderSuccess,
  addPaymentLog
} from './payment-service.js';
import { doc, getDoc, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Vercel Serverless Function: create-deposit
 * 
 * Generates and stores a new crypto deposit request for TRC20, BEP20, and ERC20 networks.
 * Uses the dynamic centralized configuration and adapter patterns.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} Not Allowed. Only POST requests are supported.`
    });
  }

  try {
    const { userId, playerId, amount, network } = req.body;
    const resolvedUserId = userId || playerId;

    if (!resolvedUserId) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: userId or playerId."
      });
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid deposit amount."
      });
    }

    if (!network) {
      return res.status(400).json({
        success: false,
        error: "Missing selected network."
      });
    }

    const netUpper = network.toUpperCase();
    if (netUpper !== 'TRC20' && netUpper !== 'BEP20' && netUpper !== 'ERC20') {
      return res.status(400).json({
        success: false,
        error: "Supported networks are TRC20, BEP20, and ERC20."
      });
    }

    // 1. Fetch dynamic Payment Settings
    const settings = await getPaymentSettings();

    // Check Global Maintenance Mode
    if (settings.maintenanceMode) {
      return res.status(403).json({
        success: false,
        error: "Payment infrastructure is currently undergoing scheduled maintenance. Please try again later."
      });
    }

    // Load Provider Configuration
    const providerConfig = settings.providers.cryptodirect;
    if (!providerConfig || !providerConfig.enabled) {
      return res.status(403).json({
        success: false,
        error: "Crypto Direct deposits are currently disabled."
      });
    }

    // Enforce limits from database configuration
    const minRequired = settings.depositSettings?.minDepositUsd || 10;
    const maxRequired = settings.depositSettings?.maxDepositUsd || 50000;
    const cooldownSeconds = settings.depositSettings?.cooldownSeconds || 30;

    if (Number(amount) < minRequired || Number(amount) > maxRequired) {
      return res.status(400).json({
        success: false,
        error: `Deposit amount of ${amount} exceeds allowed limits [Min: $${minRequired}, Max: $${maxRequired}].`
      });
    }

    // 2. Prevent duplicate deposit creation within cooldown window
    try {
      const depositsRef = collection(db, 'deposits');
      const cooldownThreshold = Date.now() - cooldownSeconds * 1000;
      const q = query(
        depositsRef,
        where('playerId', '==', resolvedUserId),
        where('amount', '==', Number(amount)),
        where('method', '==', netUpper),
        where('timestamp', '>', cooldownThreshold)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        return res.status(400).json({
          success: false,
          error: `A duplicate deposit request was already submitted recently. Please wait ${cooldownSeconds} seconds before submitting again.`
        });
      }
    } catch (e) {
      console.warn("[API Info] Duplicate prevention check skipped:", e.message);
    }

    // 3. Execute adapter creation
    let result;
    try {
      const adapter = getProviderAdapter(providerConfig);
      result = await adapter.createPayment({
        userId: resolvedUserId,
        amount: Number(amount),
        network: netUpper
      });
      await recordProviderSuccess('cryptodirect');
    } catch (adapterError) {
      await recordProviderFailure('cryptodirect', adapterError.message);
      throw adapterError;
    }

    const { paymentId, walletAddress, qrData, isMock } = result;

    // 4. Query player profile to get balance at request time
    let playerBalance = 0;
    try {
      const playerRef = doc(db, 'players', resolvedUserId);
      const playerSnap = await getDoc(playerRef);
      if (playerSnap.exists()) {
        playerBalance = playerSnap.data().balance || 0;
      }
    } catch (e) {
      console.warn(`[API Info] Could not fetch balance for player ${resolvedUserId}:`, e.message);
    }

    // 5. Commit document records to database atomically
    const timestamp = Date.now();
    const txnId = `TXN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const depositDoc = {
      id: paymentId,
      depositId: paymentId,
      playerId: resolvedUserId,
      userId: resolvedUserId,
      amount: Number(amount),
      method: netUpper,
      network: netUpper,
      details: walletAddress,
      walletAddress,
      screenshotUrl: "",
      qrData,
      status: 'pending',
      timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      playerBalanceAtRequest: playerBalance,
      isMock,
      providerId: 'cryptodirect'
    };

    const transactionDoc = {
      id: txnId,
      transactionId: txnId,
      playerId: resolvedUserId,
      userId: resolvedUserId,
      type: 'deposit',
      amount: Number(amount),
      balanceBefore: playerBalance,
      balanceAfter: playerBalance,
      referenceId: paymentId,
      timestamp,
      createdAt: timestamp,
      status: 'pending'
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'deposits', paymentId), depositDoc);
    batch.set(doc(db, 'transactions', txnId), transactionDoc);

    await batch.commit();

    await addPaymentLog(
      'info',
      'cryptodirect',
      `Payment request created successfully: ${paymentId} for ${amount} USDT on network ${netUpper}`,
      `Player: ${resolvedUserId} | Mock: ${isMock}`
    );

    return res.status(200).json({
      depositId: paymentId,
      amount: Number(amount),
      network: netUpper,
      walletAddress,
      qrData,
      status: "pending"
    });

  } catch (error) {
    console.error("Error in create-deposit serverless function:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}
