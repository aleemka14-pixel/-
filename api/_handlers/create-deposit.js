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
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} Not Allowed. Deposit creation requires POST.`
    });
  }

  try {
    const { userId, playerId, amount, network, provider, currency } = req.body;
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

    const selectedNetwork = (network || 'TRC20').toUpperCase();
    const selectedProviderKey = provider || 'nowpayments';

    const providerConfig = settings.providers[selectedProviderKey];
    if (!providerConfig || !providerConfig.enabled) {
      return res.status(400).json({
        success: false,
        error: `Selected payment provider '${selectedProviderKey}' is currently unavailable.`
      });
    }

    const adapter = getProviderAdapter(providerConfig);

    const minRequired = providerConfig.minDeposit || 10;
    const maxRequired = providerConfig.maxDeposit || 50000;
    const cooldownSeconds = providerConfig.depositCooldown || 30;

    if (numAmount < minRequired || numAmount > maxRequired) {
      return res.status(400).json({
        success: false,
        error: `Deposit amount of $${numAmount} is outside allowed limits [Min: $${minRequired}, Max: $${maxRequired}].`
      });
    }

    try {
      const depositsRef = collection(db, 'deposits');
      const cooldownThreshold = Date.now() - cooldownSeconds * 1000;
      const q = query(
        depositsRef,
        where('playerId', '==', resolvedUserId),
        where('amount', '==', numAmount),
        where('network', '==', selectedNetwork),
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

    const gatewayResponse = await adapter.createPayment({
      amount: numAmount,
      currency: currency || 'USDT',
      network: selectedNetwork,
      orderId: `dep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: resolvedUserId
    });

    if (!gatewayResponse || !gatewayResponse.success) {
      await recordProviderFailure(selectedProviderKey, gatewayResponse.error || 'Failed to initialize payment gateway.');
      return res.status(502).json({
        success: false,
        error: gatewayResponse.error || "Payment gateway creation failed."
      });
    }

    const timestamp = Date.now();
    const paymentId = gatewayResponse.paymentId;

    const depositDoc = {
      depositId: paymentId,
      paymentId: paymentId,
      userId: resolvedUserId,
      playerId: resolvedUserId,
      amount: numAmount,
      network: selectedNetwork,
      method: selectedNetwork,
      provider: selectedProviderKey,
      status: 'pending',
      walletAddress: gatewayResponse.walletAddress || '',
      qrData: gatewayResponse.qrData || gatewayResponse.walletAddress || '',
      payAmount: gatewayResponse.payAmount || numAmount,
      payCurrency: gatewayResponse.payCurrency || selectedNetwork,
      createdAt: timestamp,
      updatedAt: timestamp,
      timestamp: timestamp,
      details: `USDT Deposit via ${selectedNetwork} (${selectedProviderKey})`
    };

    const depositRef = doc(db, 'deposits', paymentId);
    await setDoc(depositRef, depositDoc);

    await addPaymentLog(
      'info',
      selectedProviderKey,
      `Deposit request generated: ${paymentId} for $${numAmount} USDT (${selectedNetwork})`,
      `Player: ${resolvedUserId}`
    );

    return res.status(200).json({
      success: true,
      depositId: paymentId,
      paymentId: paymentId,
      userId: resolvedUserId,
      amount: numAmount,
      network: selectedNetwork,
      status: 'pending',
      walletAddress: gatewayResponse.walletAddress,
      qrData: gatewayResponse.qrData,
      payAmount: gatewayResponse.payAmount,
      payCurrency: gatewayResponse.payCurrency,
      expiresAt: gatewayResponse.expiresAt || timestamp + 3600000,
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
