import { SunpayProvider } from './sunpay.js';
import { CryptoDirectProvider } from './cryptodirect.js';
import { NowPaymentsProvider } from './nowpayments.js';

export { PaymentProviderInterface } from './provider-interface.js';
export { SunpayProvider } from './sunpay.js';
export { CryptoDirectProvider } from './cryptodirect.js';
export { NowPaymentsProvider } from './nowpayments.js';

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
    case 'sunpay':
      return new SunpayProvider(providerConfig);
    case 'cryptodirect':
      return new CryptoDirectProvider(providerConfig);
    case 'nowpayments':
      return new NowPaymentsProvider(providerConfig);
    default:
      throw new Error(`Unsupported payment provider adapter: ${providerConfig.id}`);
  }
}
