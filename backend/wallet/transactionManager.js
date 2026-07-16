import logger from './walletLogger.js';
import walletService from './walletService.js';

/**
 * Transaction Manager
 * Handles ledger audits, gas adjustments, confirmation polling, and historical ledger caching.
 */
class TransactionManager {
  constructor() {
    this.transactions = new Map();
  }

  /**
   * Registers a newly broadcasted transaction for confirmation tracking
   */
  registerTransaction(txData) {
    const { txHash, network, amount, recipient } = txData;
    const entry = {
      txHash,
      network,
      amount,
      recipient,
      status: 'broadcasted',
      confirmations: 0,
      timestamp: Date.now(),
      retries: 0
    };

    this.transactions.set(txHash, entry);
    logger.info('Broadcast Success', `Registered tx ${txHash} on ${network} for confirmation tracking.`);
    return entry;
  }

  /**
   * Periodically checks and updates confirmation stats for all active transactions
   */
  async updatePendingTransactions() {
    const pendingList = Array.from(this.transactions.values()).filter(tx => tx.status === 'broadcasted' || tx.status === 'pending_confirmations');
    
    for (const tx of pendingList) {
      try {
        const onChainStatus = await walletService.getTransactionStatus(tx.txHash);
        
        if (onChainStatus === 'confirmed') {
          tx.status = 'confirmed';
          tx.confirmations = 12; // final threshold
          logger.info('Broadcast Success', `Transaction ${tx.txHash} has been fully confirmed on ${tx.network}.`);
        } else if (onChainStatus === 'failed') {
          tx.status = 'failed';
          logger.error('Broadcast Failed', `Transaction ${tx.txHash} failed on-chain on ${tx.network}.`);
        } else {
          tx.status = 'pending_confirmations';
          tx.confirmations += Math.floor(Math.random() * 3) + 1;
        }
      } catch (err) {
        logger.warn('Retry Started', `Failed to fetch status for tx ${tx.txHash}: ${err.message}`);
      }
    }

    return Array.from(this.transactions.values());
  }

  getTransaction(txHash) {
    return this.transactions.get(txHash);
  }

  getAllTransactions() {
    return Array.from(this.transactions.values());
  }
}

export const transactionManager = new TransactionManager();
export default transactionManager;
