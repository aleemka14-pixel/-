import { collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Payment and Deposit Validator
 * Enforces security controls, dynamic limits, and prevents race conditions or duplicate submissions.
 */
export class PaymentValidator {
  /**
   * Validates core deposit parameters
   * @param {object} req - Request object
   */
  static validateDepositRequest(req) {
    const { amount, network, userId, playerId } = req;
    const resolvedUserId = userId || playerId;

    if (!resolvedUserId) {
      throw new Error("Missing required parameter: userId or playerId.");
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      throw new Error("Missing or invalid deposit amount. Must be a positive number.");
    }

    if (!network) {
      throw new Error("Missing required network selection.");
    }

    return {
      amount: Number(amount),
      network: network.toUpperCase(),
      userId: resolvedUserId
    };
  }

  /**
   * Checks if a request falls within dynamic limits
   * @param {number} amount - Requested amount
   * @param {object} settings - Centralized settings
   */
  static checkLimits(amount, settings) {
    const minRequired = settings.depositSettings?.minDepositUsd || 10;
    const maxRequired = settings.depositSettings?.maxDepositUsd || 50000;

    if (amount < minRequired || amount > maxRequired) {
      throw new Error(`Deposit amount of ${amount} exceeds allowed limits [Min: $${minRequired}, Max: $${maxRequired}].`);
    }
  }

  /**
   * Detects duplicate transactions within the cooldown period
   * @param {object} db - Firestore database
   * @param {string} userId - Player ID
   * @param {number} amount - Request amount
   * @param {string} network - Request network
   * @param {number} cooldownSeconds - Minimum delay between identical transactions
   */
  static async preventDuplicateDeposit(db, userId, amount, network, cooldownSeconds = 30) {
    try {
      const depositsRef = collection(db, 'deposits');
      const cooldownThreshold = Date.now() - cooldownSeconds * 1000;
      
      const q = query(
        depositsRef,
        where('playerId', '==', userId),
        where('amount', '==', amount),
        where('method', '==', network.toUpperCase()),
        where('timestamp', '>', cooldownThreshold)
      );

      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        throw new Error(`A duplicate deposit request was already submitted recently. Please wait ${cooldownSeconds} seconds before submitting again.`);
      }
    } catch (err) {
      if (err.message.includes('duplicate')) {
        throw err;
      }
      console.warn('[PaymentValidator] Duplicate prevention query skipped:', err.message);
    }
  }
}
