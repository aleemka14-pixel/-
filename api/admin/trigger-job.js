import { reliabilityManager } from '../../backend/services/reliability-manager.js';

/**
 * Serverless API Endpoint: POST /api/admin/trigger-job
 * 
 * Securely triggers a registered background job instantly.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { jobName, adminRole = 'Super Admin' } = req.body;

    if (!jobName) {
      return res.status(400).json({ success: false, error: "Missing jobName parameter in request body." });
    }

    // Access control check
    if (adminRole === 'Support') {
      return res.status(403).json({
        success: false,
        error: "Forbidden: Support role does not have execution permission."
      });
    }

    console.log(`[Manual Trigger API] Triggering background job: "${jobName}" on demand...`);
    await reliabilityManager.runJobOnDemand(jobName);

    return res.status(200).json({
      success: true,
      message: `Background job "${jobName}" was successfully triggered and executed on-demand.`
    });
  } catch (error) {
    console.error(`[Manual Trigger API Error] "${req.body?.jobName}":`, error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error"
    });
  }
}
