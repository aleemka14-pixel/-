import { 
  db, 
  getPaymentSettings, 
  addPaymentLog 
} from '../../_services/payment-service.js';
import { doc, setDoc } from 'firebase/firestore';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-upi-secret'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed. Only POST requests are supported.'
    });
  }

  try {
    const { userId, playerId, amount, provider, upiId, currency } = req.body || {};
    const resolvedUserId = userId || playerId;

    if (!resolvedUserId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: userId or playerId.'
      });
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid deposit amount.'
      });
    }

    const numAmount = Number(amount);
    const settings = await getPaymentSettings().catch(() => ({}));

    if (settings.maintenanceMode) {
      return res.status(403).json({
        success: false,
        error: 'Payment system is currently under maintenance.'
      });
    }

    const minRequired = settings.upiSettings?.minDepositInr || 10;
    const maxRequired = settings.upiSettings?.maxDepositInr || 100000;

    if (numAmount < minRequired || numAmount > maxRequired) {
      return res.status(400).json({
        success: false,
        error: `UPI deposit amount ₹${numAmount} is outside allowed range [₹${minRequired} - ₹${maxRequired}].`
      });
    }

    if (currency && currency.toUpperCase() !== 'INR') {
      return res.status(400).json({
        success: false,
        error: 'Invalid currency. Only INR is supported for UPI deposits.'
      });
    }

    const timestamp = Date.now();
    const orderId = `upi_ord_${timestamp}_${Math.random().toString(36).substring(2, 7)}`;
    const selectedProvider = provider || 'upi_gateway';
    const merchantUpi = upiId || settings.providers?.upi?.credentials?.upiId || settings.upiSettings?.vpa || settings.upiVpa || 'merchant@upi';
    const selectedCurrency = 'INR';

    const upiString = `upi://pay?pa=${encodeURIComponent(merchantUpi)}&pn=${encodeURIComponent('Matrix Casino')}&am=${numAmount}&tr=${orderId}&tn=${encodeURIComponent(`Deposit Ref ${orderId}`)}&cu=${selectedCurrency}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiString)}`;

    const depositDoc = {
      depositId: orderId,
      id: orderId,
      userId: resolvedUserId,
      playerId: resolvedUserId,
      amount: numAmount,
      currency: selectedCurrency,
      network: 'UPI',
      method: 'upi',
      provider: selectedProvider,
      paymentId: '',
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
      timestamp: timestamp,
      upiString,
      upiLink: upiString,
      qrData: upiString,
      qrCodeUrl,
      merchantUpi,
      upiVpa: merchantUpi,
      gatewayPayload: {}
    };

    const depositRef = doc(db, 'deposits', orderId);
    await setDoc(depositRef, depositDoc);

    await addPaymentLog(
      'info',
      'upi',
      `UPI deposit order created: ${orderId} | User: ${resolvedUserId} | Amount: ₹${numAmount}`,
      `Provider: ${selectedProvider} | UPI ID: ${merchantUpi}`
    );

    return res.status(200).json({
      success: true,
      orderId,
      depositId: orderId,
      userId: resolvedUserId,
      amount: numAmount,
      currency: selectedCurrency,
      status: 'pending',
      upiString,
      upiLink: upiString,
      qrData: upiString,
      qrCodeUrl,
      merchantUpi,
      upiVpa: merchantUpi,
      provider: selectedProvider,
      createdAt: timestamp
    });

  } catch (err) {
    console.error('[UPI Create Order Error]:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create UPI deposit order.'
    });
  }
}
