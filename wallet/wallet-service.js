import { WALLET_CONFIG } from './config/wallet-config.js';
import { currentProvider } from './providers/current-provider.js';
import { hotWalletProvider } from './providers/hot-wallet-provider.js';
import { mpcWalletProvider } from './providers/mpc-wallet-provider.js';
import { custodyWalletProvider } from './providers/custody-wallet-provider.js';

class WalletService {
  constructor() {
    this.config = WALLET_CONFIG;
    
    // Map of registered cryptographic provider implementations
    const providers = {
      'mock': currentProvider,
      'metamask': currentProvider, // Legacy support
      'trustwallet': currentProvider, // Legacy support
      'futureprovider': currentProvider, // Legacy support
      'hot': hotWalletProvider,
      'mpc': mpcWalletProvider,
      'custody': custodyWalletProvider
    };

    const activeId = (this.config.activeProvider || 'mock').toLowerCase();
    this.provider = providers[activeId] || currentProvider;
    console.log(`[WalletService] Initialized with active provider: ${activeId.toUpperCase()} (${this.provider.name})`);
  }

  /**
   * Retrieves hot wallet balance.
   * If a specific network is provided, returns that network's numeric balance.
   * If no network is provided, returns an object with balances of all supported networks.
   * @param {string} [network] - Optional network name (e.g., 'USDT TRC20')
   * @returns {Promise<number|object>}
   */
  async getWalletBalance(network) {
    if (network) {
      const netUpper = network.toUpperCase();
      return await this.provider.getWalletBalance(netUpper);
    }
    
    const results = {};
    const networks = Object.keys(this.config.networks);
    for (const net of networks) {
      results[net] = await this.provider.getWalletBalance(net);
    }
    return results;
  }

  /**
   * For backward compatibility with legacy codebase
   */
  async getWalletBalances() {
    return this.getWalletBalance();
  }

  /**
   * Sends a transaction to transfer crypto (USDT) to a recipient's address.
   * @param {string} network - The network (e.g., 'USDT TRC20', 'USDT BEP20', 'USDT ERC20')
   * @param {string} toAddress - Destination wallet address
   * @param {number} amount - Amount in USDT to transfer
   * @returns {Promise<{success: boolean, txHash: string, network: string, amount: number, recipient: string, timestamp: number}>}
   */
  async sendTransaction(network, toAddress, amount) {
    const netUpper = network.toUpperCase();
    
    // Validate network compatibility
    if (!this.config.networks[netUpper]) {
      throw new Error(`USDT Network '${network}' is not supported by the Hot Wallet service.`);
    }

    const netRules = this.config.networks[netUpper];

    // Enforce limits
    if (amount < netRules.minWithdraw) {
      throw new Error(`Amount ${amount} USDT is below the minimum network limit of ${netRules.minWithdraw} USDT.`);
    }
    if (amount > netRules.maxWithdraw) {
      throw new Error(`Amount ${amount} USDT exceeds maximum single transfer limit of ${netRules.maxWithdraw} USDT.`);
    }

    console.log(`[WalletService] Broadcasting ${amount} USDT on ${netUpper} to ${toAddress}...`);
    const txReceipt = await this.provider.sendTransaction(netUpper, toAddress, amount);
    return txReceipt;
  }

  /**
   * Legacy alias support
   */
  async sendUSDT({ network, toAddress, amount }) {
    return this.sendTransaction(network, toAddress, amount);
  }

  /**
   * Resolves the confirmation status of a given transaction hash
   * @param {string} txHash - The transaction hash
   * @returns {Promise<string>} - 'pending', 'confirmed', 'failed'
   */
  async getTransactionStatus(txHash) {
    return await this.provider.getTransactionStatus(txHash);
  }

  /**
   * Performs diagnostics on the active provider connection
   */
  async getHealthStatus() {
    const diagnostic = typeof this.provider.getDiagnosticStatus === 'function' 
      ? await this.provider.getDiagnosticStatus() 
      : { connected: true, latencyMs: 10, providerName: this.provider.name };
      
    const balances = await this.getWalletBalances();
    
    const lastTransactions = {};
    for (const net of Object.keys(this.config.networks)) {
      lastTransactions[net] = this.provider.lastTxHashes?.[net] || 'N/A';
    }

    return {
      status: diagnostic.connected ? 'healthy' : 'disconnected',
      latencyMs: diagnostic.latencyMs,
      provider: diagnostic.providerName,
      balances,
      lastTransactions
    };
  }
}

export const walletService = new WalletService();
export default walletService;
