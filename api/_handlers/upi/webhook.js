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

/**
 * Helper to verify HMAC-SHA256 signature
 */
function verifyHmacSignature(payload, secretKey, receivedSignature) {
  if (!receivedSignature || !secretKey) return false;

  let payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secretKey).update(payloadStr).digest('hex');

  const { orderId, depositId, amount, status } = payload || {};
  const resId = orderId || depositId || '';
  const fieldsStr = `${resId}:${amount}:${status}`;
  const fieldsHmac = crypto.createHmac('sha256', secretKey).update(fieldsStr).digest('hex');

  try {
    const bufReceived = Buffer.from(receivedSignature.toLowerCase());
    const bufHmac = Buffer.from(hmac.toLowerCase());
    const bufFieldsHmac = Buffer.from(fieldsHmac.toLowerCase());

    if (bufReceived.length === bufHmac.length && crypto.timingSafeEqual(bufReceived, bufHmac)) {
      return true;
    }
    if (bufReceived.length === bufFieldsHmac.length && crypto.timingSafeEqual(bufReceived, bufFieldsHmac)) {
      return true;
    }
  } catch (e) {
    return false;
  }
  return false;
}

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

    // Load payment settings or environment secret for security validation
    const envSecret = process.env.UPI_WEBHOOK_SECRET || process.env.UPI_SECRET;
    let expectedSecret = envSecret;
    if (!expectedSecret) {
      try {
        const settings = await getPaymentSettings();
        expectedSecret = settings?.upiSettings?.webhookSecret || settings?.upiSettings?.secret;
      } catch (e) {
        // Safe fallback if Firestore config is unreachable
      }
    }

    // TASK 2: Webhook Security (x-upi-secret validation & HMAC SHA-256 signature verification)
    if (expectedSecret) {
      const headerSecret = req.headers['x-upi-secret'] || secret;
      const headerSignature = req.headers['x-signature'] || signature;

      let isSecretValid = false;
      let isSignatureValid = false;

      if (headerSecret && headerSecret === expectedSecret) {
        isSecretValid = true;
      }

      if (headerSignature && verifyHmacSignature(payload, expectedSecret, headerSignature)) {
        isSignatureValid = true;
      }

      if (!isSecretValid && !isSignatureValid) {
        console.error('[UPI Webhook Security Error]: Invalid or missing webhook secret/signature.');
        await recordProviderFailure('upi', 'Invalid UPI webhook secret or signature.').catch(() => {});
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Invalid webhook secret token or HMAC signature.'
        });
      }
    }

    // TASK 4: Deposit Validation
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

    // Verify Currency is INR
    if (depositData.currency && depositData.currency.toUpperCase() !== 'INR') {
      console.error(`[UPI Webhook Error]: Currency mismatch for order '${resolvedOrderId}'. Deposit currency: ${depositData.currency}`);
      return res.status(400).json({
        success: false,
        error: `Invalid deposit currency '${depositData.currency}'. Only INR is supported for UPI deposits.`
      });
    }

    // Verify User ID exists
    const resolvedUserId = depositData.userId || depositData.playerId || userId;
    if (!resolvedUserId) {
      console.error(`[UPI Webhook Error]: User ID not found for deposit order '${resolvedOrderId}'.`);
      return res.status(400).json({
        success: false,
        error: 'User ID not associated with this deposit order.'
      });
    }

    // Verify Amount matches order amount
    const expectedAmount = Number(depositData.amount);
    const receivedAmount = amount !== undefined && amount !== null ? Number(amount) : expectedAmount;

    if (isNaN(receivedAmount) || Math.abs(expectedAmount - receivedAmount) > 0.01) {
      console.error(`[UPI Webhook Error]: Amount mismatch. Expected ₹${expectedAmount}, Received ₹${receivedAmount}`);
      return res.status(400).json({
        success: false,
        error: `Amount mismatch. Expected ₹${expectedAmount}, received ₹${receivedAmount}.`
      });
    }

    // TASK 3: Idempotency Protection for completed deposits
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

      // Atomically update deposit record state in Firestore
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

      // TASK 3: Atomic Wallet Credit via walletService.deposit with idempotency key `upi_${depositId}`
      const idempotencyKey = `upi_${resolvedOrderId}`;
      const walletRes = await walletService.deposit(
        resolvedUserId,
        expectedAmount,
        {
          depositId: resolvedOrderId,
          paymentId: paymentId || utr || '',
          utr: utr || '',
          method: 'UPI',
          source: 'upi_webhook',
          currency: 'INR',
          description: `UPI Deposit Credited: ₹${expectedAmount} (UTR: ${utr || paymentId || 'N/A'})`
        },
        idempotencyKey,
        db
      );

      await recordProviderSuccess('upi').catch(() => {});

      await addPaymentLog(
        'success',
        'upi',
        `UPI Deposit ${resolvedOrderId} verified and credited: ₹${expectedAmount} to user ${resolvedUserId}.`,
        `PaymentId: ${paymentId || 'N/A'} | UTR: ${utr || 'N/A'}`
      ).catch(() => {});

      return res.status(200).json({
        success: true,
        message: 'UPI deposit verified and wallet credited successfully.',
        orderId: resolvedOrderId,
        userId: resolvedUserId,
        creditedAmount: expectedAmount,
        newBalance: walletRes.balanceAfter,
        duplicate: !!walletRes.duplicate,
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
      ).catch(() => {});

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

