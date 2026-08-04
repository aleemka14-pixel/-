import crypto from 'crypto';
import { PaymentProviderInterface } from './provider-interface.js';

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
 * NOWPayments Gateway Provider
 * Interfaces with the NOWPayments API to accept diverse cryptocurrencies dynamically.
 */
export class NowPaymentsProvider extends PaymentProviderInterface {
  constructor(config) {
    super(config);
  }

  async createPayment(req) {
    const apiKey = process.env.NOWPAYMENTS_API_KEY || (this.config.credentials && this.config.credentials.apiKey);
    const isSandbox = this.config.mode === 'test';

    let payCurrency = 'usdttrc20';
    let baseAddress = 'TYb3jV2kR7K3XvSNoK83A7NnBkWqE9M2S4h';

    const netLower = (req.network || '').toLowerCase();
    switch (netLower) {
      case 'trc20':
      case 'usdt_trc20':
      case 'usdttrc20':
      case 'tron':
        payCurrency = 'usdttrc20';
        baseAddress = 'TYb3jV2kR7K3XvSNoK83A7NnBkWqE9M2S4h';
        break;
      case 'bitcoin':
      case 'btc':
        payCurrency = 'btc';
        baseAddress = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
        break;
      case 'ethereum':
      case 'erc20':
      case 'eth':
        payCurrency = 'eth';
        baseAddress = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
        break;
      case 'bsc':
      case 'bep20':
      case 'bnb':
        payCurrency = 'bnb';
        baseAddress = '0x3f5CE0D2189dfa8df9e87fbC180b7Bd4E12e0388';
        break;
      case 'polygon':
      case 'pol':
        payCurrency = 'pol';
        baseAddress = '0x996556EC7ab88b098defB751B7401B5f6d8976F';
        break;
      case 'solana':
      case 'sol':
        payCurrency = 'sol';
        baseAddress = 'A7K9mXNoS4hTYb3jV2kR7K3XvSNoK83A7NnBkWqE';
        break;
      case 'litecoin':
      case 'ltc':
        payCurrency = 'ltc';
        baseAddress = 'Lge7b3jV2kR7K3XvSNoK83A7NnBkWqE9M2S4h';
        break;
      default:
        payCurrency = 'usdttrc20';
        baseAddress = 'TYb3jV2kR7K3XvSNoK83A7NnBkWqE9M2S4h';
    }

    if (apiKey) {
      try {
        const endpoint = isSandbox 
          ? 'https://api-sandbox.nowpayments.io/v1/invoice' 
          : 'https://api.nowpayments.io/v1/invoice';

        const notifyUrl = req.notifyUrl || (process.env.APP_URL ? `${process.env.APP_URL}/api/webhook` : undefined);
        const returnUrl = req.returnUrl || (process.env.APP_URL ? `${process.env.APP_URL}/deposit` : undefined);

        const requestBody = {
          price_amount: Number(req.amount),
          price_currency: (req.currency || 'usd').toLowerCase(),
          pay_currency: payCurrency,
          ipn_callback_url: notifyUrl,
          success_url: returnUrl,
          cancel_url: returnUrl,
          order_id: req.orderId || `NOW-${Date.now()}-${req.userId}`,
          order_description: `Wallet Deposit: $${req.amount} USD (${payCurrency.toUpperCase()})`
        };

        console.log('[NowPaymentsProvider] Requesting Invoice from NOWPayments API:', { endpoint, requestBody });

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        const textResponse = await response.text();
        let data = {};
        try {
          data = JSON.parse(textResponse);
        } catch (e) {
          console.error('[NowPaymentsProvider] Failed to parse JSON response:', textResponse);
        }

        if (response.ok && data.invoice_url) {
          const pid = String(data.id || data.payment_id || req.orderId || `NOW-${Date.now()}`);
          const chkUrl = data.invoice_url;

          console.log('[NowPaymentsProvider] Successfully generated NOWPayments invoice URL:', chkUrl);

          return {
            success: true,
            paymentId: pid,
            checkout_url: chkUrl,
            paymentUrl: chkUrl,
            payment_url: chkUrl,
            invoice_url: chkUrl,
            amount: req.amount,
            currency: req.currency || 'USD',
            status: 'waiting',
            isMock: false
          };
        } else {
          const apiErr = data.message || data.error || `HTTP ${response.status}: ${textResponse}`;
          console.error('[NowPaymentsProvider] API Error response:', apiErr);
          return {
            success: false,
            error: `NOWPayments API Error: ${apiErr}`
          };
        }
      } catch (err) {
        console.error('[NowPaymentsProvider] API Exception:', err);
        return {
          success: false,
          error: `NOWPayments Connection Exception: ${err.message}`
        };
      }
    }

    // Fallback sandbox simulation if API key is not configured in process.env
    console.warn('[NowPaymentsProvider] NOWPAYMENTS_API_KEY is missing. Utilizing Sandbox Simulation Mode.');
    const randomBytes = crypto.randomBytes(8).toString('hex');
    const paymentId = `PAY-${randomBytes.toUpperCase()}`;
    const qrData = `${payCurrency}:${baseAddress}?amount=${req.amount}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;
    const chkUrl = `https://nowpayments.io/payment/?iid=sim_${paymentId}`;

    return {
      success: true,
      paymentId,
      walletAddress: baseAddress,
      amount: req.amount,
      qrData,
      qrCodeUrl,
      checkout_url: chkUrl,
      paymentUrl: chkUrl,
      payment_url: chkUrl,
      invoice_url: chkUrl,
      status: 'waiting',
      isMock: true
    };
  }

  verifyWebhook(headers, body) {
    const signature = headers['x-nowpayments-sig'] || headers['np-sig'];
    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET || (this.config.credentials && this.config.credentials.ipnSecret);

    if (!ipnSecret) return true; // Signature checking skipped if secret is omitted
    if (!signature) return false;

    try {
      const sortedPayload = sortObject(body);
      const stringifiedPayload = JSON.stringify(sortedPayload);

      const calculatedSignature = crypto.createHmac('sha512', ipnSecret)
        .update(stringifiedPayload)
        .digest('hex');

      return calculatedSignature === signature;
    } catch (e) {
      console.error('[NowPaymentsProvider] Webhook signature computation failed:', e);
      return false;
    }
  }
}
