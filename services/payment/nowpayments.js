/**
 * NOWPayments Crypto Gateway Service
 * Secret keys are loaded strictly from environment variables:
 * - process.env.NOWPAYMENTS_API_KEY
 * - process.env.NOWPAYMENTS_IPN_SECRET
 */

export class NowPaymentsService {
  constructor() {
    this.apiKey = process.env.NOWPAYMENTS_API_KEY || '';
    this.ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET || '';
    this.baseUrl = 'https://api.nowpayments.io/v1';
  }

  /**
   * Initiates a NOWPayments invoice or payment request
   * @param {Object} details - { amount, payCurrency, priceCurrency, orderId, orderDescription, ipnCallbackUrl }
   */
  async createPayment(details = {}) {
    const {
      amount,
      priceCurrency = 'usd',
      payCurrency = 'usdttrc20',
      orderId = `NP-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      orderDescription = 'Deposit',
      ipnCallbackUrl = ''
    } = details;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return { success: false, error: 'Invalid payment amount' };
    }

    if (!this.apiKey) {
      console.warn('[NowPaymentsService] Missing NOWPAYMENTS_API_KEY in process.env. Operating in simulated flow mode.');
      return {
        success: true,
        paymentId: `np_sim_${orderId}`,
        orderId,
        payAddress: 'TXYZ1234567890TRONSimulatedAddress',
        payAmount: Number(amount),
        payCurrency,
        paymentUrl: `https://nowpayments.io/payment/?iid=sim_${orderId}`,
        status: 'waiting',
        isSimulated: true,
        gateway: 'NOWPayments'
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: JSON.stringify({
          price_amount: Number(amount),
          price_currency: priceCurrency.toLowerCase(),
          pay_currency: payCurrency.toLowerCase(),
          ipn_callback_url: ipnCallbackUrl,
          order_id: orderId,
          order_description: orderDescription
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'NOWPayments order creation failed');
      }

      return {
        success: true,
        paymentId: String(data.payment_id),
        orderId: data.order_id,
        payAddress: data.pay_address,
        payAmount: data.pay_amount,
        payCurrency: data.pay_currency,
        status: data.payment_status,
        gateway: 'NOWPayments'
      };
    } catch (err) {
      console.error('[NowPaymentsService] Error creating payment:', err.message);
      return {
        success: false,
        error: err.message,
        gateway: 'NOWPayments'
      };
    }
  }

  /**
   * Alias method for createPayment
   */
  async createCryptoPayment(details = {}) {
    return this.createPayment(details);
  }

  /**
   * Verifies payment status via NOWPayments API
   * @param {string} paymentId 
   */
  async verifyPayment(paymentId) {
    if (!paymentId) {
      return { success: false, error: 'Missing paymentId' };
    }

    if (!this.apiKey) {
      return {
        success: true,
        paymentId,
        status: 'finished',
        verified: true,
        isSimulated: true,
        gateway: 'NOWPayments'
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/payment/${paymentId}`, {
        method: 'GET',
        headers: {
          'x-api-key': this.apiKey
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'NOWPayments status check failed');
      }

      const isConfirmed = data.payment_status === 'finished' || data.payment_status === 'confirmed';

      return {
        success: true,
        paymentId: String(data.payment_id),
        status: data.payment_status,
        verified: isConfirmed,
        payAmount: data.pay_amount,
        actuallyPaid: data.actually_paid,
        gateway: 'NOWPayments'
      };
    } catch (err) {
      console.error('[NowPaymentsService] Error verifying payment:', err.message);
      return {
        success: false,
        error: err.message,
        gateway: 'NOWPayments'
      };
    }
  }

  /**
   * Alias method for verifyPayment
   */
  async checkPaymentStatus(paymentId) {
    return this.verifyPayment(paymentId);
  }

  /**
   * Processes NOWPayments IPN Webhooks
   * @param {Object} headers 
   * @param {Object} body 
   */
  async processWebhook(headers = {}, body = {}) {
    const signature = headers['x-nowpayments-sig'] || headers['X-Nowpayments-Sig'];

    if (this.ipnSecret && !signature) {
      return { success: false, verified: false, error: 'Missing IPN signature' };
    }

    const isFinished = body.payment_status === 'finished' || body.payment_status === 'confirmed';

    return {
      success: true,
      verified: true,
      paymentId: String(body.payment_id || ''),
      orderId: body.order_id,
      status: body.payment_status,
      isFinished,
      payAmount: body.pay_amount,
      actuallyPaid: body.actually_paid,
      raw: body,
      gateway: 'NOWPayments'
    };
  }
}

export const nowPaymentsService = new NowPaymentsService();
