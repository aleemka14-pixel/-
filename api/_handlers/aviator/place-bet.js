import walletService from '../../../services/wallet-service.js';
import { db } from '../../_services/payment-service.js';
import { doc, getDoc, setDoc, runTransaction, collection } from 'firebase/firestore';

/**
 * API Handler: /api/aviator/place-bet
 * Places a bet for Aviator Crash game using server-side wallet transaction.
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
    const { userId, amount, roundId, autoCashout, isDemo } = req.body || {};

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid bet amount' });
    }

    const autoCashoutNum = autoCashout ? Number(autoCashout) : null;
    if (autoCashoutNum !== null && (isNaN(autoCashoutNum) || autoCashoutNum < 1.01)) {
      return res.status(400).json({ success: false, error: 'Auto cashout multiplier must be at least 1.01x' });
    }

    if (isDemo) {
      // Demo bet
      const betId = `bet_aviator_demo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      return res.status(200).json({
        success: true,
        betId,
        amount: numAmount,
        roundId,
        isDemo: true,
        autoCashout: autoCashoutNum,
        message: 'Demo bet placed successfully'
      });
    }

    // Real Mode: Deduct balance atomically
    const idempotencyKey = `aviator_bet_${userId}_${roundId || Date.now()}_${Date.now()}`;
    const result = await walletService.executeWalletTransaction({
      userId,
      type: 'game_loss', // Initial deduction for wager
      amount: numAmount,
      metadata: {
        description: `Aviator Bet placed (Round: ${roundId || 'current'})`,
        game: 'Aviator',
        roundId: roundId || 'current',
        source: 'aviator_place_bet'
      },
      idempotencyKey
    });

    const betId = `bet_aviator_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const betDocRef = doc(collection(db, 'bets'), betId);

    const now = Date.now();
    await setDoc(betDocRef, {
      betId,
      roundId: roundId || 'current',
      playerId: userId,
      amount: numAmount,
      autoCashout: autoCashoutNum,
      status: 'pending',
      game: 'Aviator',
      isDemo: false,
      createdAt: now,
      transactionId: result.transactionId
    });

    return res.status(200).json({
      success: true,
      betId,
      roundId: roundId || 'current',
      amount: numAmount,
      autoCashout: autoCashoutNum,
      balanceAfter: result.balanceAfter,
      transactionId: result.transactionId
    });

  } catch (error) {
    console.error('[API /api/aviator/place-bet Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to place bet'
    });
  }
}
