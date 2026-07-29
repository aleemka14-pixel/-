import crypto from 'crypto';
import { 
  db, 
  getPaymentSettings, 
  recordProviderFailure, 
  recordProviderSuccess,
  addPaymentLog
} from '../_services/payment-service.js';
import { doc, getDoc, runTransaction, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import walletService from '../../services/wallet-service.js';

function sortObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj = {};
  for (const key of sortedKeys) {
    sortedObj[key] = sortObject(obj[key]);
  }
  return sortedObj;
}

function verifyNowPaymentsSignature(headers, payload, ipnSecret) {
  if (!ipnSecret) {
    console.error("[Errors] Signature verification failed: NOWPAYMENTS_IPN_SECRET (or DB ipnSecret) is missing.");
    return false;
  }

  const signature = headers['x-nowpayments-sig'] || headers['np-sig'];
  if (!signature) {
    console.error("[Errors] Signature verification failed: Missing signature header (x-nowpayments-sig or np-sig).");
    return false;
  }

  try {
    const sortedPayload = sortObject(payload);
    const stringifiedPayload = JSON.stringify(sortedPayload);

    const calculatedSignature = crypto.createHmac('sha512', ipnSecret)
      .update(stringifiedPayload)
      .digest('hex');

    return calculatedSignature === signature;
  } catch (e) {
    console.error('[Errors] NOWPayments webhook signature computation failed:', e);
    return false;
  }
}

