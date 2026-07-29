import crypto from 'crypto';
import { 
  db, 
  getPaymentSettings, 
  addPaymentLog,
  recordProviderSuccess,
  recordProviderFailure
} from '../../_services/payment-service.js';
import { doc, getDoc, runTransaction, updateDoc } from 'firebase/firestore';
import walletService from '../../../services/wallet-service.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-upi-secret, x-signature'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Webhook accepts POST requests.'
    });
  }

  try {
    const payload = req.body || {};
    console.log('[UPI Webhook Received] Payload:', JSON.stringify(payload));

    const { 
      orderId, 
      depositId, 
      paymentId, 
      status, 
      amount, 
      utr, 
      userId,
      signature,
      secret
    } = payload;

    const resolvedOrderId = orderId || depositId;

    if (!resolvedOrderId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: orderId or depositId.'
      });
    }

    const expectedSecret = process.env.UPI_WEBHOOK_SECRET;
    if (expectedSecret) {
      const headerSecret = req.headers['x-upi-secret'] || secret;
      if (headerSecret !== expectedSecret) {
        console.error('[UPI Webhook Security Error]: Invalid webhook secret token.');
        await recordProviderFailure('upi', 'Invalid UPI webhook secret token.');
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Invalid webhook secret token.'
        });
      }
    }

    const depositRef = doc(db, 'deposits', resolvedOrderId);
    const depositSnap = await getDoc(depositRef);

    if (!depositSnap.exists()) {
      console.error(`[UPI Webhook Error]: Deposit order '${resolvedOrderId}' not found in database.`);
      return res.status(404).json({
        success: false,
        error: `Deposit order '${resolvedOrderId}' not found.`
      });
    }

    const depositData = depositSnap.data();
    const resolvedUserId = userId || depositData.userId || depositData.playerId;
    const expectedAmount = Number(depositData.amount);
    const receivedAmount = amount ? Number(amount) : expectedAmount;

    if (Math.abs(expectedAmount - receivedAmount) > 0.01) {
      console.error(`[UPI Webhook Error]: Amount mismatch. Expected: ${expectedAmount}, Received: ${receivedAmount}`);
      return res.status(400).json({
        success: false,
        error: `Amount mismatch. Expected ₹${expectedAmount}, received ₹${receivedAmount}.`
      });
    }

    if (depositData.status === 'completed' || depositData.status === 'confirmed' || depositData.credited === true) {
      console.log(`[Duplicate UPI Webhook Ignored]: Order '${resolvedOrderId}' is already credited.`);
      return res.status(200).json({
        success: true,
        message: 'Duplicate webhook delivery ignored. Deposit already completed.',
        orderId: resolvedOrderId,
        status: depositData.status
      });
    }

    const normalizedStatus = (status || 'SUCCESS').toUpperCase();
    const isSuccess = ['SUCCESS', 'COMPLETED', 'CONFIRMED', 'PAID', 'FINISHED'].includes(normalizedStatus);

    if (isSuccess) {
      const timestampNow = Date.now();

      await runTransaction(db, async (txn) => {
        const freshSnap = await txn.get(depositRef);
        if (!freshSnap.exists()) throw new Error('Deposit order missing.');
        const freshData = freshSnap.data();
        if (freshData.status === 'completed' || freshData.status === 'confirmed') {
          throw new Error('ALREADY_CREDITED');
        }

        txn.update(depositRef, {
          status: 'completed',
          credited: true,
          creditedAt: timestampNow,
          completedAt: timestampNow,
          paymentId: paymentId || utr || '',
          utr: utr || paymentId || '',
          gatewayPayload: payload,
          updatedAt: timestampNow
        });
      });

      const walletRes = await walletService.deposit(
        resolvedUserId,
        expectedAmount,
        {
          depositId: resolvedOrderId,
          paymentId: paymentId || utr || '',
          utr: utr || '',
          method: 'UPI',
          source: 'upi_webhook',
          description: `UPI Deposit Credited: ₹${expectedAmount} (UTR: ${utr || paymentId || 'N/A'})`
        },
        `upi_dep_${resolvedOrderId}`,
        db
      );

      await recordProviderSuccess('upi');

      await addPaymentLog(
        'success',
        'upi',
        `UPI Deposit ${resolvedOrderId} verified and credited: ₹${expectedAmount} to user ${resolvedUserId}.`,
        `PaymentId: ${paymentId || 'N/A'} | UTR: ${utr || 'N/A'}`
      );

      return res.status(200).json({
        success: true,
        message: 'UPI deposit verified and wallet credited successfully.',
        orderId: resolvedOrderId,
        userId: resolvedUserId,
        creditedAmount: expectedAmount,
        newBalance: walletRes.balanceAfter,
        status: 'completed'
      });
    } else {
      const newStatus = normalizedStatus.includes('CANCEL') ? 'cancelled' : 'failed';
      await updateDoc(depositRef, {
        status: newStatus,
        gatewayPayload: payload,
        updatedAt: Date.now()
      });

      await addPaymentLog(
        'warning',
        'upi',
        `UPI Deposit ${resolvedOrderId} failed/cancelled with status '${status}'.`,
        `Order: ${resolvedOrderId}`
      );

      return res.status(200).json({
        success: true,
        message: `Deposit updated to ${newStatus}.`,
        orderId: resolvedOrderId,
        status: newStatus
      });
    }

  } catch (err) {
    if (err.message === 'ALREADY_CREDITED') {
      return res.status(200).json({
        success: true,
        message: 'Duplicate payment ignored. Deposit already credited.'
      });
    }

    console.error('[UPI Webhook Processing Error]:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error processing UPI webhook.'
    });
  }
}
