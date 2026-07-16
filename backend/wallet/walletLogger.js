/**
 * Wallet Logger Service
 * Provides standardized, structured, and auditable logs for all wallet-related operations,
 * queue transitions, balance warnings, and health checks.
 */
class WalletLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 500; // Limit in-memory cache
  }

  log(level, event, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      event,
      message,
      metadata
    };

    // Print to server output
    console.log(`[${timestamp}] [WALLET_${level.toUpperCase()}] [${event}] ${message}`, Object.keys(metadata).length ? JSON.stringify(metadata) : '');

    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    return logEntry;
  }

  info(event, message, metadata = {}) {
    return this.log('INFO', event, message, metadata);
  }

  warn(event, message, metadata = {}) {
    return this.log('WARN', event, message, metadata);
  }

  error(event, message, metadata = {}) {
    return this.log('ERROR', event, message, metadata);
  }

  getLogs() {
    return this.logs;
  }
}

export const logger = new WalletLogger();
export default logger;
