import { walletService } from '../../../services/wallet-service.js';
import { db } from '../../_services/payment-service.js';
import { doc, setDoc } from 'firebase/firestore';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { userId, playerId, amount, description, reason, adminPasskey, idempotencyKey } = req.body;
    const targetUserId = userId || playerId;

    // Server-side Admin Auth Verification
    const expectedPasskey = process.env.ADMIN_PASSKEY || '9113278916';
    const authHeader = req.headers.authorization || '';
    const providedKey = adminPasskey || authHeader.replace('Bearer ', '');

    if (providedKey !== expectedPasskey) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Admin Passkey' });
    }

    if (!targetUserId) {
      return res.status(400).json({ success: false, error: 'Missing required parameter: userId or playerId' });
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid withdrawal amount' });
    }

    if (!reason && !description) {
      return res.status(400).json({ success: false, error: 'Reason or description is required for admin withdrawal' });
    }

    const numAmount = Number(amount);
    const keyToUse = idempotencyKey || `admin_wd_${targetUserId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const result = await walletService.withdraw(
      targetUserId,
      numAmount,
      {
        source: 'admin_manual_withdrawal',
        reason: reason || description,
        description: description || reason || `Admin Withdrawal: ₹${numAmount}`,
        currency: 'USDT',
        baseAmount: numAmount,
        baseCurrency: 'USDT'
      },
      keyToUse
    );

    // Write Audit Log
    try {
      const nowTs = Date.now();
      const auditId = `AUD-WD-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';

      await setDoc(doc(db, 'auditLogs', auditId), {
        action: 'admin_manual_withdrawal',
        userId: targetUserId,
        adminId: 'admin_server',
        timestamp: nowTs,
        ip: clientIp,
        device: userAgent,
        oldValue: result.balanceBefore,
        newValue: result.balanceAfter,
        reason: reason || description || 'Admin manual withdrawal'
      });
    } catch (auditErr) {
      console.warn("Audit log creation warning:", auditErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully debited ₹${numAmount} from user ${targetUserId}`,
      result
    });

  } catch (error) {
    console.error('CRITICAL: Admin Wallet Withdraw API Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
}
