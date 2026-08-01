import { sunpayService } from './sunpay.js';

/**
 * Payment Gateway Manager Factory
 * Dynamically resolves provider implementations based on gateway code or gateway type.
 */
class PaymentGatewayRegistry {
  constructor() {
    this.services = new Map();
    
    // Register Sunpay as the primary gateway
    this.register('sunpay', sunpayService);
  }

  /**
   * Registers a payment service driver
   * @param {string} code 
   * @param {Object} serviceInstance 
   */
  register(code, serviceInstance) {
    if (code && serviceInstance) {
      this.services.set(code.toLowerCase(), serviceInstance);
    }
  }

  /**
   * Retrieves a service driver by code, gatewayName or gatewayType
   * @param {string} identifier 
   */
  getService(identifier) {
    if (!identifier) return sunpayService;

    const key = String(identifier).toLowerCase();

    if (this.services.has(key)) {
      return this.services.get(key);
    }

    return sunpayService;
  }

  /**
   * Universal payment creation runner
   */
  async createPayment(gatewayIdentifier, details) {
    const service = this.getService(gatewayIdentifier);
    return await service.createPayment(details);
  }

  /**
   * Universal verification runner
   */
  async verifyPayment(gatewayIdentifier, paymentId) {
    const service = this.getService(gatewayIdentifier);
    return await service.verifyPayment(paymentId);
  }

  /**
   * Universal webhook runner
   */
  async processWebhook(gatewayIdentifier, headers, body) {
    const service = this.getService(gatewayIdentifier);
    return await service.processWebhook(headers, body);
  }
}

export const paymentGatewayRegistry = new PaymentGatewayRegistry();
export { sunpayService };
