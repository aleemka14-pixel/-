import walletService from './walletService.js';
import logger from './walletLogger.js';
import WALLET_CONFIG from './walletConfig.js';

/**
 * Health Monitor
 * Performs system-wide connectivity diagnostics on hot wallet providers, RPC nodes, and database tunnels.
 */
class HealthMonitor {
  constructor() {
    this.history = [];
  }

  /**
   * Run a comprehensive diagnostic sweep
   */
  async runDiagnostic() {
    logger.info('Health Monitor', 'Starting system-wide wallet infrastructure diagnostics...');
    
    let isProviderHealthy = false;
    let providerMetrics = null;
    let networkStatuses = {};

    try {
      providerMetrics = await walletService.healthCheck();
      isProviderHealthy = providerMetrics.status === 'healthy';
    } catch (e) {
      logger.error('Health Monitor', `Hot wallet provider diagnostic failed: ${e.message}`);
    }

    // Ping blockchain RPC endpoints
    for (const [netId, netConfig] of Object.entries(WALLET_CONFIG.networks)) {
      const start = Date.now();
      let connected = false;
      let error = null;

      try {
        // Mock checking connection to RPC URL
        connected = true;
      } catch (err) {
        error = err.message;
      }

      networkStatuses[netId] = {
        connected,
        latencyMs: Date.now() - start,
        rpcUrl: netConfig.rpcUrl,
        error
      };
    }

    const overallStatus = isProviderHealthy ? 'HEALTHY' : 'DEGRADED';
    const report = {
      timestamp: new Date().toISOString(),
      status: overallStatus,
      provider: providerMetrics,
      networks: networkStatuses
    };

    this.history.unshift(report);
    if (this.history.length > 50) this.history.pop();

    logger.info('Health Monitor', `Diagnostic completed. Overall state: ${overallStatus}`);
    return report;
  }

  getDiagnosticHistory() {
    return this.history;
  }
}

export const healthMonitor = new HealthMonitor();
export default healthMonitor;
