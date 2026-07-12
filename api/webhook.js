import crypto from 'crypto';

/**
 * Helper function to sort the keys of an object alphabetically.
 * NOWPayments IPN verification requires the request payload keys to be sorted
 * alphabetically and then stringified to build the HMAC-SHA512 check.
 * 
 * @param {any} obj - The request payload object to sort.
 * @returns {any} - Sorted object or primitive value.
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
 * Vercel Serverless Function: Webhook
 * 
 * Purpose:
 * Handles Instant Payment Notifications (IPN) and webhooks sent by the NOWPayments payment gateway.
 * Processes payment transactions securely using the signature header and updates corresponding user order details.
 */
export default async function handler(req, res) {
  // 1. Accept only POST requests (Method Security Guard)
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} Not Allowed. Webhooks only accept POST requests.`
    });
  }

  try {
    const payload = req.body;
    
    // Retrieve the signature from NOWPayments headers
    // Usually sent as 'x-nowpayments-sig'
    const signature = req.headers['x-nowpayments-sig'] || req.headers['np-sig'];

    // Verify request payload is not empty
    if (!payload || Object.keys(payload).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Missing request payload."
      });
    }

    // 2. Webhook Signature Verification (IPN Security Guard)
    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;

    if (!ipnSecret) {
      console.warn("WARNING: NOWPAYMENTS_IPN_SECRET is missing from environment variables. Skipping signature verification (Not recommended for Production).");
    } else {
      if (!signature) {
        return res.status(400).json({
          success: false,
          error: "Verification header 'x-nowpayments-sig' is missing."
        });
      }

      // Recreate signature as described in NOWPayments IPN integration specs:
      // A. Sort the payload keys alphabetically
      const sortedPayload = sortObject(payload);

      // B. Stringify sorted object back to JSON
      const stringifiedPayload = JSON.stringify(sortedPayload);

      // C. Calculate HMAC-SHA512 signature using IPN Secret Key
      const hmac = crypto.createHmac('sha512', ipnSecret);
      hmac.update(stringifiedPayload);
      const calculatedSignature = hmac.digest('hex');

      // D. Securely compare signature with constant-time equality
      const signatureBuffer = Buffer.from(signature, 'utf-8');
      const calculatedBuffer = Buffer.from(calculatedSignature, 'utf-8');

      let isSignatureValid = false;
      // timingSafeEqual requires buffers to be of identical length to avoid TypeError
      if (signatureBuffer.length === calculatedBuffer.length) {
        isSignatureValid = crypto.timingSafeEqual(calculatedBuffer, signatureBuffer);
      }

      if (!isSignatureValid) {
        console.error("CRITICAL: Webhook signature verification failed. Possible fraud attempt.");
        return res.status(401).json({
          success: false,
          error: "Signature verification failed."
        });
      }
    }

    // 3. Extract and inspect important payment fields from NOWPayments payload
    const {
      payment_id,       // NOWPayments transaction unique ID
      payment_status,   // Current state of the transaction (e.g. 'finished', 'failed', 'waiting')
      price_amount,     // Original fiat/crypto pricing amount requested
      price_currency,   // Original currency requested (e.g., 'USD', 'EUR')
      pay_currency,     // Real crypto coin selected for payment (e.g., 'USDTTRC20', 'BTC')
      actually_paid,    // Amount the customer actually transferred to the gateway
      order_id          // Custom order reference passed during payment creation
    } = payload;

    console.log(`[NOWPayments Webhook Received] ID: ${payment_id} | Status: ${payment_status} | Order: ${order_id || 'N/A'}`);

    // 4. Handle different payment status transitions
    switch (payment_status) {
      case 'finished': {
        // Payment successfully verified, settled, and complete!
        console.log(`SUCCESS: Payment finalized for Order ID ${order_id || 'N/A'}. Received ${actually_paid} ${pay_currency}.`);

        // ==========================================
        // TODO: Update your persistent database here
        // ==========================================
        // Example database transaction:
        // - Fetch order records associated with order_id or payment_id
        // - Credit corresponding user's balance with the paid amount / items
        // - Mark the payment or deposit invoice as "COMPLETED"
        // 
        // Example implementation with Firestore:
        // const orderRef = doc(db, 'deposits', order_id);
        // await updateDoc(orderRef, { status: 'completed', paymentId: payment_id, actualAmount: actually_paid, updatedAt: Date.now() });

        return res.status(200).json({
          success: true,
          message: "Transaction processed successfully.",
          payment_id,
          status: payment_status
        });
      }

      case 'failed':
      case 'expired': {
        // Payment was failed by the provider, canceled, or expired due to timeout
        console.warn(`FAILED: Payment for Order ID ${order_id || 'N/A'} was marked as '${payment_status}'.`);

        // ==========================================
        // TODO: Update database for failed orders
        // ==========================================
        // Example Firestore:
        // const orderRef = doc(db, 'deposits', order_id);
        // await updateDoc(orderRef, { status: 'failed', updatedAt: Date.now() });

        return res.status(200).json({
          success: true,
          message: `Transaction terminated with status: ${payment_status}.`,
          payment_id,
          status: payment_status
        });
      }

      case 'waiting':
      case 'confirming':
      case 'confirmed': {
        // Payment process is active, but currently awaiting coin arrival or block confirmations
        console.log(`PENDING: Order ID ${order_id || 'N/A'} is currently in '${payment_status}' status.`);

        // ==========================================
        // TODO: Update database status as pending
        // ==========================================
        // Example Firestore:
        // const orderRef = doc(db, 'deposits', order_id);
        // await updateDoc(orderRef, { status: 'pending_confirmation', lastStatus: payment_status });

        return res.status(200).json({
          success: true,
          message: `Transaction is currently pending (${payment_status}).`,
          payment_id,
          status: payment_status
        });
      }

      default: {
        // Handles generic non-terminal states (e.g. 'refunded', 'partially_paid')
        console.log(`INFO: Order ID ${order_id || 'N/A'} received status: '${payment_status}'.`);
        
        return res.status(200).json({
          success: true,
          message: `Received payload status update: ${payment_status}.`,
          payment_id,
          status: payment_status
        });
      }
    }

  } catch (error) {
    console.error("CRITICAL: Error inside webhook serverless function:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}
