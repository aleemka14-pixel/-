import { reliabilityManager } from '../../backend/services/reliability-manager.js';

/**
 * Serverless API Endpoint: GET /api/admin/system-health
 * 
 * Fetches the centralized system health status and triggers an on-demand check if requested.
 */
export default async function handler(req, res) {
  try {
    // Perform live health check on demand
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
