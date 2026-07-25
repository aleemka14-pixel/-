import { cashfreeService } from './cashfree.js';
import { nowPaymentsService } from './nowpayments.js';
import { futureGatewayService, FutureGatewayService } from './futureGateway.js';

/**
 * Payment Gateway Manager Factory
 * Dynamically resolves provider implementations based on gateway code or gateway type.
 */
class PaymentGatewayRegistry {
  constructor() {
    this.services = new Map();
    
    // Register built-in providers
    this.register('cashfree', cashfreeService);
    this.register('cashfree_upi', cashfreeService);
    this.register('nowpayments', nowPaymentsService);
    this.register('nowpayments_crypto', nowPaymentsService);
    this.register('future_gateway', futureGatewayService);
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
    if (!identifier) return futureGatewayService;

    const key = String(identifier).toLowerCase();

    if (this.services.has(key)) {
      return this.services.get(key);
    }

    if (key.includes('cashfree')) return cashfreeService;
    if (key.includes('nowpayment')) return nowPaymentsService;

    // Dynamically instantiate a new FutureGateway instance if custom driver requested
    const customService = new FutureGatewayService(identifier);
    this.register(key, customService);
    return customService;
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
export { cashfreeService, nowPaymentsService, futureGatewayService };
