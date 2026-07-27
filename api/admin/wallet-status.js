import { walletService } from '../../backend/services/wallet-service.js';

/**
 * Serverless API Endpoint: GET /api/admin/wallet-status
 * 
 * Securely retrieves hot wallet diagnostic statuses,
 * supported USDT network balances, connection states, and last transaction hashes.
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

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    const diagnostics = await walletService.getHealthStatus();
    return res.status(200).json({
      success: true,
      diagnostics
    });
  } catch (error) {
    console.error("Error in wallet-status API:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve hot wallet diagnostics."
    });
  }
}
