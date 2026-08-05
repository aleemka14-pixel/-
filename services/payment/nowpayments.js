import crypto from 'crypto';

/**
 * Helper to sort the keys of an object alphabetically for NOWPayments IPN verification.
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
 * Single source of truth for supported crypto assets and network mappings in NOWPayments.
 */
export const SUPPORTED_CRYPTO_CURRENCIES = {
  USDT_TRC20: {
    displayName: 'USDT TRC20',
    asset: 'USDT',
    network: 'TRC20',
    nowpaymentsCurrency: 'usdttrc20',
    providerCurrency: 'usdttrc20'
  },
  USDT_BEP20: {
    displayName: 'USDT BEP20',
    asset: 'USDT',
    network: 'BEP20',
    nowpaymentsCurrency: 'usdtbep20',
    providerCurrency: 'usdtbep20'
  },
  USDT_ERC20: {
    displayName: 'USDT ERC20',
    asset: 'USDT',
    network: 'ERC20',
    nowpaymentsCurrency: 'usdterc20',
    providerCurrency: 'usdterc20'
  },
  BTC: {
    displayName: 'BTC',
    asset: 'BTC',
    network: 'BTC',
    nowpaymentsCurrency: 'btc',
    providerCurrency: 'btc'
  },
  TRX: {
    displayName: 'TRX',
    asset: 'TRX',
    network: 'TRON',
    nowpaymentsCurrency: 'trx',
    providerCurrency: 'trx'
  },
  SOL: {
    displayName: 'SOL',
    asset: 'SOL',
    network: 'SOLANA',
    nowpaymentsCurrency: 'sol',
    providerCurrency: 'sol'
  }
};

/**
 * NOWPayments Service Layer
 * Clean, isolated implementation for creating invoices and verifying IPN webhooks.
 */
export class NowpaymentsService {
  /**
   * Resolves canonical target crypto currency code based on network, asset, and direct currency parameters.
   */
  getPayCurrency(network = 'TRC20', asset = 'USDT', directPayCurrency = '') {
    const direct = (directPayCurrency || '').toLowerCase().trim();
    const net = (network || '').toUpperCase().trim();
    const ast = (asset || '').toUpperCase().trim();

    // 1. Check if direct matches any nowpaymentsCurrency
    for (const item of Object.values(SUPPORTED_CRYPTO_CURRENCIES)) {
      if (direct && item.nowpaymentsCurrency === direct) {
        return item.nowpaymentsCurrency;
      }
    }

    // 2. Check key match in SUPPORTED_CRYPTO_CURRENCIES
    const keyMatch = `${ast}_${net}`.replace(/[^A-Z0-9_]/g, '_');
    if (SUPPORTED_CRYPTO_CURRENCIES[keyMatch]) {
      return SUPPORTED_CRYPTO_CURRENCIES[keyMatch].nowpaymentsCurrency;
    }

    // 3. Match asset & network combinations
    if (ast === 'USDT' || ast === 'USDTTRC20' || ast === 'USDT-TRC20') {
      if (net === 'BEP20' || net === 'BSC' || net === 'USDT-BEP20') return 'usdtbep20';
      if (net === 'ERC20' || net === 'ETH' || net === 'ETHEREUM' || net === 'USDT-ERC20') return 'usdterc20';
      return 'usdttrc20';
    }

    if (net === 'TRC20' || net === 'USDT-TRC20' || net === 'TRON') return 'usdttrc20';
    if (net === 'BEP20' || net === 'USDT-BEP20' || net === 'BSC') return 'usdtbep20';
    if (net === 'ERC20' || net === 'USDT-ERC20' || net === 'ETH' || net === 'ETHEREUM') return 'usdterc20';

    if (net === 'BTC' || net === 'BITCOIN' || ast === 'BTC') return 'btc';
    if (net === 'TRX' || ast === 'TRX') return 'trx';
    if (net === 'SOL' || net === 'SOLANA' || ast === 'SOL') return 'sol';

    if (direct && direct !== 'usdt' && direct !== 'trc20') return direct;

    return null;
  }

