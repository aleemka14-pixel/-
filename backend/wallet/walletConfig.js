/**
 * Wallet Configuration
 * Houses supported networks (TRC20, BEP20, ERC20), gas fees, limits, and provider presets.
 * All sensitive information such as mock credentials can be customized via env vars.
 */
export const WALLET_CONFIG = {
  // Default configurations for USDT networks
  networks: {
    trc20: {
      id: 'trc20',
      name: 'USDT (TRC20)',
      symbol: 'USDT',
      decimals: 6,
      feeSymbol: 'TRX',
      defaultGasLimit: 30000,
      networkFeeUsd: 1.0,
      minWithdraw: 10,
      maxWithdraw: 50000,
      hotWalletAddress: process.env.TRC20_HOT_WALLET || 'TYG8D6FidA5A1t6bZ7rFvHkC9dE9fG7hI1',
      reserveWalletAddress: process.env.TRC20_RESERVE_WALLET || 'TLZ8v6FidA5A1t6bZ7rFvHkC9dE9fG7hX9',
      rpcUrl: process.env.TRON_RPC_URL || 'https://api.trongrid.io'
    },
    bep20: {
      id: 'bep20',
      name: 'USDT (BEP20)',
      symbol: 'USDT',
      decimals: 18,
      feeSymbol: 'BNB',
      defaultGasLimit: 21000,
      networkFeeUsd: 0.5,
      minWithdraw: 10,
      maxWithdraw: 50000,
      hotWalletAddress: process.env.BEP20_HOT_WALLET || '0x51C7656EC7ab88b098defB751B7401B5f6d8976F',
      reserveWalletAddress: process.env.BEP20_RESERVE_WALLET || '0x1A2B3C4D5E6F7G8H9I0J1K2L3M4N5O6P7Q8R9S0T',
      rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/'
    },
    erc20: {
      id: 'erc20',
      name: 'USDT (ERC20)',
      symbol: 'USDT',
      decimals: 6,
      feeSymbol: 'ETH',
      defaultGasLimit: 65000,
      networkFeeUsd: 5.0,
      minWithdraw: 20,
      maxWithdraw: 50000,
      hotWalletAddress: process.env.ERC20_HOT_WALLET || '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      reserveWalletAddress: process.env.ERC20_RESERVE_WALLET || '0x99C7656EC7ab88b098defB751B7401B5f6d8976F',
      rpcUrl: process.env.ETH_RPC_URL || 'https://cloudflare-eth.com'
    }
  },

  // Auto Refill configurations
  autoRefill: {
    enabled: true,
    checkIntervalMs: 60000, // every 60s
    thresholdUsd: 5000,    // Refill if hot wallet balance < 5000 USDT
    refillAmountUsd: 10000 // Transfer 10000 USDT from Reserve to Hot Wallet
  },

  // Security and access
  security: {
    maxDailyWithdrawalLimitUsd: 100000,
    rateLimitRequestsPerMinute: 30
  },

  // Fallback defaults
  defaultProvider: 'metamask'
};

export default WALLET_CONFIG;
