import crypto from 'crypto';
import { PaymentProviderInterface } from './provider-interface.js';

/**
 * Direct Crypto Payments Provider
 * Handles direct peer-to-peer wallet transfers on various blockchain networks.
 */
export class CryptoDirectProvider extends PaymentProviderInterface {
  constructor(config) {
    super(config);
  }

  async createPayment(req) {
    const netUpper = (req.network || '').toUpperCase();
    const credentials = this.config.credentials || {};

    let walletAddress = '';
    if (netUpper === 'TRC20' || netUpper.includes('TRON')) {
      walletAddress = credentials.usdtTrc20Address || 'TYb3jV2kR7K3XvSNoK83A7NnBkWqE9M2S4h';
    } else if (netUpper === 'BEP20' || netUpper.includes('BSC')) {
      walletAddress = credentials.usdtBep20Address || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
    } else if (netUpper === 'ERC20' || netUpper.includes('ETH')) {
      walletAddress = credentials.usdtErc20Address || '0xdAC17F958D2ee523a2206206994597C13D831ec7';
    } else {
      walletAddress = credentials.usdtTrc20Address || 'TYb3jV2kR7K3XvSNoK83A7NnBkWqE9M2S4h';
    }

    const qrData = `usdt:${walletAddress}?amount=${req.amount}&network=${netUpper.toLowerCase()}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;
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

  verifyWebhook(headers, body) {
    const secret = process.env.CRYPTO_WEBHOOK_SECRET || (this.config.credentials && this.config.credentials.ipnSecret);
    if (!secret) {
      console.warn("[Security Warning] CRYPTO_WEBHOOK_SECRET is not configured. Webhook signature checking is bypassed in local/dev environments.");
      return process.env.NODE_ENV !== 'production';
    }

    const signatureHeader = headers['x-webhook-signature'];
    const authHeader = headers['authorization'];
    const apiKeyHeader = headers['x-api-key'];

    // 1. Bearer Token authorization check
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token === secret) return true;
    }

    // 2. API Key header check
    if (apiKeyHeader && apiKeyHeader === secret) return true;

    // 3. HMAC-SHA256 hash validation
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
