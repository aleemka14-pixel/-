export interface ActiveBet {
  betId: string;
  playerId: string;
  username: string;
  amount: number;
  multiplier: number;
  game?: string;
  status: 'active' | 'pending' | 'won' | 'lost';
  isDemo?: boolean;
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface Transaction {
  id: string;
  playerId: string;
  type: 'deposit' | 'bet' | 'win' | 'withdrawal' | 'game_win' | 'game_loss' | 'bonus' | 'admin_adjustment';
  amount: number;
  timestamp: number;
  status: 'pending' | 'completed' | 'failed' | 'confirmed' | string;
  transactionId?: string;
  userId?: string;
  network?: string;
  transactionHash?: string;
  createdAt?: number;
  balanceBefore?: number;
  balanceAfter?: number;
  referenceId?: string;
  description?: string;
}

export interface Wallet {
  userId: string;
  walletAddress: string;
  network: string;
  createdAt: number;
}

export interface GameHistory {
  gameId: string;
  userId: string;
  entryAmount: number;
  result: string;
  payout: number;
  createdAt: number;
}

export interface WithdrawalRequest {
  id: string;
  withdrawalId?: string;
  playerId: string;
  userId?: string;
  playerName?: string; // name of the player requesting
  amount: number;
  method: string;
  network?: string;
  details: string;
  blockchain?: string; // selected blockchain network
  walletAddress?: string; // wallet address entered by user
  withdrawalAddress?: string;
  destinationAddress?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'rejected' | 'cancelled' | 'reviewing' | 'approved' | 'broadcasted';
  timestamp: number;
  createdAt?: number;
  processedAt?: number;
  completedDate?: number; // timestamp when approved or completed
  playerBalanceAtRequest: number;
  balanceBefore?: number;
  balanceAfter?: number;
  transactionHash?: string; // blockchain transaction hash
  blockchainTxHash?: string; // blockchain transaction hash
  adminNotes?: string; // notes added by administrator
  fee?: number; // network fee applied
  finalAmount?: number; // amount user receives (amount - fee)
  riskScore?: number; // administrative risk evaluation score (0-100)
  riskFlags?: string[];
  requiresManualApproval?: boolean;
  idempotencyKey?: string;
  notes?: string; // user submitted notes during withdrawal
}

export interface SavedWithdrawalMethod {
  id: string;
  type: 'crypto' | 'upi' | 'bank';
  label: string;
  isDefault?: boolean;
  networkId?: string;
  walletAddress?: string;
  upiId?: string;
  accountHolder?: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
  createdAt?: number;
}

export interface DepositRequest {
  id: string;
  playerId: string;
  amount: number;
  method: string;
  details: string;
  screenshotUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected' | 'confirmed' | 'failed' | string;
  timestamp: number;
  playerBalanceAtRequest: number;
  depositId?: string;
  userId?: string;
  currency?: string;
  network?: string;
  walletAddress?: string;
  upiVpa?: string;
  utrNumber?: string;
  transactionId?: string;
  transactionHash?: string;
  confirmedAt?: number;
  updatedAt?: number;
  createdAt?: number;
  balanceBefore?: number;
  balanceAfter?: number;
  adminNotes?: string;
  rejectionReason?: string;
  confirmedBy?: string;
  rejectedBy?: string;
}

export interface Player {
  id: string;
  name: string;
  email?: string;
  override: 'win' | 'lose' | 'none';
  balance: number;
  referralCode: string;
  referredBy?: string;
  referralCount: number;
  totalWagered?: number;
  preferredCurrency?: string;
  walletBalance?: number;
  wins?: number;
  losses?: number;
  totalWinnings?: number;
  biggestBet?: number;
  totalBetsCount?: number;
  lastActive?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface DepositNetwork {
  id: string; // e.g. 'tron', 'bsc'
  name: string; // e.g. 'TRON (TRC20)'
  logoUrl: string; // Image URL/base64
  bannerUrl: string; // Image URL/base64
  title: string;
  subtitle: string;
  description: string;
  networkFeeText: string;
  typicalFeeUsd: number;
  estimatedTime: string;
  confirmations: number;
  warningMessage: string;
  depositInstructions: string;
  faqs: FAQItem[];
  helpText: string;
  maintenanceMessage: string;
  statusBadge: 'Online' | 'Maintenance';
  enabled: boolean;
  minDepositUsd: number;
  maxDepositUsd: number;
  depositAddress: string;
  qrCodeUrl: string;
  priority: number;
  featured: boolean;
  supportedCoins?: string;
}

export interface PaymentSettings {
  upiId?: string;
  qrCodeUrl?: string; // Will store base64 string
  additionalInstructions?: string;
  usdtTrc20Address?: string;
  usdtBep20Address?: string;
  usdtErc20Address?: string;
  upiMaintenanceMode?: boolean;
  cryptoMaintenanceMode?: boolean;
}

export interface AppState {
  players: Player[];
  currentPlayerId: string;
  transactions: Transaction[];
  withdrawals: WithdrawalRequest[];
  deposits: DepositRequest[];
  depositNetworks?: DepositNetwork[];
  winRate: number; // 0 to 1
  totalEarned: number;
  manualMode: boolean;
  maxBet: number;
  isBetLimitEnabled: boolean;
  maintenanceMode: boolean;
  minDeposit?: number;
  minWithdraw?: number;
  paymentSettings?: PaymentSettings;
  isPaymentLocked: boolean;
  referralAmount?: number;
  isReferralEnabled?: boolean;
  isWithdrawLimit24hEnabled?: boolean;
  isWinRateLocked?: boolean;
  isTransferLimitsLocked?: boolean;
  houseProfitResetTimestamp?: number;
  isBettingClosed?: boolean;
  teaBreakMode?: boolean;
  lotteryTargetTimestamp?: number;
  lotteryTimerDuration?: number;
  lotteryTimerActive?: boolean;
  playersWonCount?: number;
  isPlayersWonShown?: boolean;
  announcementText?: string;
  isAnnouncementEnabled?: boolean;
  withdrawalNetworks?: WithdrawalNetwork[];
  withdrawalSettings?: WithdrawalSettings;
  customTotalBets?: number;
  isWithdrawalsStopped?: boolean;
}

export interface WithdrawalNetwork {
  id: string; // e.g. 'tron', 'bsc', 'eth', 'btc', 'sol', 'polygon', 'ltc'
  name: string; // e.g. 'TRON (TRC20)'
  logoUrl: string; // Network Logo
  bannerUrl: string; // Banner Image
  title: string;
  subtitle: string;
  description: string;
  averageFee: number; // Average Network Fee
  networkFeeText: string; // e.g. '0.8 USDT'
  estimatedTime: string; // e.g. '2-5 mins'
  popularityBadge: string; // e.g. 'Most Popular', 'Low Fee', 'Fastest'
  securityRating: number; // e.g. 1 to 5
  status: 'Online' | 'Maintenance';
  warningMessage: string;
  instructions: string;
  minWithdraw: number;
  maxWithdraw: number;
  faq: FAQItem[];
  priority: number;
  enabled: boolean;
  autoWithdrawEnabled?: boolean;
  manualApprovalEnabled?: boolean;
  supportedCoins?: string;
}

export interface WithdrawalSettings {
  minWithdraw: number;
  maxWithdraw: number;
  dailyWithdrawLimit: number;
  weeklyWithdrawLimit?: number;
  monthlyWithdrawLimit?: number;
  autoWithdrawEnabled: boolean;
  manualApprovalEnabled: boolean;
  maintenanceMode: boolean;
  allowedBlockchains: string[];
  networkPriority: Record<string, number>;
  defaultFee: number;
  feePercentage?: number;
  kycRequired?: boolean;
  defaultProcessingTime: string;
}

export interface PaymentGatewayMethod {
  id: string;
  gatewayName: string;
  gatewayType: 'UPI' | 'Crypto' | 'Bank' | string;
  status: 'active' | 'maintenance' | 'disabled';
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  maintenanceMessage?: string;
  providerCode?: string;
  description?: string;
  logoUrl?: string;
  createdAt?: number;
  updatedAt?: number;
}
