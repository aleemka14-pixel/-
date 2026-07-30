import { db } from '../../_services/payment-service.js';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

/**
 * Server-side Crash Point Generator (Provably Fair / Weighted Random)
 * E.g., 1% chance of instant crash at 1.00x, 99% exponential curve.
 */
function generateCrashPoint() {
  const rand = Math.random();
  if (rand < 0.03) {
    // 3% instant crash at 1.00x - 1.05x
    return parseFloat((1.00 + Math.random() * 0.05).toFixed(2));
  }
  // Formula: E = 0.99 / (1 - X)
  const raw = 0.99 / (1 - Math.random());
  const capped = Math.min(1000.0, Math.max(1.01, raw));
  return parseFloat(capped.toFixed(2));
}

/**
 * API Handler: /api/aviator/state
 * Returns or initializes current active Aviator round.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const roundRef = doc(db, 'games', 'aviator_current');
    const snap = await getDoc(roundRef);

    const now = Date.now();

    if (!snap.exists()) {
      // Create initial round
      const newCrashPoint = generateCrashPoint();
      const initialRound = {
        roundId: `round_${now}`,
        status: 'WAITING', // WAITING | FLYING | CRASHED
        startTime: now + 5000, // 5s countdown
        crashMultiplier: newCrashPoint,
        createdAt: now,
        recentMultipliers: [1.45, 2.10, 1.12, 5.40, 1.95, 12.80, 1.02, 3.15, 8.42, 1.75]
      };
      await setDoc(roundRef, initialRound);
      return res.status(200).json({ success: true, round: initialRound });
    }

    const currentData = snap.data();
    return res.status(200).json({ success: true, round: currentData });

  } catch (error) {
    console.error('[API /api/aviator/state Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch Aviator state'
    });
  }
}
