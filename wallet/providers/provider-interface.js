/**
 * ProviderInterface
 * Abstract class representing the interface all wallet providers must implement.
 */
export class ProviderInterface {
  /**
   * Retrieves the current hot wallet balance for the specified network/token
   * @param {string} network - The network (e.g., 'USDT TRC20', 'USDT BEP20', 'USDT ERC20')
   * @returns {Promise<number>} Current balance
   */
  async getWalletBalance(network) {
    throw new Error("Method 'getWalletBalance()' must be implemented by the provider.");
  }

  /**
   * Sends a transaction to transfer crypto to a user's wallet address
   * @param {string} network - The network (e.g., 'USDT TRC20', 'USDT BEP20', 'USDT ERC20')
   * @param {string} toAddress - Destination address
   * @param {number} amount - Amount in USDT to send
   * @returns {Promise<{success: boolean, txHash: string, network: string, amount: number, recipient: string, timestamp: number}>} Transaction details
   */
  async sendTransaction(network, toAddress, amount) {
    throw new Error("Method 'sendTransaction()' must be implemented by the provider.");
  }

  /**
   * Resolves the confirmation status of a given transaction hash
   * @param {string} txHash - The transaction hash
   * @returns {Promise<string>} - 'pending', 'confirmed', 'failed'
   */
  async getTransactionStatus(txHash) {
    throw new Error("Method 'getTransactionStatus()' must be implemented by the provider.");
  }
}
