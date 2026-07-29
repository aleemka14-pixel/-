import { reliabilityManager } from '../../../backend/services/reliability-manager.js';

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

  try {
    const health = await reliabilityManager.runHealthCheck();
    
    return res.status(200).json({
      success: true,
      health
    });
  } catch (error) {
    console.error("[API System Health Error]:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}
