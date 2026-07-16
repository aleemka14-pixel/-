import MetamaskProvider from './providers/metamask.js';
import TrustWalletProvider from './providers/trustwallet.js';
import FutureProvider from './providers/futureProvider.js';
import WALLET_CONFIG from './walletConfig.js';
import logger from './walletLogger.js';

/**
 * Wallet Factory
 * Instantiates the active provider dynamically according to configuration settings.
 */
class WalletFactory {
  constructor() {
    this.providers = {
      metamask: new MetamaskProvider(),
      trustwallet: new TrustWalletProvider(),
      futureprovider: new FutureProvider()
    };
    this.activeProviderKey = process.env.ACTIVE_WALLET_PROVIDER || WALLET_CONFIG.defaultProvider;
  }

  /**
   * Set the active wallet provider dynamically
   * @param {string} providerName 
   */
  setActiveProvider(providerName) {
    const key = providerName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!this.providers[key]) {
      throw new Error(`Provider "${providerName}" is not registered in the Wallet Factory.`);
    }
    
    const oldProvider = this.activeProviderKey;
    this.activeProviderKey = key;
    
    logger.info('Wallet Changed', `Active provider switched from ${oldProvider} to ${this.activeProviderKey}`);
    return true;
  }

  /**
   * Returns the currently active wallet provider instance
   * @returns {MetamaskProvider|TrustWalletProvider|FutureProvider}
   */
  getActiveProvider() {
    const provider = this.providers[this.activeProviderKey];
    if (!provider) {
      // Fallback to metamask if anything is corrupted
      return this.providers['metamask'];
    }
    return provider;
  }

  /**
   * Get all registered provider configurations/states
   */
  getRegisteredProviders() {
    return Object.keys(this.providers).map(key => ({
      id: key,
      name: this.providers[key].name,
      active: key === this.activeProviderKey
    }));
  }
}

export const walletFactory = new WalletFactory();
export default walletFactory;
