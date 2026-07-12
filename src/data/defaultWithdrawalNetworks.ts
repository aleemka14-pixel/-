import { WithdrawalNetwork } from '../types.ts';

export const DEFAULT_WITHDRAWAL_NETWORKS: WithdrawalNetwork[] = [
  {
    id: 'tron',
    name: 'TRON (TRC20)',
    logoUrl: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=100&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80',
    title: 'TRON (TRC20) Network',
    subtitle: 'Lightning-fast USDT Stablecoin processing',
    description: 'TRC20 is the premier network for transferring USDT. It offers exceptional speed, stable coin support, and extremely low network fees. Over 80% of withdrawals are processed over TRC20.',
    averageFee: 1.0,
    networkFeeText: '1.00 USDT',
    estimatedTime: '2-5 mins',
    popularityBadge: 'Most Popular',
    securityRating: 5,
    status: 'Online',
    warningMessage: 'Verify that your receiving wallet supports the TRC20 (TRON) network. Sending USDT to an ERC20 or BEP20 address on this network will lead to permanent loss of funds.',
    instructions: 'Enter your TRON (TRC20) wallet address. Double-check that it begins with a capital "T". Payouts will be sent directly to this address.',
    minWithdraw: 10,
    maxWithdraw: 50000,
    faq: [
      { question: 'Why is TRC20 the recommended network?', answer: 'TRC20 has the best balance of speed and affordability, with transaction processing times usually under 5 minutes and flat fees of only 1.00 USDT.' },
      { question: 'Are there additional processing delays?', answer: 'In automatic mode, transfers are completed instantly. In manual approval mode, administrators usually audit and approve requests in 10-30 minutes.' }
    ],
    priority: 1,
    enabled: true
  },
  {
    id: 'bsc',
    name: 'BNB Smart Chain (BEP20)',
    logoUrl: 'https://images.unsplash.com/photo-1622790694511-ac93e2a07cb7?w=100&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=800&q=80',
    title: 'BNB Smart Chain (BEP20)',
    subtitle: 'High speed and ultra-low fees',
    description: 'BNB Smart Chain (BEP20) is Binance\'s flagship EVM-compatible network. It is widely praised for incredibly low network fees, making it perfect for smaller size cashouts.',
    averageFee: 0.3,
    networkFeeText: '0.30 USDT',
    estimatedTime: '3-10 mins',
    popularityBadge: 'Cheapest Fees',
    securityRating: 5,
    status: 'Online',
    warningMessage: 'Double-check that your receiving wallet supports BEP20 tokens. Do NOT send to a BEP2 (legacy BNB chain) or ERC20 wallet address.',
    instructions: 'Enter your BNB Smart Chain (BEP20) address (usually starts with "0x"). Payouts will arrive directly on your self-custody wallet or exchange wallet.',
    minWithdraw: 10,
    maxWithdraw: 25000,
    faq: [
      { question: 'Does BEP20 require a Memo or Destination Tag?', answer: 'No, BEP20 addresses do not require a memo. You only need a valid 0x wallet address.' }
    ],
    priority: 2,
    enabled: true
  },
  {
    id: 'eth',
    name: 'Ethereum (ERC20)',
    logoUrl: 'https://images.unsplash.com/photo-1622790694511-ac93e2a07cb7?w=100&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1642104704074-907c0698cbd9?w=800&q=80',
    title: 'Ethereum (ERC20) Network',
    subtitle: 'The gold standard of blockchain security',
    description: 'ERC20 is the native network for Ethereum-based tokens. While network fees are higher due to decentralized gas pricing, it offers military-grade security and maximum exchange compatibility.',
    averageFee: 5.0,
    networkFeeText: '5.00 USDT',
    estimatedTime: '5-15 mins',
    popularityBadge: 'Highly Secure',
    securityRating: 5,
    status: 'Online',
    warningMessage: 'Ethereum network fees (gas) can fluctuate. Confirm that your receiving wallet is fully compatible with ERC20 tokens before proceeding.',
    instructions: 'Provide your ERC20 Ethereum wallet address (begins with "0x"). Ensure you have factored in the network fee into your payout calculation.',
    minWithdraw: 50,
    maxWithdraw: 100000,
    faq: [
      { question: 'Why are ERC20 fees higher?', answer: 'Gas fees on the Ethereum mainnet are paid to decentralized validators. This ensures the highest level of cryptographic security, but costs more than layer-2 solutions.' }
    ],
    priority: 3,
    enabled: true
  },
  {
    id: 'btc',
    name: 'Bitcoin Network',
    logoUrl: 'https://images.unsplash.com/photo-1516245834210-c4c142787335?w=100&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80',
    title: 'Bitcoin Mainnet',
    subtitle: 'The original decentralized ledger',
    description: 'Withdraw directly in Bitcoin (BTC). The original and most secure cryptocurrency network in the world. Ideal for long-term holders and premium liquidators.',
    averageFee: 2.5,
    networkFeeText: '0.0001 BTC (~$2.50)',
    estimatedTime: '10-30 mins',
    popularityBadge: 'Classic Gold',
    securityRating: 5,
    status: 'Online',
    warningMessage: 'Send ONLY to native Bitcoin addresses. Do not enter an ERC20-wrapped BTC address or any other standard.',
    instructions: 'Input your native Bitcoin wallet address (starts with "1", "3", or "bc1"). Payout will be converted from your USD wallet balance to BTC at the live market rate.',
    minWithdraw: 50,
    maxWithdraw: 50000,
    faq: [
      { question: 'How many block confirmations are required?', answer: 'Bitcoin transactions require 1 network confirmation from miners before they show up in your wallet.' }
    ],
    priority: 4,
    enabled: true
  },
  {
    id: 'sol',
    name: 'Solana Network',
    logoUrl: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=100&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80',
    title: 'Solana High-Speed Layer',
    subtitle: 'Sub-second finality and near-zero fees',
    description: 'Solana is a high-performance blockchain designed for rapid, low-cost decentralized applications. Extremely responsive with near-zero network fees.',
    averageFee: 0.1,
    networkFeeText: '0.01 SOL (~$0.10)',
    estimatedTime: '1-3 mins',
    popularityBadge: 'Ultra Fast',
    securityRating: 4,
    status: 'Online',
    warningMessage: 'Verify that your destination Solana wallet (e.g. Phantom, Solflare) is active and ready to receive.',
    instructions: 'Provide your Solana (SOL) wallet address. Be sure to copy the entire alphanumeric string accurately.',
    minWithdraw: 10,
    maxWithdraw: 20000,
    faq: [
      { question: 'How fast is Solana?', answer: 'Solana usually processes transactions in less than 60 seconds, making it the fastest option available.' }
    ],
    priority: 5,
    enabled: true
  },
  {
    id: 'polygon',
    name: 'Polygon (MATIC) Chain',
    logoUrl: 'https://images.unsplash.com/photo-1622790694511-ac93e2a07cb7?w=100&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80',
    title: 'Polygon Layer-2',
    subtitle: 'Ethereum scalability with tiny fees',
    description: 'Polygon is an Ethereum Layer-2 scaling network that enables rapid, secure, and highly cost-effective token transactions while inheriting Ethereum\'s security benefits.',
    averageFee: 0.1,
    networkFeeText: '0.10 USDT',
    estimatedTime: '3-5 mins',
    popularityBadge: 'Low Gas Fee',
    securityRating: 4,
    status: 'Online',
    warningMessage: 'Ensure your wallet is connected to the Polygon Mainnet, not Ethereum Mainnet, to see these funds.',
    instructions: 'Input your Polygon (MATIC/USDT) EVM wallet address (starts with "0x"). Payouts will be processed on the Polygon network.',
    minWithdraw: 10,
    maxWithdraw: 25000,
    faq: [
      { question: 'Can I withdraw USDT on Polygon?', answer: 'Yes, withdrawals will be processed as native Polygon USDT, which you can easily swap or deposit on any exchange.' }
    ],
    priority: 6,
    enabled: true
  },
  {
    id: 'ltc',
    name: 'Litecoin Network',
    logoUrl: 'https://images.unsplash.com/photo-1516245834210-c4c142787335?w=100&q=80',
    bannerUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80',
    title: 'Litecoin Network',
    subtitle: 'The silver to Bitcoin\'s gold',
    description: 'Litecoin is an established peer-to-peer cryptocurrency with fast block times and very low fees. Extremely stable and supported by virtually every wallet and exchange.',
    averageFee: 0.15,
    networkFeeText: '0.01 LTC (~$0.15)',
    estimatedTime: '5-10 mins',
    popularityBadge: 'Classic Choice',
    securityRating: 4,
    status: 'Online',
    warningMessage: 'Verify that you are using a native Litecoin address. Do not send to a Bitcoin or Ethereum address.',
    instructions: 'Enter your Litecoin (LTC) receiving address (typically starts with "L", "M" or "ltc1").',
    minWithdraw: 10,
    maxWithdraw: 15000,
    faq: [
      { question: 'Why choose Litecoin?', answer: 'Litecoin is a highly dependable network with incredibly low congestion, meaning your transactions are processed instantly at a fraction of a cent.' }
    ],
    priority: 7,
    enabled: true
  }
];

export const DEFAULT_WITHDRAWAL_SETTINGS = {
  minWithdraw: 10,
  maxWithdraw: 50000,
  dailyWithdrawLimit: 100000,
  autoWithdrawEnabled: false,
  manualApprovalEnabled: true,
  maintenanceMode: false,
  allowedBlockchains: ['tron', 'bsc', 'eth', 'btc', 'sol', 'polygon', 'ltc'],
  networkPriority: { tron: 1, bsc: 2, eth: 3, btc: 4, sol: 5, polygon: 6, ltc: 7 },
  defaultFee: 1.0,
  defaultProcessingTime: '5-15 mins'
};
