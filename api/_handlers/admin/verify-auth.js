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
    const { type, value } = req.body;

    if (!type || value === undefined) {
      return res.status(400).json({ success: false, error: "Missing required parameters: 'type' and 'value'" });
    }

    if (type === 'login') {
      const expectedPasskey = process.env.ADMIN_PASSKEY || '9113278916';
      if (value === expectedPasskey) {
        return res.status(200).json({ success: true });
      } else {
        return res.status(401).json({ success: false, error: "Authentication Failed: Signal Terminated" });
      }
    } else if (type === 'confirm') {
      const expectedConfirmPassword = process.env.ADMIN_CONFIRM_PASSWORD || 'admin123';
      if (value === expectedConfirmPassword) {
        return res.status(200).json({ success: true });
      } else {
        return res.status(401).json({ success: false, error: "Invalid authorization password" });
      }
    } else {
      return res.status(400).json({ success: false, error: "Invalid verification type. Expected 'login' or 'confirm'" });
    }
  } catch (error) {
    console.error("[Verify Auth Error]:", error);
    return res.status(500).json({ success: false, error: "Internal Server Error" });
  }
}
