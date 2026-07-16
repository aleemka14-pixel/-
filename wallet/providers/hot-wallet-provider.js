import { ProviderInterface } from './provider-interface.js';

export class HotWalletProvider extends ProviderInterface {
  constructor() {
    super();
    this.name = 'Hot Wallet RPC Provider';
    this.balances = {
      'USDT TRC20': 50000.00,
      'USDT BEP20': 120000.00,
      'USDT ERC20': 25000.00
    };
    this.lastTxHashes = {};
    this.isConnected = true;
  }

  async getWalletBalance(network) {
    const netUpper = network.toUpperCase();
    return this.balances[netUpper] || 0.0;
  }

  async sendTransaction(network, toAddress, amount) {
    const netUpper = network.toUpperCase();
    await new Promise((resolve) => setTimeout(resolve, 600));

    if (!this.isConnected) {
      throw new Error('Hot Wallet node connection failed. Node is offline.');
    }

    const available = this.balances[netUpper] || 0;
    if (available < amount) {
      throw new Error(`Hot Wallet: Insufficient funds on ${network}. Required: ${amount} USDT, Available: ${available} USDT.`);
    }

    // Deduct Hot Wallet balance securely
    this.balances[netUpper] = parseFloat((available - amount).toFixed(4));

    // Generate cryptographic tx hash simulating broadcast
    const txHash = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    this.lastTxHashes[netUpper] = txHash;

    console.log(`[HotWalletProvider] Broadcasted transaction ${txHash} on ${netUpper}. Sent ${amount} USDT to ${toAddress}.`);

    return {
      success: true,
      txHash,
      network: netUpper,
      amount,
      recipient: toAddress,
      timestamp: Date.now()
    };
  }

  async getTransactionStatus(txHash) {
    return txHash && txHash.startsWith('0x') ? 'confirmed' : 'failed';
  }

  async getDiagnosticStatus() {
    return {
      connected: this.isConnected,
      latencyMs: Math.floor(Math.random() * 20) + 5,
      providerName: this.name
    };
  }
}

export const hotWalletProvider = new HotWalletProvider();
export default hotWalletProvider;
