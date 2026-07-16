import crypto from 'crypto';
import { 
  db, 
  getPaymentSettings, 
  getProviderAdapter, 
  recordProviderFailure, 
  recordProviderSuccess,
  addPaymentLog
} from './payment-service.js';
import { doc, getDoc, writeBatch } from 'firebase/firestore';

/**
 * Vercel Serverless Function: create-payment
 * 
 * Generates payment details using the standard NowPayments Adapter, integrating live APIs if configured.
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
    const { amount, currency, networkId, playerId } = req.body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid deposit amount."
      });
    }

    if (!networkId) {
      return res.status(400).json({
        success: false,
        error: "Missing selected network ID."
      });
    }

    const resolvedUserId = playerId || 'GUEST';

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
    const providerConfig = settings.providers.nowpayments;
    if (!providerConfig || !providerConfig.enabled) {
      return res.status(403).json({
        success: false,
        error: "The requested NOWPayments gateway is currently disabled."
      });
    }

    // 2. Execute adapter creation
    let result;
    try {
      const adapter = getProviderAdapter(providerConfig);
      result = await adapter.createPayment({
        userId: resolvedUserId,
        amount: Number(amount),
        network: networkId,
        currency: currency || 'usd'
      });
      await recordProviderSuccess('nowpayments');
    } catch (adapterError) {
      await recordProviderFailure('nowpayments', adapterError.message);
      throw adapterError;
    }

    const { paymentId, walletAddress, qrData, qrCodeUrl, status, isMock } = result;

    // 3. Query player profile to get balance at request time
    let playerBalance = 0;
    if (resolvedUserId !== 'GUEST') {
      try {
        const playerRef = doc(db, 'players', resolvedUserId);
        const playerSnap = await getDoc(playerRef);
        if (playerSnap.exists()) {
          playerBalance = playerSnap.data().balance || 0;
        }
      } catch (e) {
        console.warn(`[API Info] Could not fetch balance for player ${resolvedUserId}:`, e.message);
      }
    }

    // 4. Commit document records to database atomically (for consistency monitoring)
    const timestamp = Date.now();
    const txnId = `TXN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    const depositDoc = {
      id: paymentId,
      depositId: paymentId,
      playerId: resolvedUserId,
      userId: resolvedUserId,
      amount: Number(amount),
      method: networkId.toUpperCase(),
      network: networkId.toUpperCase(),
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
      providerId: 'nowpayments'
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
      'nowpayments',
      `NOWPayments payment request created successfully: ${paymentId} for ${amount} USD on network ${networkId}`,
      `Player: ${resolvedUserId} | Mock: ${isMock}`
    );

    return res.status(200).json({
      success: true,
      isMock,
      paymentId,
      walletAddress,
      amount: Number(amount),
      qrCode: qrCodeUrl,
      paymentStatus: status,
      createdAt: new Date(timestamp).toISOString()
    });

  } catch (error) {
    console.error("Error creating NOWPayments dynamic details:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}
