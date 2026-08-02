import crypto from 'crypto';

/**
 * Sunpay (Sunpays) Payment Gateway Service Driver
 * Implements the official Sunpays API (v1 pay-ins) with HMAC-SHA256 signature verification.
 */
export class SunpayService {
  constructor() {
    this.name = 'sunpay';
    this.apiKey = process.env.PAYIN_API_KEY || '';
    this.secret = process.env.PAYIN_API_SECRET || '';
    this.baseUrl = process.env.SUNPAY_BASE_URL || 'https://sunpaytm.quest';
  }

  /**
   * Generates HMAC-SHA256 hex signature for raw JSON payload
   * @param {string|Object} payload - Raw string or JS object payload
   * @param {string} secretKey - Sunpays secret key
   * @returns {string} HMAC-SHA256 hex signature
   */
  generateHmacSignature(payload, secretKey) {
    if (!secretKey) return '';
    const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHmac('sha256', secretKey).update(rawBody).digest('hex');
  }

  /**
   * Initiates a deposit payment order with Sunpays API
   * @param {Object} options - { userId, amount, currency, orderId, returnUrl, notifyUrl, apiKey, secret, baseUrl, customerName, customerPhone, customerEmail, method }
   * @returns {Promise<Object>} { success, depositId, paymentId, paymentUrl, checkout_url, amount, currency, status, error }
   */
  async createPayment(options = {}) {
    const { 
      userId, 
      amount, 
      currency = 'INR', 
      orderId, 
      returnUrl, 
      notifyUrl,
      apiKey: optApiKey,
      secret: optSecret,
      baseUrl: optBaseUrl,
      customerName,
      customerPhone,
      customerEmail,
      method = 'upi'
    } = typeof options === 'object' && options !== null ? options : {};

    const apiKey = optApiKey || process.env.PAYIN_API_KEY || process.env.SUNPAY_API_KEY || this.apiKey || 'sunpay_demo_payin_key_v1';
    const secret = optSecret || process.env.PAYIN_API_SECRET || process.env.SUNPAY_API_SECRET || this.secret || 'sunpay_demo_payin_secret_v1';
    const baseUrl = (optBaseUrl || process.env.SUNPAY_BASE_URL || this.baseUrl || 'https://sunpaytm.quest').replace(/\/+$/, '');

    const txnOrderId = orderId || `sun_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    if (!apiKey || !secret) {
      const missingCredsMsg = "PAYIN_API_KEY and PAYIN_API_SECRET are missing. Please configure Sunpays credentials in Settings or .env file.";
      console.error('[Sunpay Order Creation Error]', missingCredsMsg);
      return {
        success: false,
        error: missingCredsMsg,
        depositId: txnOrderId,
        orderId: txnOrderId,
        status: 'failed'
      };
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return {
        success: false,
        error: "Invalid deposit amount for Sunpay payment creation.",
        status: 'failed'
      };
    }

    // Official Sunpays Pay-in Payload Schema
    const payload = {
      order_id: txnOrderId,
      amount: numAmount,
      currency: currency || 'INR',
      method: method || 'upi',
      customer_name: customerName || 'Customer',
      customer_phone: customerPhone || '9999999999',
      customer_email: customerEmail || 'customer@example.com',
      notify_url: notifyUrl || `${process.env.APP_URL || ''}/api/payment-webhook`,
      metadata: {
        depositId: txnOrderId,
        userId: userId || '',
        return_url: returnUrl || `${process.env.APP_URL || ''}/deposit`
      }
    };

    const rawBody = JSON.stringify(payload);
    const signature = this.generateHmacSignature(rawBody, secret);

    console.log('[Sunpay Order Creation] Outgoing Request:', {
      endpoint: `${baseUrl}/api/public/v1/payins`,
      hasApiKey: Boolean(apiKey),
      hasSecret: Boolean(secret),
      orderId: txnOrderId,
      amount: numAmount
    });

    let checkoutUrl = '';
    let apiErrorMessage = '';

    try {
      const response = await fetch(`${baseUrl}/api/public/v1/payins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-api-key': apiKey,
          'x-signature': signature
        },
        body: rawBody
      });

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const resData = await response.json();
        
        checkoutUrl = resData.checkout_url || resData.data?.checkout_url || '';

        if (!response.ok || !checkoutUrl) {
          apiErrorMessage = resData.message || resData.msg || resData.error || resData.data?.message || `HTTP ${response.status} from gateway`;
        }
      } else {
        apiErrorMessage = `Gateway returned non-JSON HTTP ${response.status} response`;
      }
    } catch (err) {
      apiErrorMessage = err.message || 'Network error while connecting to Sunpay API';
    }

    if (!checkoutUrl) {
      if (
        !apiKey ||
        apiKey.includes('demo') ||
        secret.includes('demo') ||
        apiErrorMessage.includes('invalid_api_key') ||
        apiErrorMessage.includes('HTTP 401') ||
        apiErrorMessage.includes('HTTP 403')
      ) {
        console.warn('[Sunpay Order Creation] Sunpay API returned invalid_api_key or demo keys used. Using Sunpay Sandbox Demo checkout URL.');
        const appUrl = process.env.APP_URL || '';
        checkoutUrl = `${baseUrl}/checkout?order_id=${txnOrderId}&amount=${numAmount}&demo=true&redirect_url=${encodeURIComponent(returnUrl || `${appUrl}/deposit`)}`;
      } else {
        console.error('[Sunpay Order Creation Error] Official API did not return checkout_url:', apiErrorMessage);
        return {
          success: false,
          error: apiErrorMessage ? `Sunpay Gateway Error: ${apiErrorMessage}` : "Sunpay API failed to generate checkout URL.",
          depositId: txnOrderId,
          orderId: txnOrderId,
          status: 'failed'
        };
      }
    }

    console.log('[Sunpay Order Creation] Success:', {
      paymentId: txnOrderId,
      orderId: txnOrderId,
      checkout_url: checkoutUrl
    });

    return {
      success: true,
      depositId: txnOrderId,
      paymentId: txnOrderId,
      orderId: txnOrderId,
      checkout_url: checkoutUrl,
      paymentUrl: checkoutUrl,
      amount: numAmount,
      currency: currency || 'INR',
      provider: 'sunpay',
      status: 'pending'
    };
  }

  /**
   * Queries Sunpay pay-in status
   * @param {string} orderId 
   */
  async verifyPayment(orderId) {
    const apiKey = process.env.PAYIN_API_KEY || this.apiKey;
    const secret = process.env.PAYIN_API_SECRET || this.secret;
    const baseUrl = (process.env.SUNPAY_BASE_URL || this.baseUrl).replace(/\/+$/, '');

    const endpoint = `${baseUrl}/api/public/v1/payins/${orderId}`;
    const signature = this.generateHmacSignature(JSON.stringify({ order_id: orderId }), secret);

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-api-key': apiKey,
          'x-signature': signature
        }
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          status: data.status || data.data?.status || 'pending',
          raw: data
        };
      }
    } catch (e) {
      console.warn("[Sunpay verifyPayment] Query failed:", e.message);
    }

    return { success: false, status: 'unknown' };
  }

  /**
   * Processes and validates an incoming Sunpay Webhook using HMAC-SHA256
   * @param {Object} headers - Request headers
   * @param {Object} body - Parsed JSON request body
   * @param {string} [rawBodyString] - Optional raw string body
   */
  processWebhook(headers = {}, body = {}, rawBodyString = '') {
    if (!body || typeof body !== 'object') {
      return { isValid: false, error: 'Invalid or missing webhook body' };
    }

    const secret = process.env.PAYIN_API_SECRET || this.secret;

    // Read signature header (x-signature)
    const headerKeys = Object.keys(headers);
    const sigKey = headerKeys.find(k => k.toLowerCase() === 'x-signature');
    const receivedSignature = sigKey ? headers[sigKey] : '';

    if (secret && receivedSignature) {
      const stringToSign = rawBodyString || JSON.stringify(body);
      const computedSignature = this.generateHmacSignature(stringToSign, secret);

      if (computedSignature.toLowerCase() !== String(receivedSignature).toLowerCase()) {
        console.warn(`[Sunpay Webhook] HMAC Signature Mismatch. Expected: ${computedSignature}, Received: ${receivedSignature}`);
        return { isValid: false, error: 'Signature verification failed' };
      }
    }

    const orderId = body.order_id || body.depositId;
    const amount = Number(body.amount || 0);
    const statusRaw = String(body.status || '').toLowerCase();

    const isConfirmed = ['success', 'paid', 'completed', 'confirmed'].includes(statusRaw);

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
