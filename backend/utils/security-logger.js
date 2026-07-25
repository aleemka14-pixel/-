import { doc, setDoc } from 'firebase/firestore';

/**
 * Utility to scrub sensitive fields (private keys, secrets, tokens, seed phrases, passwords)
 * from object logs to prevent accidental exposure in console or storage.
 */
export function redactSensitive(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitive(item));
  }

  const SENSITIVE_KEYS = [
    'privatekey', 'private_key', 'secret', 'password', 'token',
    'seed', 'mnemonic', 'auth', 'passphrase', 'apikey', 'api_key'
  ];

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(k => lowerKey.includes(k))) {
      sanitized[key] = '[REDACTED_SENSITIVE_DATA]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = redactSensitive(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Logs security and failure events cleanly without exposing sensitive information.
 * Writes to server console and Firestore securityLogs collection.
 */
export async function logSecurityEvent(db, {
  type = 'SECURITY_EVENT',
  userId = null,
  message,
  details = {},
  ip = '127.0.0.1',
  severity = 'info' // 'info' | 'warning' | 'high' | 'critical'
}) {
  const timestamp = Date.now();
  const sanitizedDetails = redactSensitive(details);

  const logConsoleMsg = `[SECURITY LOG][${severity.toUpperCase()}][${type}] User: ${userId || 'N/A'} - ${message}`;
  if (severity === 'critical' || severity === 'high') {
    console.error(logConsoleMsg, sanitizedDetails);
  } else if (severity === 'warning') {
    console.warn(logConsoleMsg, sanitizedDetails);
  } else {
    console.log(logConsoleMsg, sanitizedDetails);
  }

  if (db) {
    try {
      const logId = `SEC-${timestamp}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const logRef = doc(db, 'securityLogs', logId);
      await setDoc(logRef, {
        id: logId,
        type,
        userId,
        message,
        details: sanitizedDetails,
        ip,
        severity,
        timestamp,
        createdAt: new Date(timestamp).toISOString()
      });
    } catch (e) {
      console.warn("[Security Logger] Failed to persist security log to Firestore:", e.message);
    }
  }
}
