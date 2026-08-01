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
      notifyUrl: req.notifyUrl
    });

    return {
      success: res.success,
      paymentId: res.paymentId,
      depositId: res.depositId,
      paymentUrl: res.paymentUrl,
      amount: res.amount,
      currency: res.currency,
      status: res.status || 'pending',
      isMock: false
    };
  }

  verifyWebhook(headers, body) {
    const res = sunpayService.processWebhook(headers, body);
    return res.isValid;
  }
}
