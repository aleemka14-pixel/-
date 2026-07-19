import { WalletProvider } from './provider-interface.js';

export class FutureProvider extends WalletProvider {
  constructor() {
    super();
    this.name = 'Future Blockchain Gateway';
    this.balances = {
      'USDT TRC20': 1000000.00,
      'USDT BEP20': 1000000.00,
      'USDT ERC20': 1000000.00
    };
  }

  async getWalletBalance(network) {
    const netUpper = network.toUpperCase();
    return this.balances[netUpper] || 0.0;
  }

  async sendTransaction(network, toAddress, amount) {
    throw new Error("FutureProvider is not active. Please configure the provider in wallet-config.");
  }

  async getTransactionStatus(txHash) {
    return 'pending';
  }
}

export const futureProvider = new FutureProvider();
export default futureProvider;
