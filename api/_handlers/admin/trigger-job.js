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

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { jobName, adminRole = 'Super Admin' } = req.body;

    if (!jobName) {
      return res.status(400).json({ success: false, error: "Missing jobName parameter in request body." });
    }

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
