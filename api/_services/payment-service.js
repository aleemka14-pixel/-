import { doc, getDoc, setDoc } from 'firebase/firestore';
import { paymentServiceInstance } from '../payment/services/payment-service.js';
import { getPaymentProviderAdapter } from '../payment/providers/index.js';

export const db = paymentServiceInstance.db;

/**
 * Retrieves the Payment Configuration from Firestore config/payment_settings.
 */
export async function getPaymentSettings() {
  return await paymentServiceInstance.getSettings();
}

/**
 * Logs a payment system event inside Firestore auditLogs/events and prints to console.
 */
export async function addPaymentLog(level, providerId, message, details = '') {
  return await paymentServiceInstance.logger.log(level, providerId, message, details);
}

/**
 * Health Circuit Breaker: Tracks failed operations for a provider.
 */
export async function recordProviderFailure(providerId, errMessage) {
  return await paymentServiceInstance.recordProviderFailure(providerId, errMessage);
}

/**
 * Resets the failure counter for a provider on successful interaction.
 */
export async function recordProviderSuccess(providerId) {
  return await paymentServiceInstance.recordProviderSuccess(providerId);
}

/**
 * Instantiates the appropriate Adapter class based on configured provider data.
 */
export function getProviderAdapter(providerConfig) {
  return getPaymentProviderAdapter(providerConfig);
}
