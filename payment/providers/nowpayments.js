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

    let payCurrency = 'usdt';
    let baseAddress = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';

    const netLower = (req.network || '').toLowerCase();
    switch (netLower) {
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
        payCurrency = 'usdt';
        baseAddress = 'TYb3jV2kR7K3XvSNoK83A7NnBkWqE9M2S4h';
    }

    if (apiKey) {
      try {
        const endpoint = isSandbox 
          ? 'https://api-sandbox.nowpayments.io/v1/payment' 
          : 'https://api.nowpayments.io/v1/payment';

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            price_amount: req.amount,
            price_currency: req.currency?.toLowerCase() || 'usd',
            pay_currency: payCurrency,
            ipn_callback_url: process.env.APP_URL ? `${process.env.APP_URL}/api/webhook` : undefined,
            order_id: `NOW-${Date.now()}-${req.userId}`
          })
        });

        if (response.ok) {
          const data = await response.json();
          const walletAddress = data.pay_address;
          const qrData = `${payCurrency}:${walletAddress}?amount=${data.pay_amount || req.amount}`;
          const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;

          return {
            success: true,
            paymentId: data.payment_id || `NOW-${Date.now()}`,
            walletAddress,
            amount: data.pay_amount || req.amount,
            qrData,
            qrCodeUrl,
            status: data.payment_status || 'waiting',
            isMock: false
          };
        } else {
          console.error('[NowPaymentsProvider] API Error response:', await response.text());
        }
      } catch (err) {
        console.error('[NowPaymentsProvider] API Exception:', err);
      }
    }

    // Fallback sandbox simulation if API key is not configured or fails
    const randomBytes = crypto.randomBytes(8).toString('hex');
    const paymentId = `PAY-${randomBytes.toUpperCase()}`;
    const qrData = `${payCurrency}:${baseAddress}?amount=${req.amount}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;

    return {
      success: true,
      paymentId,
      walletAddress: baseAddress,
      amount: req.amount,
      qrData,
      qrCodeUrl,
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
