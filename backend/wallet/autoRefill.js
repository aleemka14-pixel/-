import balanceManager from './balanceManager.js';
import WALLET_CONFIG from './walletConfig.js';
import logger from './walletLogger.js';

/**
 * Auto Refill Service (Liquidity Guard)
 * Keeps hot wallets replenished from cold reserve vaults automatically to ensure zero transaction delays.
 */
class AutoRefillService {
  constructor() {
    this.interval = null;
    this.isRefilling = false;
  }

  /**
   * Starts the continuous background liquidity guard checking loop
   */
  startMonitoring() {
    if (this.interval) return;
    
    const { checkIntervalMs } = WALLET_CONFIG.autoRefill;
    
    this.interval = setInterval(async () => {
      await this.checkAndReplenish();
    }, checkIntervalMs);

    logger.info('Auto Refill Triggered', `Background Auto Refill (Liquidity Guard) service started. Checking every ${checkIntervalMs / 1000}s`);
  }

  /**
   * Stops the check loop
   */
  stopMonitoring() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Auto Refill Triggered', 'Background Auto Refill service stopped.');
    }
  }

  /**
   * Inspects all networks and triggers transfer if limit has been crossed
   */
  async checkAndReplenish() {
    if (this.isRefilling) return;
    this.isRefilling = true;

    try {
      const aggregates = await balanceManager.getAggregatedBalances();
      const config = WALLET_CONFIG.autoRefill;

      for (const [netId, stats] of Object.entries(aggregates)) {
        if (stats.hotWallet < config.thresholdUsd) {
          logger.warn('Auto Refill Triggered', `Threshold breached on ${netId.toUpperCase()}. Hot: ${stats.hotWallet} USDT, Min Required: ${config.thresholdUsd} USDT. Refilling...`);
          
          try {
            await balanceManager.transferReserveToHot(netId, config.refillAmountUsd);
          } catch (refillErr) {
            logger.error('Auto Refill Triggered', `Auto Refill execution failed for ${netId.toUpperCase()}: ${refillErr.message}`);
          }
        }
      }
    } catch (err) {
      logger.error('Health Monitor', `Error during automated refill validation: ${err.message}`);
    } finally {
      this.isRefilling = false;
    }
  }
}

export const autoRefillService = new AutoRefillService();
export default autoRefillService;
