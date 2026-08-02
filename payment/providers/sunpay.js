import { PaymentProviderInterface } from './provider-interface.js';
import { sunpayService } from '../../services/payment/sunpay.js';

/**
 * Sunpay Gateway Provider Adapter
 * Implements PaymentProviderInterface for Sunpay.
 */
export class SunpayProvider extends PaymentProviderInterface {
  constructor(config) {
    super(config);
  }

  async createPayment(req) {
    const res = await sunpayService.createPayment({
      userId: req.userId || req.playerId,
      amount: req.amount,
      currency: req.currency || 'INR',
      orderId: req.orderId,
      returnUrl: req.returnUrl,
      notifyUrl: req.notifyUrl,
      apiKey: this.config?.credentials?.apiKey,
      secret: this.config?.credentials?.secret,
      baseUrl: this.config?.credentials?.baseUrl,
      customerName: req.customerName,
      customerPhone: req.customerPhone,
      customerEmail: req.customerEmail,
      method: req.method || 'upi'
    });

    return {
      success: res.success,
      error: res.error,
      paymentId: res.paymentId,
      depositId: res.depositId,
      paymentUrl: res.checkout_url || res.paymentUrl,
      checkout_url: res.checkout_url || res.paymentUrl,
      amount: res.amount,
      currency: res.currency,
      status: res.status || (res.success ? 'pending' : 'failed'),
      isMock: false
    };
  }

  verifyWebhook(headers, body) {
    const res = sunpayService.processWebhook(headers, body);
    return res.isValid;
  }
}
