import crypto from 'crypto';
import { doc, setDoc } from 'firebase/firestore';

/**
 * Enterprise Audit and Operational Logger
 * Formats, prints, and commits logs directly into the Firestore `auditLogs` collection.
 */
export class PaymentLogger {
  constructor(db) {
    this.db = db;
  }

  /**
   * Commits a standardized system log
   * @param {string} level - 'info' | 'warning' | 'error' | 'success'
   * @param {string} providerId - ID of active payment or wallet provider
   * @param {string} message - Primary log description
   * @param {string} details - Additional contextual data or metadata
   */
  async log(level, providerId, message, details = '') {
    const timestamp = Date.now();
    const logId = `AUD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Standard console format
    const consolePrefix = `[PAYMENT ENGINE] [${level.toUpperCase()}] [${providerId.toUpperCase()}]`;
    if (level === 'error') {
      console.error(`${consolePrefix} ${message}`, details);
    } else if (level === 'warning') {
      console.warn(`${consolePrefix} ${message}`, details);
    } else {
      console.log(`${consolePrefix} ${message}`, details);
    }

    // Attempt to persist to database
    if (this.db) {
      try {
        const logRef = doc(this.db, 'auditLogs', logId);
        await setDoc(logRef, {
          id: logId,
          logId,
          timestamp,
          level, // 'info' | 'warning' | 'error' | 'success'
          providerId,
          action: 'payment_event',
          module: 'payment_management',
          oldValue: level.toUpperCase(),
          newValue: message,
          details: typeof details === 'object' ? JSON.stringify(details) : String(details),
          createdAt: timestamp,
          ipAddress: '127.0.0.1'
        });
      } catch (err) {
        console.error('[PaymentLogger] Failed to write audit log to database:', err.message);
      }
    }
  }

  async info(providerId, message, details = '') {
    return this.log('info', providerId, message, details);
  }

  async warning(providerId, message, details = '') {
    return this.log('warning', providerId, message, details);
  }

  async error(providerId, message, details = '') {
    return this.log('error', providerId, message, details);
  }

  async success(providerId, message, details = '') {
    return this.log('success', providerId, message, details);
  }
}
