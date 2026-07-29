import verifyWalletIntegrity from '../../../services/wallet-integrity-check.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { userId } = req.query || req.body || {};
    const report = await verifyWalletIntegrity(userId || null);

    return res.status(200).json({
      success: true,
      report
    });
  } catch (err) {
    console.error('[Admin Wallet Integrity API Error]:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to execute wallet integrity audit'
    });
  }
}
