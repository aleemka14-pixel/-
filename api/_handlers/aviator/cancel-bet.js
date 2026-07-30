import walletService from '../../../services/wallet-service.js';
import { db } from '../../_services/payment-service.js';
import { doc, getDoc, runTransaction } from 'firebase/firestore';

/**
 * API Handler: /api/aviator/cancel-bet
 * Cancels pending bet before round takes off and refunds full bet amount.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { userId, betId, isDemo } = req.body || {};

    if (!userId || !betId) {
      return res.status(400).json({ success: false, error: 'userId and betId are required' });
    }

    if (isDemo) {
      return res.status(200).json({ success: true, isDemo: true, message: 'Demo bet cancelled' });
    }

    const betRef = doc(db, 'bets', betId);

    const result = await runTransaction(db, async (txn) => {
      const betSnap = await txn.get(betRef);
      if (!betSnap.exists()) {
        throw new Error('Bet document not found');
      }

      const betData = betSnap.data();
      if (betData.playerId !== userId) {
        throw new Error('Unauthorized cancel attempt');
      }
      if (betData.status !== 'pending') {
        throw new Error('Cannot cancel a bet that is not pending');
      }

      const refundAmount = Number(betData.amount || 0);
      const now = Date.now();

      txn.update(betRef, {
        status: 'cancelled',
        refundedAt: now,
        updatedAt: now
      });

      return { refundAmount };
    });

    const walletRes = await walletService.bonus(userId, result.refundAmount, {
      description: `Aviator Bet Cancelled — Full Refund (₹${result.refundAmount})`,
      game: 'Aviator',
      betId,
      source: 'aviator_cancel_bet'
    }, `aviator_refund_${betId}`);

    return res.status(200).json({
      success: true,
      betId,
      refundAmount: result.refundAmount,
      balanceAfter: walletRes.balanceAfter
    });

  } catch (error) {
    console.error('[API /api/aviator/cancel-bet Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel bet'
    });
  }
}
