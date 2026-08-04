import { 
  db, 
  getPaymentSettings, 
  getProviderAdapter, 
  recordProviderFailure, 
  addPaymentLog 
} from '../_services/payment-service.js';
import { doc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Vercel Serverless Function Handler: create-deposit
 * Integrates Sunpay as the deposit payment gateway.
 */
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} Not Allowed. Deposit creation requires POST.`
    });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }
    const { userId, playerId, amount, network, provider, currency } = body || {};
    const resolvedUserId = userId || playerId;

    if (!resolvedUserId) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: userId or playerId."
      });
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid deposit amount."
      });
    }

    const numAmount = Number(amount);
    const settings = await getPaymentSettings();

    if (settings.maintenanceMode) {
      return res.status(403).json({
        success: false,
        error: "Payment infrastructure is currently under maintenance. Please try again later."
      });
    }

    const selectedNetwork = (network || 'UPI').toUpperCase();
    const selectedProviderKey = provider || 'sunpay';

    let providerConfig = settings.providers[selectedProviderKey];
    if (!providerConfig || !providerConfig.enabled) {
      if (selectedProviderKey === 'sunpay') {
        providerConfig = {
          id: 'sunpay',
          name: 'UPI Gateway',
          enabled: true,
          credentials: {
            apiKey: process.env.PAYIN_API_KEY || '',
            secret: process.env.PAYIN_API_SECRET || '',
            baseUrl: process.env.SUNPAY_BASE_URL || 'https://sunpaytm.quest'
          },
          minDeposit: 100,
          maxDeposit: 100000
        };
      } else if (selectedProviderKey === 'nowpayments') {
        const apiKey = (process.env.NOWPAYMENTS_API_KEY || '').trim();

        console.log(`NOWPAYMENTS_API_KEY exists: ${Boolean(apiKey)}`);
        console.log(`NOWPAYMENTS_API_KEY length: ${apiKey ? apiKey.length : 0}`);

        providerConfig = {
          id: 'nowpayments',
          name: 'NOWPayments Gateway',
          enabled: true,
          mode: 'live',
          credentials: {
            apiKey: apiKey,
            ipnSecret: (process.env.NOWPAYMENTS_IPN_SECRET || '').trim()
          },
          minDeposit: 5,
          maxDeposit: 50000
        };
      } else {
        return res.status(400).json({
          success: false,
          error: `Selected payment provider '${selectedProviderKey}' is currently unavailable.`
        });
      }
    }

    const adapter = getProviderAdapter(providerConfig);

    const isCrypto = selectedProviderKey === 'nowpayments' || (currency && currency.toUpperCase() === 'USD');
    const minRequired = providerConfig.minDeposit || (isCrypto ? 5 : 100);
    const maxRequired = providerConfig.maxDeposit || (isCrypto ? 50000 : 100000);
    const cooldownSeconds = providerConfig.depositCooldown || 15;
    const currencySymbol = isCrypto ? '$' : '₹';

    if (numAmount < minRequired || numAmount > maxRequired) {
      return res.status(400).json({
        success: false,
        error: `Deposit amount of ${currencySymbol}${numAmount} is outside allowed limits [Min: ${currencySymbol}${minRequired}, Max: ${currencySymbol}${maxRequired}].`
      });
    }

    // Cooldown check for duplicate requests
    try {
      const depositsRef = collection(db, 'deposits');
      const cooldownThreshold = Date.now() - cooldownSeconds * 1000;
      const q = query(
        depositsRef,
        where('playerId', '==', resolvedUserId),
        where('amount', '==', numAmount),
        where('timestamp', '>', cooldownThreshold)
      );
      const querySnap = await getDocs(q);

      if (!querySnap.empty) {
        return res.status(400).json({
          success: false,
          error: `A deposit request with identical parameters was submitted recently. Please wait ${cooldownSeconds} seconds before trying again.`
        });
      }
    } catch (e) {
      console.warn("[API Info] Cooldown check skipped or index building:", e.message);
    }

    let origin = 'https://' + (req.headers.host || 'localhost:3000');
    if (req.headers.origin) {
      origin = req.headers.origin;
    }

    const returnUrl = `${origin}/deposit`;
    const notifyUrl = selectedProviderKey === 'nowpayments' ? `${origin}/api/webhook` : `${origin}/api/payment-webhook`;

    console.log(`[create-deposit] Calling ${selectedProviderKey} adapter. Amount: ${numAmount}, Currency: ${currency || (isCrypto ? 'USD' : 'INR')}`);

    const gatewayResponse = await adapter.createPayment({
      amount: numAmount,
      currency: currency || (isCrypto ? 'USD' : 'INR'),
      network: selectedNetwork,
      orderId: `dep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: resolvedUserId,
      returnUrl,
      notifyUrl
    });

    if (!gatewayResponse || !gatewayResponse.success) {
      await recordProviderFailure(selectedProviderKey, gatewayResponse?.error || 'Failed to initialize payment gateway.');
      return res.status(502).json({
        success: false,
        error: gatewayResponse?.error || "Payment gateway creation failed."
      });
    }

    const timestamp = Date.now();
    const paymentId = gatewayResponse.paymentId || gatewayResponse.depositId;
    const checkout_url = gatewayResponse.checkout_url || gatewayResponse.paymentUrl || gatewayResponse.payment_url || gatewayResponse.invoice_url;
    const providerName = selectedProviderKey === 'nowpayments' ? 'NOWPayments (Crypto)' : 'UPI Gateway';

    if (!checkout_url) {
      console.error(`[create-deposit] Payment gateway ${selectedProviderKey} succeeded but returned no checkout URL.`);
      return res.status(502).json({
        success: false,
        error: "Payment gateway failed to return a valid checkout URL."
      });
    }

    const depositDoc = {
      depositId: paymentId,
      paymentId: paymentId,
      userId: resolvedUserId,
      playerId: resolvedUserId,
      amount: numAmount,
      currency: currency || (isCrypto ? 'USD' : 'INR'),
      network: selectedNetwork,
      method: providerName,
      provider: selectedProviderKey,
      status: 'pending',
      checkout_url: checkout_url,
      payment_url: checkout_url,
      paymentUrl: checkout_url,
      walletAddress: gatewayResponse.walletAddress || '',
      qrCodeUrl: gatewayResponse.qrCodeUrl || '',
      createdAt: timestamp,
      updatedAt: timestamp,
      timestamp: timestamp,
      details: `${providerName} Deposit: ${currencySymbol}${numAmount} (${selectedNetwork})`
    };

    const depositRef = doc(db, 'deposits', paymentId);
    await setDoc(depositRef, depositDoc);

    await addPaymentLog(
      'info',
      selectedProviderKey,
      `Deposit request generated: ${paymentId} for ${currencySymbol}${numAmount} via ${providerName}`,
      `Player: ${resolvedUserId}`
    );

    return res.status(200).json({
      success: true,
      depositId: paymentId,
      paymentId: paymentId,
      userId: resolvedUserId,
      amount: numAmount,
      currency: currency || (isCrypto ? 'USD' : 'INR'),
      status: 'pending',
      checkout_url: checkout_url,
      payment_url: checkout_url,
      paymentUrl: checkout_url,
      invoice_url: checkout_url,
      createdAt: timestamp,
      updatedAt: timestamp
    });

  } catch (error) {
    console.error("Error in create-deposit handler:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}