  /**
   * Creates an invoice via NOWPayments V1 Invoice API
   */
  async createInvoice(params = {}) {
    const apiKey = (params.apiKey || process.env.NOWPAYMENTS_API_KEY || '').trim();
    const priceAmount = Number(params.amount);
    const priceCurrency = (params.currency || 'USD').toLowerCase().trim();
    const orderId = params.orderId || `dep_${Date.now()}`;
    const payCurrency = this.getPayCurrency(params.network, params.asset, params.payCurrency || params.pay_currency);
    const validCurrencies = Object.values(SUPPORTED_CRYPTO_CURRENCIES).map(c => c.nowpaymentsCurrency);

    console.log(`[NOWPayments Trace] Input Asset: "${params.asset}", Network: "${params.network}", DirectPayCurrency: "${params.payCurrency || params.pay_currency}" -> Resolved pay_currency: "${payCurrency}"`);

    // Validation 1: Check Amount
    if (!priceAmount || isNaN(priceAmount) || priceAmount <= 0) {
      console.error("[NOWPayments Service] Invalid deposit amount:", params.amount);
      return {
        success: false,
        error: "Deposit amount must be greater than 0 USD."
      };
    }

    // Validation 2: Check pay_currency
    if (!payCurrency || payCurrency === 'USDT' || payCurrency === 'TRC20') {
      console.error("[NOWPayments Service] Invalid or empty pay_currency:", payCurrency);
      return {
        success: false,
        error: "Invalid or empty pay_currency. Must specify a valid crypto currency code like 'usdttrc20'."
      };
    }

    if (!validCurrencies.includes(payCurrency)) {
      console.error(`[NOWPayments Service] Unsupported pay_currency '${payCurrency}'. Supported list:`, validCurrencies);
      return {
        success: false,
        error: `Unsupported payment currency '${payCurrency}'. Selected asset is not configured.`
      };
    }

    // Validation 3: Check API Key (fallback to sandbox demo mode if missing)
    if (!apiKey) {
      console.warn("[NOWPayments Service] NOWPAYMENTS_API_KEY is missing. Generating Sandbox/Demo Checkout Order.");
      const demoCheckoutUrl = `https://nowpayments.io/payment/?iid=${orderId}&payCurrency=${payCurrency}`;
      return {
        success: true,
        paymentId: String(orderId),
        invoice_url: demoCheckoutUrl,
        checkout_url: demoCheckoutUrl,
        payment_url: demoCheckoutUrl,
        paymentUrl: demoCheckoutUrl,
        amount: priceAmount,
        currency: priceCurrency.toUpperCase(),
        payCurrency: payCurrency,
        status: 'pending',
        isSandbox: true,
        warning: "NOWPayments API key is missing. Order generated in Sandbox/Demo mode."
      };
    }

    const endpoint = 'https://api.nowpayments.io/v1/invoice';

    const payload = {
      price_amount: priceAmount,
      price_currency: priceCurrency,
      pay_currency: payCurrency,
      order_id: orderId,
      order_description: `Deposit Order ${orderId}`,
      ipn_callback_url: params.notifyUrl,
      success_url: params.returnUrl,
      cancel_url: params.returnUrl
    };

    console.log(`[NOWPayments Service] Sending POST to ${endpoint}`, JSON.stringify({ ...payload, apiKey: '[PROTECTED]' }));

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      let data = {};
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error("[NOWPayments Service] Failed to parse JSON response:", responseText.substring(0, 300));
      }

      if (response.ok && (data.invoice_url || data.payment_url)) {
        const checkoutUrl = data.invoice_url || data.payment_url;
        console.log(`[NOWPayments Service] Invoice created successfully! Invoice ID: ${data.id}, pay_currency: ${payCurrency}, URL: ${checkoutUrl}`);

        return {
          success: true,
          paymentId: String(data.id || data.order_id || orderId),
          invoice_url: checkoutUrl,
          checkout_url: checkoutUrl,
          payment_url: checkoutUrl,
          paymentUrl: checkoutUrl,
          amount: priceAmount,
          currency: priceCurrency.toUpperCase(),
          payCurrency: payCurrency,
          status: 'pending'
        };
      } else {
        const errMsg = data.message || data.error || `HTTP ${response.status}: ${responseText}`;
        console.error(`[NOWPayments Service API Error]: ${errMsg}`);
        return {
          success: false,
          error: `NOWPayments API Error: ${errMsg}`
        };
      }
    } catch (err) {
      console.error("[NOWPayments Service Network Exception]:", err.message);
      return {
        success: false,
        error: `NOWPayments Network Exception: ${err.message}`
      };
    }
  }

  /**
   * Verifies the HMAC SHA-512 signature of an incoming IPN webhook request
   */
  verifyWebhookSignature(headers = {}, body = {}, customSecret = '') {
    const signature = headers['x-nowpayments-sig'] || headers['np-sig'] || headers['X-Nowpayments-Sig'];
    const ipnSecret = (customSecret || process.env.NOWPAYMENTS_IPN_SECRET || '').trim();

    if (!ipnSecret) {
      console.warn("[NOWPayments Webhook] No IPN secret configured; signature check failed.");
      return { isValid: false, reason: "Missing NOWPAYMENTS_IPN_SECRET" };
    }

    if (!signature) {
      console.warn("[NOWPayments Webhook] Missing x-nowpayments-sig header.");
      return { isValid: false, reason: "Missing signature header" };
    }

    try {
      const sortedPayload = sortObject(body);
      const stringifiedPayload = JSON.stringify(sortedPayload);

      const calculatedSignature = crypto
        .createHmac('sha512', ipnSecret)
        .update(stringifiedPayload)
        .digest('hex');

      const isValid = calculatedSignature.toLowerCase() === signature.toLowerCase();
      if (!isValid) {
        console.error(`[NOWPayments Webhook] Signature mismatch! Calculated: ${calculatedSignature}, Header: ${signature}`);
      }

      return { isValid };
    } catch (err) {
      console.error("[NOWPayments Webhook] Exception verifying signature:", err);
      return { isValid: false, reason: err.message };
    }
  }
}

export const nowpaymentsService = new NowpaymentsService();
export default nowpaymentsService;
