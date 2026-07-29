import walletService from '../../../services/wallet-service.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { userId, type, amount, metadata, idempotencyKey } = req.body || {};

    if (!userId || !type || amount === undefined) {
      return res.status(400).json({ success: false, error: 'userId, type, and amount are required' });
    }

    const result = await walletService.executeWalletTransaction({
      userId,
      type,
      amount: Number(amount),
      metadata: metadata || {},
      idempotencyKey: idempotencyKey || null
    });

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error('[API Wallet Transaction Error]:', err);
    return res.status(400).json({
      success: false,
      error: err.message || 'Transaction processing failed'
    });
  }
}
