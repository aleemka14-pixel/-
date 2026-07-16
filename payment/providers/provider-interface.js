/**
 * Payment Provider Interface
 * Base class representing the contract that all plug-and-play payment gateway providers must implement.
 */
export class PaymentProviderInterface {
  constructor(config) {
    this.config = config;
  }

  /**
   * Initiates a deposit payment request
   * @param {object} req - Standardized request object: { userId, amount, network, currency }
   * @returns {Promise<object>} Standardized payment response: { success, paymentId, walletAddress, amount, qrData, qrCodeUrl, status, isMock }
   */
  async createPayment(req) {
    throw new Error("Method 'createPayment()' must be implemented by the provider.");
  }

  /**
   * Verifies the signature of an incoming webhook payload
   * @param {object} headers - HTTP request headers
   * @param {object} body - JSON request body
   * @returns {boolean} True if the signature is validated and authorized
   */
  verifyWebhook(headers, body) {
    throw new Error("Method 'verifyWebhook()' must be implemented by the provider.");
  }
}
