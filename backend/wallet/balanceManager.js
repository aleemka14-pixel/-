import walletService from './walletService.js';
import logger from './walletLogger.js';
import WALLET_CONFIG from './walletConfig.js';

/**
 * Balance Manager
 * Tracks Hot Wallet, Reserve Balances, and Safety Reserves.
 * Protects platform by monitoring thresholds and raising alarm logs.
 */
class BalanceManager {
  constructor() {
    this.safetyReserves = {
      trc20: 2000,
      bep20: 5000,
      erc20: 1000
    };
    this.reserveVaultBalances = {
      trc20: 150000,
      bep20: 250000,
      erc20: 500000
    };
  }

  /**
   * Evaluates if specified hot wallet has enough liquid capital
   * @param {string} network 
   * @param {number} amount 
   */
  async hasSufficientLiquidity(network, amount) {
    const netId = network.toLowerCase();
    const hotBalance = await walletService.getBalance(netId);
    const safetyReserve = this.safetyReserves[netId] || 0;

    // Must exceed safety reserve thresholds
    return (hotBalance - amount) >= safetyReserve;
  }

  /**
   * Get an aggregated overview of all system assets
   */
  async getAggregatedBalances() {
    const results = {};
    const networks = Object.keys(WALLET_CONFIG.networks);

    for (const net of networks) {
      try {
        const hot = await walletService.getBalance(net);
        const reserve = this.reserveVaultBalances[net] || 0;
        const safety = this.safetyReserves[net] || 0;

        results[net] = {
          hotWallet: hot,
          reserveVault: reserve,
          safetyReserve: safety,
          total: hot + reserve,
          isLow: hot < safety
        };

        if (hot < safety) {
          logger.warn('Balance Low', `Hot wallet balance for ${net.toUpperCase()} is below the safety reserve! Hot: ${hot} USDT, Safety: ${safety} USDT`);
        }
      } catch (err) {
        logger.error('Health Monitor', `Failed to aggregate balances for network ${net}: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Refills hot wallet from Reserve balance
   */
  async transferReserveToHot(network, amount) {
    const netId = network.toLowerCase();
    const reserveBalance = this.reserveVaultBalances[netId] || 0;

    if (reserveBalance < amount) {
      logger.error('Auto Refill Triggered', `CRITICAL: Reserve vault for ${network} is dry! Balance: ${reserveBalance}, Requested: ${amount}`);
      throw new Error(`Insufficient reserve vault balance for ${network}`);
    }

    // Perform simulated transfer
    this.reserveVaultBalances[netId] -= amount;
    
    // In a production setup, this would trigger an on-chain transfer or multisig wallet request.
    // For our simulated environment, we complete this in-memory or in Firestore.
    logger.info('Auto Refill Triggered', `Transferred ${amount} USDT from ${network.toUpperCase()} Reserve Vault to Hot Wallet successfully.`);
    return true;
  }
}

export const balanceManager = new BalanceManager();
export default balanceManager;
