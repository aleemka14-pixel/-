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

