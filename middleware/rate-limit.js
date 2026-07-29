/**
 * Production Rate Limiter Middleware
 * 
 * Protects critical endpoints:
 * - /api/webhook & /api/payment-webhook
 * - /api/create-deposit & /api/create-upi-deposit
 * - /api/create-withdraw
 * - /api/admin/*
 */

const requestCounts = new Map();

// Clean up stale IP records every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requestCounts.entries()) {
    if (now - record.resetTime > 60000) {
      requestCounts.delete(key);
    }
  }
}, 300000);

export function rateLimiter(options = {}) {
  const windowMs = options.windowMs || 60000; // 1 minute window
  const maxRequests = options.max || 30; // Max requests per window
  const endpointName = options.name || 'default';

  return function rateLimitMiddleware(req, res, next) {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const key = `${endpointName}:${clientIp}`;
    const now = Date.now();

    let record = requestCounts.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      requestCounts.set(key, record);
    } else {
      record.count++;
    }

    if (record.count > maxRequests) {
      console.warn(`[RATE LIMIT EXCEEDED] IP: ${clientIp} on endpoint: ${endpointName} (${record.count}/${maxRequests})`);
      
      if (res && typeof res.status === 'function') {
        return res.status(429).json({
          success: false,
          error: `Rate limit exceeded for ${endpointName}. Please wait before making further requests.`,
          retryAfterMs: record.resetTime - now
        });
      }
      return false;
    }

    if (next && typeof next === 'function') {
      return next();
    }
    return true;
  };
}

export const webhookRateLimit = rateLimiter({ windowMs: 10000, max: 15, name: 'webhook' });
export const depositRateLimit = rateLimiter({ windowMs: 30000, max: 10, name: 'deposit' });
export const withdrawRateLimit = rateLimiter({ windowMs: 60000, max: 5, name: 'withdraw' });
export const adminRateLimit = rateLimiter({ windowMs: 30000, max: 10, name: 'admin' });

export default rateLimiter;
