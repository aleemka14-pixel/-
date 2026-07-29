import { reliabilityManager } from '../../backend/services/reliability-manager.js';

/**
 * Vercel Serverless Function Handler: health
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const health = await reliabilityManager.runHealthCheck();
    
    const dbStatus = health.services?.firebase?.status === 'healthy' ? 'online' : 'degraded';
    const walletStatus = health.services?.walletProvider?.status === 'healthy' ? 'operational' : 'degraded';
    const paymentStatus = health.services?.paymentGateway?.status === 'healthy' ? 'operational' : 'degraded';
    
    const overallStatus = (dbStatus === 'online' && walletStatus === 'operational' && paymentStatus === 'operational')
      ? 'healthy'
      : 'degraded';

    return res.status(200).json({
      status: overallStatus,
      database: dbStatus,
      walletService: walletStatus,
      paymentService: paymentStatus,
      timestamp: health.timestamp || Date.now(),
      details: health.services
    });
  } catch (error) {
    console.error("[API /api/health Error]:", error);
    return res.status(500).json({
      status: 'error',
      database: 'unknown',
      walletService: 'unknown',
      paymentService: 'unknown',
      timestamp: Date.now(),
      error: error.message || "Internal Server Error"
    });
  }
}
