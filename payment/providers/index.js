import { CryptoDirectProvider } from './cryptodirect.js';
import { NowPaymentsProvider } from './nowpayments.js';
import { UpiProvider } from './upi.js';

export { PaymentProviderInterface } from './provider-interface.js';
export { CryptoDirectProvider } from './cryptodirect.js';
export { NowPaymentsProvider } from './nowpayments.js';
export { UpiProvider } from './upi.js';

/**
 * Instantiates the appropriate provider adapter class based on the given configuration.
 * @param {object} providerConfig - Configuration from database/config
 * @returns {PaymentProviderInterface} Instantiated payment provider
 */
export function getPaymentProviderAdapter(providerConfig) {
  if (!providerConfig || !providerConfig.id) {
    throw new Error('Invalid provider configuration. Missing provider ID.');
  }

  const id = providerConfig.id.toLowerCase();
  switch (id) {
    case 'cryptodirect':
      return new CryptoDirectProvider(providerConfig);
    case 'nowpayments':
      return new NowPaymentsProvider(providerConfig);
    case 'upi':
      return new UpiProvider(providerConfig);
    default:
      throw new Error(`Unsupported payment provider adapter: ${providerConfig.id}`);
  }
}
