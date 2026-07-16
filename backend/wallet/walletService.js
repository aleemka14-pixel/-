import walletFactory from './walletFactory.js';
import logger from './walletLogger.js';

/**
 * Wallet Service Layer
 * The absolute master entrypoint for all incoming or outgoing blockchain payment actions.
 * Ensures strict decoupling between client apps, backend routes, and active coin providers.
 */
class WalletService {
  /**
   * Dispatches a live withdrawal transfer on the active provider
   */
  async sendWithdrawal({ network, toAddress, amount }) {
    const provider = walletFactory.getActiveProvider();
    logger.info('Withdrawal Created', `Draining hot wallet: Initiating ${amount} USDT transfer to ${toAddress} via ${provider.name} on network ${network}`);
    
    try {
      const result = await provider.sendTransaction({ network, toAddress, amount });
      return result;
    } catch (e) {
      logger.error('Broadcast Failed', `Transfer failed via provider ${provider.name} on ${network}: ${e.message}`, {
        network,
        toAddress,
        amount
      });
      throw e;
    }
  }

  /**
   * Retrieves the current balance of the active provider hot wallet on specified network
   */
  async getBalance(network) {
    const provider = walletFactory.getActiveProvider();
    return await provider.getBalance(network);
  }

  /**
   * Validates if a target transfer destination address format is correct
   */
  validateWallet(address) {
    const provider = walletFactory.getActiveProvider();
    return provider.validateAddress(address);
  }

  /**
   * Resolves the current state of a ledger transaction block
   */
  async getTransactionStatus(txHash) {
    const provider = walletFactory.getActiveProvider();
    return await provider.getTransactionStatus(txHash);
  }

  /**
   * Queries real-time gas or throughput costs for settlement
   */
  async estimateNetworkFee(network) {
    const provider = walletFactory.getActiveProvider();
    return await provider.estimateFee({ network });
  }

  /**
   * Performs an immediate provider connectivity diagnostic check
   */
  async healthCheck() {
    const provider = walletFactory.getActiveProvider();
    return await provider.healthCheck();
  }
}

export const walletService = new WalletService();
export default walletService;
