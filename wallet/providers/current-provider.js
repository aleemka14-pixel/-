import { ProviderInterface } from './provider-interface.js';

export class CurrentProvider extends ProviderInterface {
  constructor() {
    super();
    this.name = 'Primary Blockchain Provider';
    // Simulated live hot wallet balances for USDT networks
    this.balances = {
      'USDT TRC20': 28450.00,
      'USDT BEP20': 64120.50,
      'USDT ERC20': 18900.00
    };
    // Record of last processed transaction hash per network
    this.lastTxHashes = {
      'USDT TRC20': '0x81dfa58f000b98a3b5c65f2cbdf234efd0012bc556ea78cb8b776a3e143abcc0',
      'USDT BEP20': '0x53ef71bc668ba89fcdb38712be1d354de012bcf54ef67812fcfb839840ef90cf',
      'USDT ERC20': '0xe259afcf0012bca0128cf8923a1ef902bca7e8dfc5031bdfcd234eaefd001bc9'
    };
    this.isConnected = true;
  }

  /**
   * For backward compatibility with legacy codebase
   */
  async getBalance(network) {
    return this.getWalletBalance(network);
  }

  /**
   * Retrieves current hot wallet balance for the specified network/token
   * @param {string} network - The network (e.g., 'USDT TRC20', 'USDT BEP20', 'USDT ERC20')
   * @returns {Promise<number>} Current balance
   */
  async getWalletBalance(network) {
    const netUpper = network.toUpperCase();
    if (this.balances[netUpper] === undefined) {
      return 0.0;
    }
    return this.balances[netUpper];
  }

  /**
   * Sends a transaction to transfer crypto to a user's wallet address
   * @param {string} network - The network (e.g., 'USDT TRC20', 'USDT BEP20', 'USDT ERC20')
   * @param {string} toAddress - Destination address
   * @param {number} amount - Amount in USDT to send
   * @returns {Promise<{success: boolean, txHash: string, network: string, amount: number, recipient: string, timestamp: number}>} Transaction details
   */
  async sendTransaction(network, toAddress, amount) {
    const netUpper = network.toUpperCase();
    
    // Simulate real RPC network latency
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (!this.isConnected) {
      throw new Error("Blockchain node connection failure. Current provider is offline.");
    }

    const available = this.balances[netUpper] || 0;
    if (available < amount) {
      throw new Error(`Insufficient hot wallet funds on network '${network}'. Required: ${amount} USDT, Available: ${available} USDT.`);
    }

    // Deduct Hot Wallet balance securely
    this.balances[netUpper] = parseFloat((available - amount).toFixed(4));

    // Generate cryptographic transaction hash simulating real broadcast
    const txHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    this.lastTxHashes[netUpper] = txHash;

    console.log(`[CurrentProvider] Successfully broadcasted transaction ${txHash} on ${netUpper}. Sent ${amount} USDT to ${toAddress}.`);

    return {
      success: true,
      txHash,
      network: netUpper,
      amount,
      recipient: toAddress,
      timestamp: Date.now()
    };
  }

  /**
   * Resolves the confirmation status of a given transaction hash
   * @param {string} txHash - The transaction hash
   * @returns {Promise<string>} - 'pending', 'confirmed', 'failed'
   */
  async getTransactionStatus(txHash) {
    // In a real provider, this would query the chain. Here we return 'confirmed' for simulated hashes.
    if (txHash && txHash.startsWith('0x')) {
      return 'confirmed';
    }
    return 'failed';
  }

  /**
   * Performs quick diagnostic connection check (legacy support)
   */
  async getDiagnosticStatus() {
    return {
      connected: this.isConnected,
      latencyMs: Math.floor(Math.random() * 35) + 10,
      providerName: this.name
    };
  }
}

export const currentProvider = new CurrentProvider();
export default currentProvider;
