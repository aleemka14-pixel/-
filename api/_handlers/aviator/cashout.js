import walletService from '../../../services/wallet-service.js';
import { db } from '../../_services/payment-service.js';
import { doc, getDoc, runTransaction } from 'firebase/firestore';

/**
 * API Handler: /api/aviator/cashout
 * Validates cashout multiplier and awards payout atomically via Firestore transaction.
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
    const { userId, betId, currentMultiplier, isDemo } = req.body || {};

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    if (!betId) {
      return res.status(400).json({ success: false, error: 'betId is required' });
    }

    const multiplier = Number(currentMultiplier);
    if (isNaN(multiplier) || multiplier < 1.0) {
      return res.status(400).json({ success: false, error: 'Invalid cashout multiplier' });
    }

    if (isDemo) {
      return res.status(200).json({
        success: true,
        betId,
        cashoutMultiplier: multiplier,
        isDemo: true,
        message: 'Demo cashout successful'
      });
    }

    const betRef = doc(db, 'bets', betId);
    
    // Execute atomic cashout in Firestore transaction
    const result = await runTransaction(db, async (txn) => {
      const betSnap = await txn.get(betRef);
      if (!betSnap.exists()) {
        throw new Error('Bet document not found');
      }

      const betData = betSnap.data();
      if (betData.playerId !== userId) {
        throw new Error('Unauthorized cashout attempt');
      }
      if (betData.status !== 'pending' && betData.status !== 'active') {
        throw new Error(`Bet already settled or inactive (status: ${betData.status})`);
      }

      const betAmount = Number(betData.amount || 0);
      const payoutAmount = parseFloat((betAmount * multiplier).toFixed(2));
      const profit = parseFloat((payoutAmount - betAmount).toFixed(2));
      const now = Date.now();

      // Mark bet as won in transaction
      txn.update(betRef, {
        status: 'won',
        cashoutMultiplier: multiplier,
        payoutAmount,
        profit,
        resolvedAt: now,
        updatedAt: now
      });

      return {
        betAmount,
        payoutAmount,
        profit
      };
    });

    // Credit winnings to user wallet via WalletServiceTS
    const walletRes = await walletService.gameWin(userId, result.payoutAmount, {
      description: `Aviator Cashout @ ${multiplier.toFixed(2)}x (Payout: ₹${result.payoutAmount})`,
      game: 'Aviator',
      betId,
      multiplier,
      profit: result.profit,
      source: 'aviator_cashout'
    }, `aviator_win_${betId}`);

    return res.status(200).json({
      success: true,
      betId,
      multiplier,
      payoutAmount: result.payoutAmount,
      profit: result.profit,
      balanceAfter: walletRes.balanceAfter,
      transactionId: walletRes.transactionId
    });

  } catch (error) {
    console.error('[API /api/aviator/cashout Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Cashout failed'
    });
  }
}
