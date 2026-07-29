import crypto from 'crypto';
import { 
  db, 
  getPaymentSettings, 
  addPaymentLog 
} from '../_services/payment-service.js';
import { doc, getDoc, writeBatch, collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Vercel Serverless Function Handler: create-upi-deposit
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
      error: `Method ${req.method} Not Allowed. Only POST requests are supported.`
    });
  }

  try {
    const { userId, playerId, amount, utr, transactionHash } = req.body;
    const resolvedUserId = userId || playerId;
    const providedUtr = (utr || transactionHash || '').trim();

    if (!resolvedUserId) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: userId or playerId."
      });
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid deposit amount in INR."
      });
    }

    if (providedUtr) {
      if (!/^[a-zA-Z0-9]{6,20}$/.test(providedUtr)) {
        return res.status(400).json({
          success: false,
          error: "Invalid UPI UTR / Transaction Reference format. Must be 6-20 alphanumeric characters."
        });
      }

      try {
        const depositsRef = collection(db, 'deposits');
        const utrQuery = query(
          depositsRef,
          where('transactionHash', '==', providedUtr)
        );
        const utrSnap = await getDocs(utrQuery);
        if (!utrSnap.empty) {
          return res.status(400).json({
            success: false,
            error: `Duplicate UTR detected. UTR '${providedUtr}' has already been submitted for processing.`
          });
        }
      } catch (e) {
        console.warn("[API Info] UTR duplicate check warning:", e.message);
      }
    }

    const numAmount = Number(amount);
    const settings = await getPaymentSettings().catch(() => ({}));

    if (settings.maintenanceMode) {
      return res.status(403).json({
        success: false,
        error: "Payment infrastructure is currently under maintenance. Please try again later."
      });
    }

    const minRequired = settings.upiSettings?.minDepositInr || 100;
    const maxRequired = settings.upiSettings?.maxDepositInr || 100000;
    const cooldownSeconds = 30;

    if (numAmount < minRequired || numAmount > maxRequired) {
      return res.status(400).json({
        success: false,
        error: `UPI Deposit amount of ₹${numAmount} exceeds allowed limits [Min: ₹${minRequired}, Max: ₹${maxRequired}].`
      });
    }

    try {
      const depositsRef = collection(db, 'deposits');
      const cooldownThreshold = Date.now() - cooldownSeconds * 1000;
      const q = query(
        depositsRef,
        where('playerId', '==', resolvedUserId),
        where('amount', '==', numAmount),
        where('method', '==', 'upi'),
        where('timestamp', '>', cooldownThreshold)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        return res.status(400).json({
          success: false,
          error: `A duplicate UPI deposit request was already submitted recently. Please wait ${cooldownSeconds} seconds before submitting again.`
        });
      }
    } catch (e) {
      console.warn("[API Info] Duplicate prevention check skipped:", e.message);
    }

    const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
    const paymentId = `DEP-UPI-${randomHex}`;
    const txnId = `TXN-UPI-${randomHex}`;

    const upiVpa = settings.upiSettings?.vpa || settings.upiVpa || 'matrixpay@upi';
    const merchantName = settings.upiSettings?.merchantName || 'Matrix Casino';

    const qrData = `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(merchantName)}&am=${numAmount}&tr=${paymentId}&cu=INR`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;

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

    const timestamp = Date.now();

    const depositDoc = {
      depositId: paymentId,
      id: paymentId,
      userId: resolvedUserId,
      playerId: resolvedUserId,
      method: 'upi',
      currency: 'INR',
      amount: numAmount,
      network: 'UPI',
      status: 'pending',
      transactionId: txnId,
      upiVpa,
      qrData,
      createdAt: timestamp,
      updatedAt: timestamp,
      timestamp,
      playerBalanceAtRequest: playerBalance,
      details: `UPI VPA: ${upiVpa} | Order: ${paymentId}`
    };

    const transactionDoc = {
      id: txnId,
      transactionId: txnId,
      playerId: resolvedUserId,
      userId: resolvedUserId,
      type: 'deposit',
      amount: numAmount,
      currency: 'INR',
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
      'upi',
      `UPI deposit request created: ${paymentId} for ₹${numAmount}`,
      `Player: ${resolvedUserId} | VPA: ${upiVpa}`
    ).catch(() => {});

    return res.status(200).json({
      success: true,
      depositId: paymentId,
      transactionId: txnId,
      userId: resolvedUserId,
      method: 'upi',
      currency: 'INR',
      amount: numAmount,
      network: 'UPI',
      status: 'pending',
      upiVpa,
      qrData,
      qrCodeUrl,
      createdAt: timestamp,
      updatedAt: timestamp
    });

  } catch (error) {
    console.error("Error in create-upi-deposit serverless function:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}