/**
 * Vercel Serverless Function Handler: webhook
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
      error: `Method ${req.method} Not Allowed. Webhooks only accept POST requests.`
    });
  }

  try {
    const payload = req.body;
    console.log("[Webhook received] Received NOWPayments IPN webhook payload:", JSON.stringify(payload));

    if (!payload || Object.keys(payload).length === 0) {
      console.error("[Errors] Missing request payload.");
      return res.status(400).json({
        success: false,
        error: "Missing request payload."
      });
    }

    const {
      payment_id,
      payment_status,
      price_amount,
      actually_paid,
      order_id
    } = payload;

    if (!payment_id) {
      console.error("[Errors] Missing payment_id identifier in payload.");
      return res.status(400).json({
        success: false,
        error: "Missing payment_id in request payload."
      });
    }

    const settings = await getPaymentSettings();
    const providerConfig = settings.providers.nowpayments;
    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET || (providerConfig && providerConfig.credentials && providerConfig.credentials.ipnSecret);

    const isAuthenticated = verifyNowPaymentsSignature(req.headers, payload, ipnSecret);

    if (!isAuthenticated) {
      console.error("[Errors] Signature verification failed.");
      await recordProviderFailure('nowpayments', 'NOWPayments webhook IPN signature validation failed.');
      return res.status(401).json({
        success: false,
        error: "Signature verification failed."
      });
    }

    console.log("[Signature verified] NOWPayments IPN signature matched and verified successfully.");

    let depositSnap = null;
    let depositDoc = null;

    const qPaymentId = query(collection(db, 'deposits'), where('paymentId', '==', payment_id));
    const snapPaymentId = await getDocs(qPaymentId);
    if (!snapPaymentId.empty) {
      depositSnap = snapPaymentId.docs[0];
      depositDoc = depositSnap.data();
    }

    if (!depositDoc && order_id) {
      const qOrderId = query(collection(db, 'deposits'), where('depositId', '==', order_id));
      const snapOrderId = await getDocs(qOrderId);
      if (!snapOrderId.empty) {
        depositSnap = snapOrderId.docs[0];
        depositDoc = snapOrderId.docs[0].data();
      }
    }

    if (!depositDoc && order_id) {
      const directDocRef = doc(db, 'deposits', order_id);
      const directSnap = await getDoc(directDocRef);
      if (directSnap.exists()) {
        depositSnap = directSnap;
        depositDoc = directSnap.data();
      }
    }

    if (!depositDoc && payment_id) {
      const directDocRef = doc(db, 'deposits', payment_id);
      const directSnap = await getDoc(directDocRef);
      if (directSnap.exists()) {
        depositSnap = directSnap;
        depositDoc = directSnap.data();
      }
    }

    if (!depositDoc) {
      console.error(`[Errors] Deposit request with payment_id/order_id '${payment_id || order_id}' was not found in the database.`);
      return res.status(404).json({
        success: false,
        error: `Deposit request with ID '${payment_id || order_id}' was not found.`
      });
    }

    const depositId = depositDoc.depositId || depositSnap.id;
    const playerId = depositDoc.playerId || depositDoc.userId;
    console.log(`[Deposit found] Matching deposit found: ${depositId} | Player: ${playerId} | Amount: ${depositDoc.amount} | Status: ${depositDoc.status}`);

    const expectedAmount = Number(depositDoc.amount);
    const webhookPriceAmount = Number(price_amount);
    if (isNaN(webhookPriceAmount) || Math.abs(expectedAmount - webhookPriceAmount) > 0.01) {
      console.error(`[Errors] Webhook amount validation failed. Expected: ${expectedAmount}, Received in IPN price_amount: ${webhookPriceAmount}`);
      await recordProviderFailure('nowpayments', 'NOWPayments webhook IPN amount mismatch validation failure.');
      return res.status(400).json({
        success: false,
        error: "Validation failed: Deposit amount mismatch."
      });
    }

    const expectedNetwork = (depositDoc.network || depositDoc.method || '').toUpperCase();
    const receivedCurrency = (payload.pay_currency || '').toUpperCase();

    let isNetworkValid = true;
    if (expectedNetwork === 'BTC' || expectedNetwork === 'BITCOIN') {
      if (receivedCurrency !== 'BTC') isNetworkValid = false;
    } else if (expectedNetwork === 'SOL' || expectedNetwork === 'SOLANA') {
      if (receivedCurrency !== 'SOL') isNetworkValid = false;
    } else if (expectedNetwork === 'LTC' || expectedNetwork === 'LITECOIN') {
      if (receivedCurrency !== 'LTC') isNetworkValid = false;
    } else if (expectedNetwork === 'TRC20') {
      if (receivedCurrency !== 'USDT' && receivedCurrency !== 'USDTTRC20' && receivedCurrency !== 'TRX') isNetworkValid = false;
    } else if (expectedNetwork === 'ERC20') {
      if (receivedCurrency !== 'USDT' && receivedCurrency !== 'USDTERC20' && receivedCurrency !== 'ETH') isNetworkValid = false;
    } else if (expectedNetwork === 'BEP20') {
      if (receivedCurrency !== 'USDT' && receivedCurrency !== 'USDTBEP20' && receivedCurrency !== 'BNB') isNetworkValid = false;
    }

    if (!isNetworkValid) {
      console.error(`[Errors] Webhook currency/network validation failed. Expected Network: ${expectedNetwork}, Received Pay Currency: ${receivedCurrency}`);
      await recordProviderFailure('nowpayments', 'NOWPayments webhook IPN network/currency mismatch validation failure.');
      return res.status(400).json({
        success: false,
        error: "Validation failed: Network/currency mismatch."
      });
    }

    const txnId = `TXN-NOW-${payment_id}`;
    const txnRef = doc(db, 'transactions', txnId);
    const txnSnap = await getDoc(txnRef);
    if (txnSnap.exists()) {
      return res.status(200).json({
        success: true,
        message: "Duplicate webhook delivery ignored. Transaction already processed.",
        payment_id,
        status: payment_status
      });
    }

    if (depositDoc.status === 'completed' || depositDoc.status === 'confirmed' || depositDoc.credited === true) {
      return res.status(200).json({
        success: true,
        message: "Duplicate webhook delivery ignored. Deposit has already been credited.",
        payment_id,
        status: payment_status
      });
    }

    const isCreditingStatus = payment_status === 'confirmed' || payment_status === 'finished';

    if (isCreditingStatus) {
      const depositRef = doc(db, 'deposits', depositSnap.id);
      const timestampNow = Date.now();
      let updatedBalance = 0;

      try {
        let dbAmount = 0;
        await runTransaction(db, async (transaction) => {
          const freshDepositSnap = await transaction.get(depositRef);
          if (!freshDepositSnap.exists()) {
            throw new Error(`Deposit document with ID '${depositSnap.id}' does not exist.`);
          }
          const freshDepositData = freshDepositSnap.data();
          if (freshDepositData.status === 'completed' || freshDepositData.status === 'confirmed' || freshDepositData.credited === true) {
            throw new Error("ALREADY_CREDITED");
          }
          dbAmount = Number(freshDepositData.amount || 0);

          transaction.update(depositRef, {
            status: 'completed',
            credited: true,
            creditedAt: timestampNow,
            transactionHash: payload.txn_id || payload.transaction_hash || payment_id || '',
            payment_status: payment_status,
            updatedAt: timestampNow
          });
        });

        const walletRes = await walletService.deposit(
          playerId,
          dbAmount,
          {
            depositId: depositSnap.id,
            payment_id: String(payment_id),
            network: expectedNetwork,
            transactionHash: payload.txn_id || payload.transaction_hash || payment_id || '',
            source: 'webhook',
            description: `Deposit Credited: ${dbAmount} USDT (${expectedNetwork})`
          },
          `dep_${depositSnap.id}`,
          db
        );
        updatedBalance = walletRes.balanceAfter;

        await recordProviderSuccess('nowpayments');

        await addPaymentLog(
          'success',
          'nowpayments',
          `NOWPayments Webhook Completed: Deposit '${depositId}' successfully verified and confirmed. Credited ${depositDoc.amount} to player '${playerId}'. Status: ${payment_status}`,
          `PaymentId: ${payment_id} | Paid: ${actually_paid || 'N/A'}`
        );

        return res.status(200).json({
          success: true,
          message: "Transaction processed successfully, wallet balance credited.",
          payment_id,
          status: payment_status
        });

      } catch (txError) {
        if (txError.message === 'ALREADY_CREDITED') {
          return res.status(200).json({
            success: true,
            message: "Duplicate payment ignored. Deposit already credited.",
            payment_id,
            status: payment_status
          });
        }
        throw txError;
      }
    }

    const depositRef = doc(db, 'deposits', depositSnap.id);
    let mappedStatus = 'pending';

    if (payment_status === 'failed' || payment_status === 'expired') {
      mappedStatus = 'rejected';
    } else if (payment_status === 'refunded') {
      mappedStatus = 'refunded';
    }

    await updateDoc(depositRef, {
      status: mappedStatus,
      payment_status: payment_status,
      updatedAt: Date.now(),
      transactionHash: payload.txn_id || payload.transaction_hash || ''
    });

    await addPaymentLog(
      'info',
      'nowpayments',
      `NOWPayments Webhook Update: Deposit '${depositId}' status set to '${payment_status}'.`,
      `PaymentId: ${payment_id}`
    );

    return res.status(200).json({
      success: true,
      message: `Deposit updated to payment status: ${payment_status}`,
      payment_id,
      status: payment_status
    });

  } catch (error) {
    console.error("[Errors] Webhook processing failed with error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}
