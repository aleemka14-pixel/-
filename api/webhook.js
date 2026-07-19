import crypto from 'crypto';
import { 
  db, 
  getPaymentSettings, 
  recordProviderFailure, 
  recordProviderSuccess,
  addPaymentLog
} from './payment-service.js';
import { doc, getDoc, runTransaction, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';

/**
 * Helper to recursively sort keys of an object alphabetically for NOWPayments IPN signature verification.
 */
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

/**
 * Verifies the NOWPayments IPN signature using HMAC-SHA512.
 */
function verifyNowPaymentsSignature(headers, payload, ipnSecret) {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!ipnSecret) {
    if (isProduction) {
      console.error("[Errors] Signature verification failed: NOWPAYMENTS_IPN_SECRET is missing in production environment.");
      return false;
    }
    console.warn("[Security Warning] NOWPAYMENTS_IPN_SECRET is not configured on the server. Webhook signature checking is bypassed in local/dev environments.");
    return true;
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
 * Vercel Serverless Function: Webhook
 * 
 * Handles production-ready Instant Payment Notifications (IPN) sent by the NOWPayments gateway.
 */
export default async function handler(req, res) {
  // 1. Accept POST requests only
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} Not Allowed. Webhooks only accept POST requests.`
    });
  }

  try {
    // 3. Parse the webhook payload securely
    const payload = req.body;
    
    // 9. Add comprehensive logging for: Webhook received
    console.log("[Webhook received] Received NOWPayments IPN webhook payload:", JSON.stringify(payload));

    if (!payload || Object.keys(payload).length === 0) {
      console.error("[Errors] Missing request payload.");
      return res.status(400).json({
        success: false,
        error: "Missing request payload."
      });
    }

    const {
      payment_id,       // NOWPayments transaction unique ID
      payment_status,   // Current state of the transaction (e.g., 'finished', 'failed', 'expired', 'waiting', 'confirming', 'confirmed', 'refunded')
      price_amount,     // Original pricing amount requested
      actually_paid,    // Amount the customer actually transferred to the gateway
      order_id          // Custom order reference passed during payment creation (matching depositId)
    } = payload;

    if (!payment_id) {
      console.error("[Errors] Missing payment_id identifier in payload.");
      return res.status(400).json({
        success: false,
        error: "Missing payment_id in request payload."
      });
    }

    // Fetch config for database fallback secret
    const settings = await getPaymentSettings();
    const providerConfig = settings.providers.nowpayments;

    // Determine the IPN secret from environment variable (preferred) or DB fallback
    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET || (providerConfig && providerConfig.credentials && providerConfig.credentials.ipnSecret);

    // 2. Verify every webhook using the official NOWPayments IPN signature
    const isAuthenticated = verifyNowPaymentsSignature(req.headers, payload, ipnSecret);

    if (!isAuthenticated) {
      console.error("[Errors] Signature verification failed.");
      await recordProviderFailure('nowpayments', 'NOWPayments webhook IPN signature validation failed.');
      return res.status(401).json({
        success: false,
        error: "Signature verification failed."
      });
    }

    // 9. Add comprehensive logging for: Signature verified
    console.log("[Signature verified] NOWPayments IPN signature matched and verified successfully.");

    // 4. Find the matching deposit using payment_id stored in Firebase
    let depositSnap = null;
    let depositDoc = null;

    // Search by paymentId field matching payment_id
    const qPaymentId = query(collection(db, 'deposits'), where('paymentId', '==', payment_id));
    const snapPaymentId = await getDocs(qPaymentId);
    if (!snapPaymentId.empty) {
      depositSnap = snapPaymentId.docs[0];
      depositDoc = depositSnap.data();
    }

    // Fallback: search by depositId matching order_id
    if (!depositDoc && order_id) {
      const qOrderId = query(collection(db, 'deposits'), where('depositId', '==', order_id));
      const snapOrderId = await getDocs(qOrderId);
      if (!snapOrderId.empty) {
        depositSnap = snapOrderId.docs[0];
        depositDoc = snapOrderId.docs[0].data();
      }
    }

    // Fallback: search by direct document ID matching order_id
    if (!depositDoc && order_id) {
      const directDocRef = doc(db, 'deposits', order_id);
      const directSnap = await getDoc(directDocRef);
      if (directSnap.exists()) {
        depositSnap = directSnap;
        depositDoc = directSnap.data();
      }
    }

    // Fallback: search by direct document ID matching payment_id
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

    // 9. Add comprehensive logging for: Deposit found
    const depositId = depositDoc.depositId || depositSnap.id;
    const playerId = depositDoc.playerId || depositDoc.userId;
    console.log(`[Deposit found] Matching deposit found: ${depositId} | Player: ${playerId} | Amount: ${depositDoc.amount} | Status: ${depositDoc.status}`);

    // 5. Handle payment statuses: waiting, confirming, confirmed, finished, failed, expired, refunded
    const validStatuses = ['waiting', 'confirming', 'confirmed', 'finished', 'failed', 'expired', 'refunded'];
    if (!validStatuses.includes(payment_status)) {
      console.warn(`[Security Warning] Unrecognized payment status received: ${payment_status}`);
    }

    // 6a. Validate payment amount: ensure price_amount matches what was originally requested
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

    // 6b. Validate currency/network: prevent network or currency tampering
    const expectedNetwork = (depositDoc.network || depositDoc.method || '').toUpperCase();
    const receivedCurrency = (payload.pay_currency || '').toUpperCase();
    console.log(`[Verification] Validating currency/network: Expected Network: ${expectedNetwork} | Received Pay Currency: ${receivedCurrency}`);

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

    console.log("[Verification] Webhook payload signature, amount, and network successfully validated.");

    // 4. Prevent duplicate transactions: Check transaction ID before processing
    const txnId = `TXN-NOW-${payment_id}`;
    const txnRef = doc(db, 'transactions', txnId);
    const txnSnap = await getDoc(txnRef);
    if (txnSnap.exists()) {
      console.log(`[Duplicate webhook ignored] Webhook ignored because transactionId ${payment_id} already exists in transactions ledger.`);
      return res.status(200).json({
        success: true,
        message: "Duplicate webhook delivery ignored. Transaction already processed.",
        payment_id,
        status: payment_status
      });
    }

    // Protect against duplicate credit checks on deposit status
    if (depositDoc.status === 'completed' || depositDoc.status === 'confirmed' || depositDoc.credited === true) {
      console.log(`[Duplicate webhook ignored] Webhook ignored for payment_id: ${payment_id} because deposit ${depositId} has already been credited.`);
      return res.status(200).json({
        success: true,
        message: "Duplicate webhook delivery ignored. Deposit has already been credited.",
        payment_id,
        status: payment_status
      });
    }

    // 3. Implement payment status handling rules:
    // - Add user balance ONLY when payment status is confirmed/finished.
    // - Never add balance for waiting, confirming, failed, or expired payments.
    const isCreditingStatus = payment_status === 'confirmed' || payment_status === 'finished';

    if (isCreditingStatus) {
      const playerRef = doc(db, 'players', playerId);
      const userRef = doc(db, 'users', playerId);
      const depositRef = doc(db, 'deposits', depositSnap.id);
      const timestampNow = Date.now();
      let updatedBalance = 0;
      let balanceBefore = 0;

      try {
        // Run atomic Firebase transaction
        await runTransaction(db, async (transaction) => {
          const freshPlayerSnap = await transaction.get(playerRef);
          const freshDepositSnap = await transaction.get(depositRef);

          if (!freshPlayerSnap.exists()) {
            throw new Error(`Player document with ID '${playerId}' does not exist.`);
          }

          if (!freshDepositSnap.exists()) {
            throw new Error(`Deposit document with ID '${depositSnap.id}' does not exist.`);
          }

          const freshDepositData = freshDepositSnap.data();
          // Idempotency check inside the transaction block
          if (freshDepositData.status === 'completed' || freshDepositData.status === 'confirmed' || freshDepositData.credited === true) {
            throw new Error("ALREADY_CREDITED");
          }

          const playerData = freshPlayerSnap.data();
          balanceBefore = playerData.balance || 0;

          // Sync check with the 'users' collection to use the latest balance
          const freshUserSnap = await transaction.get(userRef);
          if (freshUserSnap.exists()) {
            balanceBefore = freshUserSnap.data().balance ?? freshUserSnap.data().walletBalance ?? balanceBefore;
          }

          const dbAmount = Number(freshDepositData.amount);
          updatedBalance = balanceBefore + dbAmount;

          // Increase the user's wallet balance exactly once
          transaction.update(playerRef, { balance: updatedBalance });

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

          // Mark the deposit as credited & store requested fields
          transaction.update(depositRef, {
            status: 'completed',
            credited: true,
            creditedAt: timestampNow,
            transactionHash: payload.txn_id || payload.transaction_hash || payment_id || '',
            payment_status: payment_status,
            updatedAt: timestampNow
          });

          // 5. Store complete payment history in Firestore
          const transactionDoc = {
            id: txnId,
            transactionId: payment_id.toString(),
            playerId: playerId,
            userId: playerId,
            type: 'deposit',
            action: 'deposit',
            amount: dbAmount,
            balanceBefore: balanceBefore,
            balanceAfter: updatedBalance,
            referenceId: depositSnap.id,
            network: expectedNetwork,
            status: 'completed',
            transactionHash: payload.txn_id || payload.transaction_hash || payment_id || '',
            timestamp: timestampNow,
            createdAt: depositDoc.createdAt || depositDoc.timestamp || timestampNow,
            updatedAt: timestampNow,
            completedAt: timestampNow,
            
            // Required ledger fields
            paymentId: payment_id.toString(),
            orderId: order_id || depositDoc.depositId || depositSnap.id || '',
            payAmount: Number(actually_paid || payload.pay_amount || dbAmount),
            currency: payload.pay_currency || payload.price_currency || depositDoc.currency || 'USDT',
            walletAddress: payload.pay_address || depositDoc.walletAddress || '',
            paymentStatus: payment_status,
            paymentProvider: 'NOWPayments'
          };

          transaction.set(txnRef, transactionDoc);
        });

        // 7. Balance updated log (shows previous balance, added amount, and new balance)
        console.log(`[Balance updated] Player ${playerId} wallet balance successfully updated from ${balanceBefore} to ${updatedBalance} (+${depositDoc.amount}).`);

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
          console.log(`[Duplicate webhook ignored] Concurrent request duplicate ignored for payment_id: ${payment_id}`);
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

    // 3b. Non-crediting statuses handling: waiting, confirming, failed, expired, refunded
    const depositRef = doc(db, 'deposits', depositSnap.id);
    let mappedStatus = 'pending'; // default for waiting, confirming

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

    console.log(`[Deposit updated] Deposit ${depositId} updated to mapped status: ${mappedStatus} (payment_status: ${payment_status})`);

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
    // 9. Add comprehensive logging for: Errors
    console.error("[Errors] Webhook processing failed with error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}
