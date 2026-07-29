import { db } from '../../_services/payment-service.js';
import { doc, getDoc } from 'firebase/firestore';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const orderId = req.query.orderId || req.query.depositId || (req.body && (req.body.orderId || req.body.depositId));

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Missing orderId or depositId parameter.'
      });
    }

    const depositRef = doc(db, 'deposits', orderId);
    const depositSnap = await getDoc(depositRef);

    if (!depositSnap.exists()) {
      return res.status(404).json({
        success: false,
        error: `Deposit order '${orderId}' not found.`
      });
    }

    const data = depositSnap.data();
    const userId = data.userId || data.playerId;

    let userBalance = null;
    if (userId) {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        userBalance = Number(userSnap.data().walletBalance ?? userSnap.data().balance) || 0;
      }
    }

    return res.status(200).json({
      success: true,
      orderId,
      depositId: orderId,
      userId,
      amount: data.amount,
      currency: data.currency || 'INR',
      status: data.status,
      paymentId: data.paymentId || '',
      utr: data.utr || '',
      createdAt: data.createdAt,
      completedAt: data.completedAt || data.creditedAt || null,
      userBalance
    });

  } catch (err) {
    console.error('[UPI Status Error]:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch UPI deposit status.'
    });
  }
}
