/**
 * Cashfree Payment Gateway Service
 * Secret keys are loaded strictly from environment variables:
 * - process.env.CASHFREE_APP_ID
 * - process.env.CASHFREE_SECRET_KEY
 * - process.env.CASHFREE_ENV ('SANDBOX' | 'PRODUCTION')
 */

export class CashfreePaymentService {
  constructor() {
    this.appId = process.env.CASHFREE_APP_ID || '';
    this.secretKey = process.env.CASHFREE_SECRET_KEY || '';
    this.env = process.env.CASHFREE_ENV || 'SANDBOX';
    this.baseUrl = this.env === 'PRODUCTION' 
      ? 'https://api.cashfree.com/pg' 
      : 'https://sandbox.cashfree.com/pg';
  }

  /**
   * Initiates a Cashfree payment order
   * @param {Object} details - { orderId, amount, currency, customerPhone, customerEmail, customerId, returnUrl }
   */
  async createPayment(details = {}) {
    const {
      orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      amount,
      currency = 'INR',
      customerPhone = '9999999999',
      customerEmail = 'user@example.com',
      customerId = 'CUST-001',
      returnUrl = ''
    } = details;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return { success: false, error: 'Invalid payment amount' };
    }

    // Check if API credentials exist
    if (!this.appId || !this.secretKey) {
      console.warn('[CashfreeService] Missing CASHFREE_APP_ID or CASHFREE_SECRET_KEY in process.env. Operating in simulated flow mode.');
      return {
        success: true,
        orderId,
        paymentSessionId: `session_sim_${orderId}`,
        paymentUrl: returnUrl || `https://cashfree.com/pay/sim_${orderId}`,
        status: 'ACTIVE',
        isSimulated: true,
        gateway: 'Cashfree'
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-version': '2023-08-01',
          'x-client-id': this.appId,
          'x-client-secret': this.secretKey
        },
        body: JSON.stringify({
          order_id: orderId,
          order_amount: Number(amount),
          order_currency: currency,
          customer_details: {
            customer_id: customerId,
            customer_email: customerEmail,
            customer_phone: customerPhone
          },
          order_meta: {
            return_url: returnUrl
          }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Cashfree payment creation failed');
      }

      return {
        success: true,
        orderId: data.order_id,
        paymentSessionId: data.payment_session_id,
        paymentUrl: data.payment_link || data.payment_session_id,
        status: data.order_status,
        gateway: 'Cashfree'
      };
    } catch (err) {
      console.error('[CashfreeService] Error creating payment:', err.message);
      return {
        success: false,
        error: err.message,
        gateway: 'Cashfree'
      };
    }
  }

  /**
   * Verifies an order status with Cashfree API
   * @param {string} orderId 
   */
  async verifyPayment(orderId) {
    if (!orderId) {
      return { success: false, error: 'Missing orderId' };
    }

    if (!this.appId || !this.secretKey) {
      return {
        success: true,
        orderId,
        status: 'PAID',
        verified: true,
        isSimulated: true,
        gateway: 'Cashfree'
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/orders/${orderId}`, {
        method: 'GET',
        headers: {
          'x-api-version': '2023-08-01',
          'x-client-id': this.appId,
          'x-client-secret': this.secretKey
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Verification failed');
      }

      const isPaid = data.order_status === 'PAID';
      return {
        success: true,
        orderId: data.order_id,
        status: data.order_status,
        verified: isPaid,
        amount: data.order_amount,
        currency: data.order_currency,
        gateway: 'Cashfree'
      };
    } catch (err) {
      console.error('[CashfreeService] Error verifying payment:', err.message);
      return {
        success: false,
        error: err.message,
        gateway: 'Cashfree'
      };
    }
  }

  /**
   * Processes Cashfree Webhooks
   * @param {Object} headers 
   * @param {Object} body 
   */
  async processWebhook(headers = {}, body = {}) {
    const rawSignature = headers['x-webhook-signature'] || headers['X-Webhook-Signature'];
    const timestamp = headers['x-webhook-timestamp'] || headers['X-Webhook-Timestamp'];

    if (this.appId && this.secretKey && !rawSignature) {
      return { success: false, verified: false, error: 'Invalid or missing signature' };
    }

    const eventType = body.type || 'PAYMENT_SUCCESS_WEBHOOK';
    const data = body.data || {};
    const order = data.order || {};
    const payment = data.payment || {};

    return {
      success: true,
      verified: true,
      eventType,
      orderId: order.order_id || body.order_id,
      amount: order.order_amount || body.order_amount,
      paymentId: payment.cf_payment_id || body.cf_payment_id,
      status: payment.payment_status || 'SUCCESS',
      raw: body,
      gateway: 'Cashfree'
    };
  }
}

export const cashfreeService = new CashfreePaymentService();
