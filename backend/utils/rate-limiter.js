import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

/**
 * Enforces rate limiting on withdrawal requests per user:
 * 1. Cooldown window (min 60 seconds between consecutive requests)
 * 2. Hourly request limit (max 3 withdrawal requests per hour)
 */
export async function checkWithdrawalRateLimit(db, userId, options = {}) {
  const cooldownSeconds = options.cooldownSeconds || 60; // 60s cooldown
  const maxPerHour = options.maxPerHour || 3; // Max 3 requests per hour

  if (!userId || !db) {
    return { allowed: true };
  }

  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const cooldownThreshold = now - (cooldownSeconds * 1000);

  try {
    const withdrawalsRef = collection(db, 'withdrawals');
    const hourlyQuery = query(
      withdrawalsRef,
      where('playerId', '==', userId),
      where('timestamp', '>=', oneHourAgo),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const snap = await getDocs(hourlyQuery);
    const recentRequests = snap.docs.map(d => d.data());

    if (recentRequests.length === 0) {
      return { allowed: true, hourlyCount: 0 };
    }

    // 1. Check Cooldown
    const mostRecent = recentRequests[0];
    if (mostRecent.timestamp && mostRecent.timestamp > cooldownThreshold) {
      const remainingMs = mostRecent.timestamp + (cooldownSeconds * 1000) - now;
      const remainingSec = Math.ceil(remainingMs / 1000);
      return {
        allowed: false,
        error: `Withdrawal request cooldown active. Please wait ${remainingSec} second(s) before submitting another request.`,
        errorCode: 'COOLDOWN_ACTIVE',
        cooldownRemainingMs: remainingMs,
        hourlyCount: recentRequests.length
      };
    }

    // 2. Check Hourly Limit
    if (recentRequests.length >= maxPerHour) {
      return {
        allowed: false,
        error: `Maximum withdrawal limit exceeded. You can only submit up to ${maxPerHour} withdrawal requests per hour.`,
        errorCode: 'HOURLY_LIMIT_EXCEEDED',
        hourlyCount: recentRequests.length
      };
    }

    return {
      allowed: true,
      hourlyCount: recentRequests.length
    };

  } catch (e) {
    console.warn("[RateLimiter] Firestore index or query issue, falling back safely:", e.message);
    // Safe fallback if composite query fails due to index missing
    return { allowed: true, hourlyCount: 0 };
  }
}
