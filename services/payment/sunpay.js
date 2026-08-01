import crypto from 'crypto';

/**
 * Sunpay Payment Gateway Service Driver
 * Handles Sunpay order creation, payment verification, and signature validation.
 */
export class SunpayService {
  constructor() {
    this.name = 'sunpay';
    this.apiKey = process.env.SUNPAY_API_KEY || '';
    this.secret = process.env.SUNPAY_SECRET || '';
    this.merchantId = process.env.SUNPAY_MERCHANT_ID || '';
    this.baseUrl = process.env.SUNPAY_BASE_URL || 'https://cashier.sunpaytm.quest';
  }

  /**
   * Generates MD5 signature for Sunpay API request
   * @param {Object} params - Key-value pair payload
   * @param {string} secretKey - Sunpay secret key
   * @returns {string} MD5 hex signature in lowercase
   */
  generateSignature(params, secretKey) {
    if (!params || typeof params !== 'object') return '';
    
    const sortedKeys = Object.keys(params).sort();
    const kvPairs = [];

    for (const key of sortedKeys) {
      if (
        key !== 'sign' && 
        key !== 'signature' && 
        params[key] !== '' && 
        params[key] !== null && 
        params[key] !== undefined
      ) {
        kvPairs.push(`${key}=${params[key]}`);
      }
    }

    const signString = kvPairs.join('&') + `&key=${secretKey}`;
    return crypto.createHash('md5').update(signString).digest('hex').toLowerCase();
  }

  /**
   * Initiates a deposit payment order with Sunpay
   * @param {Object} req - { userId, amount, currency, orderId, returnUrl, notifyUrl }
   * @returns {Promise<Object>} { success, depositId, paymentId, paymentUrl, amount, currency, status }
   */
  async createPayment({ userId, amount, currency = 'INR', orderId, returnUrl, notifyUrl }) {
    const merchantId = process.env.SUNPAY_MERCHANT_ID || this.merchantId || 'SUNPAY_MCH_DEMO';
    const apiKey = process.env.SUNPAY_API_KEY || this.apiKey;
    const secret = process.env.SUNPAY_SECRET || this.secret || 'sunpay_secret';
    const baseUrl = (process.env.SUNPAY_BASE_URL || this.baseUrl || 'https://cashier.sunpaytm.quest').replace(/\/+$/, '');

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error("Invalid deposit amount for Sunpay payment creation.");
    }

    const txnOrderId = orderId || `sun_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const formattedAmount = numAmount.toFixed(2);

    const payload = {
      mch_id: merchantId,
      out_trade_no: txnOrderId,
      amount: formattedAmount,
      currency: currency || 'INR',
      notify_url: notifyUrl || `${process.env.APP_URL || ''}/api/payment-webhook`,
      return_url: returnUrl || `${process.env.APP_URL || ''}/deposit`,
      timestamp: Math.floor(Date.now() / 1000).toString()
    };

    if (apiKey) {
      payload.api_key = apiKey;
    }

    const sign = this.generateSignature(payload, secret);
    payload.sign = sign;

    let paymentUrl = '';

    // If API credentials are set, attempt real Sunpay order creation API call
    if (process.env.SUNPAY_SECRET && process.env.SUNPAY_MERCHANT_ID) {
      try {
        const response = await fetch(`${baseUrl}/api/v1/order/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          const resData = await response.json();
          if (resData.success || resData.code === 200 || resData.pay_url || resData.paymentUrl) {
            paymentUrl = resData.pay_url || resData.paymentUrl || resData.data?.pay_url || resData.data?.paymentUrl;
          }
        } else {
          console.warn(`[Sunpay API] Response status ${response.status}:`, await response.text());
        }
      } catch (err) {
        console.warn("[Sunpay API] Endpoint unreachable, using standard Sunpay cashier gateway checkout URL:", err.message);
      }
    }

    // Standard Sunpay checkout/cashier URL format: https://cashier.sunpaytm.quest/pay/{payment_id}
    if (!paymentUrl) {
      paymentUrl = `${baseUrl}/pay/${txnOrderId}`;
    }

    return {
      success: true,
      depositId: txnOrderId,
      paymentId: txnOrderId,
      paymentUrl,
      amount: numAmount,
      currency: currency || 'INR',
      provider: 'sunpay',
      status: 'pending'
    };
  }

  /**
   * Queries Sunpay order status
   * @param {string} orderId 
   */
  async verifyPayment(orderId) {
    const merchantId = process.env.SUNPAY_MERCHANT_ID || this.merchantId;
    const secret = process.env.SUNPAY_SECRET || this.secret;
    const baseUrl = (process.env.SUNPAY_BASE_URL || this.baseUrl).replace(/\/+$/, '');

    const payload = {
      mch_id: merchantId,
      out_trade_no: orderId,
      timestamp: Math.floor(Date.now() / 1000).toString()
    };
    payload.sign = this.generateSignature(payload, secret);

    try {
      const response = await fetch(`${baseUrl}/api/v1/order/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          status: data.status || data.trade_status || data.data?.status || 'pending',
          raw: data
        };
      }
    } catch (e) {
      console.warn("[Sunpay verifyPayment] Query failed:", e.message);
    }

    return { success: false, status: 'unknown' };
  }

  /**
   * Processes and validates an incoming Sunpay Webhook
   * @param {Object} headers 
   * @param {Object} body 
   */
  processWebhook(headers, body) {
    if (!body || typeof body !== 'object') {
      return { isValid: false, error: 'Invalid or missing webhook body' };
    }

    const secret = process.env.SUNPAY_SECRET || this.secret;
    const receivedSign = body.sign || body.signature;

    if (receivedSign && secret) {
      const computedSign = this.generateSignature(body, secret);
      if (computedSign.toLowerCase() !== String(receivedSign).toLowerCase()) {
        console.warn(`[Sunpay Webhook] Signature mismatch. Expected ${computedSign}, got ${receivedSign}`);
        return { isValid: false, error: 'Signature verification failed' };
      }
    }

    const orderId = body.out_trade_no || body.orderId || body.depositId || body.mch_order_no;
    const amount = Number(body.amount || body.pay_amount || 0);
    const statusRaw = String(body.status || body.trade_status || '').toLowerCase();

    const isConfirmed = ['success', '1', 'confirmed', 'completed', 'paid', 'trade_success'].includes(statusRaw);

    return {
      isValid: true,
      orderId,
      amount,
      status: isConfirmed ? 'confirmed' : statusRaw,
      raw: body
    };
  }
}

export const sunpayService = new SunpayService();
export default sunpayService;
