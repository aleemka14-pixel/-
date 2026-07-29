import { 
  db, 
  getPaymentSettings, 
  getProviderAdapter, 
  recordProviderFailure, 
  addPaymentLog 
} from '../_services/payment-service.js';
import { doc, setDoc } from 'firebase/firestore';

/**
 * Vercel Serverless Function Handler: create-payment
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
      error: `Method ${req.method} Not Allowed. Creation requires POST.`
    });
  }

  try {
    const { userId, playerId, amount, network, provider = 'nowpayments', currency = 'USDT' } = req.body;
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
        error: "Missing or invalid payment amount."
      });
    }

    const numAmount = Number(amount);
    const settings = await getPaymentSettings();

    if (settings.maintenanceMode) {
      return res.status(403).json({
        success: false,
        error: "Payment infrastructure is currently under maintenance."
      });
    }

    const providerConfig = settings.providers[provider];
    if (!providerConfig || !providerConfig.enabled) {
      return res.status(400).json({
        success: false,
        error: `Selected payment provider '${provider}' is currently unavailable.`
      });
    }

    const adapter = getProviderAdapter(providerConfig);
    const orderId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const gatewayResponse = await adapter.createPayment({
      amount: numAmount,
      currency,
      network: network || 'TRC20',
      orderId,
      userId: resolvedUserId
    });

    if (!gatewayResponse || !gatewayResponse.success) {
      await recordProviderFailure(provider, gatewayResponse.error || 'Gateway initialization failure.');
      return res.status(502).json({
        success: false,
        error: gatewayResponse.error || "Payment gateway processing failed."
      });
    }

    const timestamp = Date.now();
    const paymentId = gatewayResponse.paymentId;

    const depositDoc = {
      depositId: paymentId,
      paymentId,
      userId: resolvedUserId,
      playerId: resolvedUserId,
      amount: numAmount,
      network: network || 'TRC20',
      provider,
      status: 'pending',
      walletAddress: gatewayResponse.walletAddress || '',
      qrData: gatewayResponse.qrData || gatewayResponse.walletAddress || '',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await setDoc(doc(db, 'deposits', paymentId), depositDoc);

    return res.status(200).json({
      success: true,
      paymentId,
      depositId: paymentId,
      userId: resolvedUserId,
      amount: numAmount,
      network: network || 'TRC20',
      status: 'pending',
      walletAddress: gatewayResponse.walletAddress,
      qrData: gatewayResponse.qrData,
      createdAt: timestamp
    });

  } catch (error) {
    console.error("Error in create-payment handler:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}
