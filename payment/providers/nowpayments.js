import { PaymentProviderInterface } from './provider-interface.js';
import { nowpaymentsService } from '../../services/payment/nowpayments.js';

/**
 * NOWPayments Gateway Provider Adapter
 * Implements PaymentProviderInterface for NOWPayments crypto payments.
 */
export class NowPaymentsProvider extends PaymentProviderInterface {
  constructor(config) {
    super(config);
  }

  async createPayment(req) {
    const apiKey = (this.config?.credentials?.apiKey || process.env.NOWPAYMENTS_API_KEY || '').trim();

    const res = await nowpaymentsService.createInvoice({
      apiKey,
      userId: req.userId || req.playerId,
      amount: req.amount,
      currency: req.currency || 'USD',
      network: req.network || 'TRC20',
      asset: req.asset || 'USDT',
      payCurrency: req.payCurrency || req.pay_currency,
      orderId: req.orderId,
      returnUrl: req.returnUrl,
      notifyUrl: req.notifyUrl
    });

    return {
      success: res.success,
      error: res.error,
      paymentId: res.paymentId,
      depositId: res.paymentId,
      paymentUrl: res.checkout_url || res.invoice_url,
      checkout_url: res.checkout_url || res.invoice_url,
      invoice_url: res.invoice_url || res.checkout_url,
      payCurrency: res.payCurrency,
      amount: res.amount,
      currency: res.currency,
      status: res.status || (res.success ? 'pending' : 'failed'),
      isMock: Boolean(res.isSandbox)
    };
  }

  verifyWebhook(headers, body) {
    const ipnSecret = (this.config?.credentials?.ipnSecret || process.env.NOWPAYMENTS_IPN_SECRET || '').trim();
    const result = nowpaymentsService.verifyWebhookSignature(headers, body, ipnSecret);
    return result.isValid;
  }
}

export default NowPaymentsProvider;
