import crypto from 'crypto';
import { 
  CreatePaymentRequest, 
  CreatePaymentResponse, 
  PaymentProviderConfig 
} from './types';

export interface PaymentAdapter {
  config: PaymentProviderConfig;
  createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResponse>;
  verifyWebhook(headers: Record<string, string>, body: any): boolean;
}

/**
 * Helper to sort the keys of an object alphabetically for NOWPayments IPN verification.
 */
function sortObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj: Record<string, any> = {};
  for (const key of sortedKeys) {
    sortedObj[key] = sortObject(obj[key]);
  }
  return sortedObj;
}

/**
 * 1. Adapter for Direct Crypto Wallet Deposits (TRC20, BEP20, ERC20)
 */
export class CryptoDirectAdapter implements PaymentAdapter {
  config: PaymentProviderConfig;

  constructor(config: PaymentProviderConfig) {
    this.config = config;
  }

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    const netUpper = req.network.toUpperCase();
    const credentials = this.config.credentials;

    // Sourced dynamically from configuration database, with safe system default addresses
    let walletAddress = '';
    if (netUpper === 'TRC20') {
      walletAddress = credentials.usdtTrc20Address || '';
    } else if (netUpper === 'BEP20') {
      walletAddress = credentials.usdtBep20Address || '';
    } else if (netUpper === 'ERC20') {
      walletAddress = credentials.usdtErc20Address || '';
    } else {
      walletAddress = credentials.usdtTrc20Address || '';
    }

    const qrData = walletAddress;
    const qrCodeUrl = '';
    const paymentId = `DEP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    return {
      success: true,
      paymentId,
      walletAddress,
      amount: req.amount,
      qrData,
      qrCodeUrl,
      status: 'pending',
      isMock: this.config.mode === 'test'
    };
  }

  verifyWebhook(headers: Record<string, string>, body: any): boolean {
    const secret = process.env.CRYPTO_WEBHOOK_SECRET || this.config.credentials.ipnSecret;
    if (!secret) return true; // Signature checking skipped if secret is not set

    const signatureHeader = headers['x-webhook-signature'];
    const authHeader = headers['authorization'];
    const apiKeyHeader = headers['x-api-key'];

    // 1. Authorization Bearer Check
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token === secret) return true;
    }

    // 2. API Key Header Check
    if (apiKeyHeader && apiKeyHeader === secret) return true;

    // 3. HMAC-SHA256 signature verification of payload body
    if (signatureHeader) {
      const stringifiedPayload = typeof body === 'string' ? body : JSON.stringify(body);
      const expectedSignature = crypto.createHmac('sha256', secret)
        .update(stringifiedPayload)
        .digest('hex');
      return signatureHeader === expectedSignature;
    }

    return false;
  }
}

/**
 * 2. Adapter for NOWPayments Gateway (Handles BTC, ETH, BNB, etc.)
 */
export class NowPaymentsAdapter implements PaymentAdapter {
  config: PaymentProviderConfig;

  constructor(config: PaymentProviderConfig) {
    this.config = config;
  }

  async createPayment(req: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    const apiKey = process.env.NOWPAYMENTS_API_KEY || this.config.credentials.apiKey;
    const isSandbox = this.config.mode === 'test';

    // Map selected network to respective pay currency
    let payCurrency = 'usdt';
    let baseAddress = '';

    switch ((req.network || '').toLowerCase()) {
      case 'bitcoin':
      case 'btc':
        payCurrency = 'btc';
        break;
      case 'ethereum':
      case 'erc20':
        payCurrency = 'eth';
        break;
      case 'bsc':
      case 'bep20':
        payCurrency = 'bnb';
        break;
      case 'polygon':
        payCurrency = 'pol';
        break;
      case 'solana':
        payCurrency = 'sol';
        break;
      case 'litecoin':
        payCurrency = 'ltc';
        break;
      default:
        payCurrency = 'usdt';
    }

    // Try live gateway API call if credentials exist
    if (apiKey) {
      try {
        const endpoint = isSandbox 
          ? 'https://api-sandbox.nowpayments.io/v1/invoice' 
          : 'https://api.nowpayments.io/v1/invoice';

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
          const chkUrl = data.invoice_url;

          return {
            success: true,
            paymentId: String(data.id || data.payment_id || `NOW-${Date.now()}`),
            walletAddress: data.pay_address || '',
            amount: data.pay_amount || req.amount,
            qrData: chkUrl,
            qrCodeUrl: '',
            status: data.payment_status || 'waiting',
            isMock: false
          };
        } else {
          console.error('[NOWPayments API Error response]', await response.text());
        }
      } catch (err) {
        console.error('[NOWPayments API Exception]', err);
      }
    }

    // fallback simulation
    const randomBytes = crypto.randomBytes(8).toString('hex');
    const paymentId = `PAY-${randomBytes.toUpperCase()}`;
    const qrData = baseAddress;
    const qrCodeUrl = '';

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

  verifyWebhook(headers: Record<string, string>, body: any): boolean {
    const signature = headers['x-nowpayments-sig'] || headers['np-sig'];
    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET || this.config.credentials.ipnSecret;

    if (!ipnSecret) return true; // signature checking skipped if IPN secret isn't specified
    if (!signature) return false;

    try {
      const sortedPayload = sortObject(body);
      const stringifiedPayload = JSON.stringify(sortedPayload);

      const calculatedSignature = crypto.createHmac('sha512', ipnSecret)
        .update(stringifiedPayload)
        .digest('hex');

      return calculatedSignature === signature;
    } catch (e) {
      console.error('NOWPayments webhook signature computation failed:', e);
      return false;
    }
  }
}
