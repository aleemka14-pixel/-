/**
 * Secure Hot Wallet Configuration
 * Houses supported USDT network limits, fees, addresses, and provider presets.
 */
export const WALLET_CONFIG = {
  networks: {
    'USDT TRC20': {
      id: 'trc20',
      name: 'USDT (TRC20)',
      chainId: 'tron',
      decimals: 6,
      fee: 1.0,
      minWithdraw: 10,
      maxWithdraw: 10000,
      hotWalletAddress: process.env.TRC20_HOT_WALLET || 'TYG8D6FidA5A1t6bZ7rFvHkC9dE9fG7hI1'
    },
    'USDT BEP20': {
      id: 'bep20',
      name: 'USDT (BEP20)',
      chainId: 'bsc',
      decimals: 18,
      fee: 0.5,
      minWithdraw: 10,
      maxWithdraw: 15000,
      hotWalletAddress: process.env.BEP20_HOT_WALLET || '0x51C7656EC7ab88b098defB751B7401B5f6d8976F'
    },
    'USDT ERC20': {
      id: 'erc20',
      name: 'USDT (ERC20)',
      chainId: 'ethereum',
      decimals: 6,
      fee: 5.0,
      minWithdraw: 20,
      maxWithdraw: 20000,
      hotWalletAddress: process.env.ERC20_HOT_WALLET || '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
    }
  },
  security: {
    maxDailyWithdrawalLimitUsd: 50000,
    rateLimitRequestsPerMinute: 20
  }
};

export default WALLET_CONFIG;
