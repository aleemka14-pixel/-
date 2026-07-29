import { db, addPaymentLog } from '../_services/payment-service.js';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit as limitDoc, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc 
} from 'firebase/firestore';
import walletService from '../../services/wallet-service.js';
import { withdrawalService } from '../../backend/services/withdrawal-service.js';

/**
 * Vercel Serverless Function: /api/admin/payments
 * Complete Admin Payment & Transaction Monitoring System.
 * Supports searching, filtering deposits/withdrawals, retrying missed webhooks, and log views.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-admin-token'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const action = req.query.action || (req.body && req.body.action) || 'summary';
    const limitVal = Number(req.query.limit || (req.body && req.body.limit) || 50);

    // 1. Payment Summary Metrics
    if (action === 'summary') {
      const depositsRef = collection(db, 'deposits');
      const withdrawalsRef = collection(db, 'withdrawals');

      const recentDepositsSnap = await getDocs(query(depositsRef, limitDoc(100)));
      const recentWithdrawalsSnap = await getDocs(query(withdrawalsRef, limitDoc(100)));

      let totalDepositVol = 0;
      let totalWithdrawalVol = 0;
      let pendingDeposits = 0;
      let pendingWithdrawals = 0;
      let completedDeposits = 0;
      let completedWithdrawals = 0;

      recentDepositsSnap.forEach((dSnap) => {
        const d = dSnap.data();
        if (d.status === 'completed' || d.status === 'confirmed') {
          totalDepositVol += Number(d.amount || 0);
          completedDeposits++;
        } else if (d.status === 'pending') {
          pendingDeposits++;
        }
      });

      recentWithdrawalsSnap.forEach((wSnap) => {
        const w = wSnap.data();
        if (w.status === 'completed') {
          totalWithdrawalVol += Number(w.amount || 0);
          completedWithdrawals++;
        } else if (w.status === 'pending') {
          pendingWithdrawals++;
        }
      });

      return res.status(200).json({
        success: true,
        summary: {
          totalDepositVol,
          totalWithdrawalVol,
          pendingDeposits,
          pendingWithdrawals,
          completedDeposits,
          completedWithdrawals,
          timestamp: Date.now()
        }
      });
    }

    // 2. List Deposits with Filters
    if (action === 'list_deposits') {
      const { status, method, userId, search } = req.body || req.query || {};
      const depositsRef = collection(db, 'deposits');

      let q = query(depositsRef, limitDoc(limitVal));
      if (status) {
        q = query(depositsRef, where('status', '==', status), limitDoc(limitVal));
      }

      const snap = await getDocs(q);
      let deposits = [];
      snap.forEach((dDoc) => {
        const data = dDoc.data();
        if (userId && data.userId !== userId && data.playerId !== userId) return;
        if (method && data.method !== method && data.network !== method) return;
        if (search) {
          const s = search.toLowerCase();
          const matchId = (data.depositId || dDoc.id || '').toLowerCase().includes(s);
          const matchUser = (data.userId || '').toLowerCase().includes(s);
          const matchTx = (data.paymentId || data.utr || '').toLowerCase().includes(s);
          if (!matchId && !matchUser && !matchTx) return;
        }
        deposits.push({ id: dDoc.id, ...data });
      });

      // Sort newest first
      deposits.sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));

      return res.status(200).json({
        success: true,
        count: deposits.length,
        deposits
      });
    }

    // 3. List Withdrawals with Filters
    if (action === 'list_withdrawals') {
      const { status, network, userId, search } = req.body || req.query || {};
      const withdrawalsRef = collection(db, 'withdrawals');

      let q = query(withdrawalsRef, limitDoc(limitVal));
      if (status) {
        q = query(withdrawalsRef, where('status', '==', status), limitDoc(limitVal));
      }

      const snap = await getDocs(q);
      let withdrawals = [];
      snap.forEach((wDoc) => {
        const data = wDoc.data();
        if (userId && data.userId !== userId && data.playerId !== userId) return;
        if (network && data.network !== network && data.blockchain !== network) return;
        if (search) {
          const s = search.toLowerCase();
          const matchId = (data.withdrawalId || wDoc.id || '').toLowerCase().includes(s);
          const matchUser = (data.userId || '').toLowerCase().includes(s);
          const matchAddr = (data.destinationAddress || data.walletAddress || '').toLowerCase().includes(s);
          if (!matchId && !matchUser && !matchAddr) return;
        }
        withdrawals.push({ id: wDoc.id, ...data });
      });

      withdrawals.sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));

      return res.status(200).json({
        success: true,
        count: withdrawals.length,
        withdrawals
      });
    }

    // 4. Manual Deposit Retry / Force Credit
    if (action === 'retry_deposit') {
      const { depositId, adminId, reason } = req.body || {};

      if (!depositId) {
        return res.status(400).json({
          success: false,
          error: 'Missing depositId for retry action.'
        });
      }

      const depositRef = doc(db, 'deposits', depositId);
      const depositSnap = await getDoc(depositRef);

      if (!depositSnap.exists()) {
        return res.status(404).json({
          success: false,
          error: `Deposit '${depositId}' not found.`
        });
      }

      const data = depositSnap.data();
      const resolvedUserId = data.userId || data.playerId;
      const amount = Number(data.amount);

      if (data.status === 'completed' && data.credited) {
        return res.status(400).json({
          success: false,
          error: `Deposit '${depositId}' is already credited.`
        });
      }

      // Credit wallet via wallet service
      const walletRes = await walletService.deposit(
        resolvedUserId,
        amount,
        {
          depositId,
          adminId: adminId || 'admin_manual',
          reason: reason || 'Manual Admin Credit Override',
          source: 'admin_retry',
          description: `Manual Deposit Credit by Admin (${adminId || 'admin'}): $${amount}`
        },
        `manual_dep_${depositId}`,
        db
      );

      const timestampNow = Date.now();
      await updateDoc(depositRef, {
        status: 'completed',
        credited: true,
        creditedAt: timestampNow,
        completedAt: timestampNow,
        adminNotes: `Manually credited by admin ${adminId || 'admin'}: ${reason || 'N/A'}`,
        updatedAt: timestampNow
      });

      await addPaymentLog(
        'info',
        'admin',
        `Deposit ${depositId} manually credited by admin ${adminId || 'admin'}. Amount: $${amount}`,
        `Reason: ${reason || 'Manual override'}`
      );

      return res.status(200).json({
        success: true,
        message: `Deposit ${depositId} successfully credited to user ${resolvedUserId}.`,
        newBalance: walletRes.balanceAfter
      });
    }

    // 5. Payment Logs
    if (action === 'payment_logs') {
      const logsRef = collection(db, 'paymentLogs');
      const snap = await getDocs(query(logsRef, limitDoc(limitVal)));
      let logs = [];
      snap.forEach((lDoc) => logs.push({ id: lDoc.id, ...lDoc.data() }));
      logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      return res.status(200).json({
        success: true,
        count: logs.length,
        logs
      });
    }

    return res.status(400).json({
      success: false,
      error: `Unknown admin action '${action}'. Supported: summary, list_deposits, list_withdrawals, retry_deposit, payment_logs`
    });

  } catch (err) {
    console.error('[Admin Payments API Error]:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to execute admin payment action.'
    });
  }
}
