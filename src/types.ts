export interface Transaction {
  id: string;
  playerId: string;
  type: 'deposit' | 'bet' | 'win' | 'withdrawal';
  amount: number;
  timestamp: number;
  status: 'pending' | 'completed' | 'failed';
}

export interface WithdrawalRequest {
  id: string;
  playerId: string;
  amount: number;
  method: string;
  details: string;
  status: 'pending' | 'completed' | 'rejected';
  timestamp: number;
  playerBalanceAtRequest: number;
}

export interface DepositRequest {
  id: string;
  playerId: string;
  amount: number;
  method: string;
  details: string;
  screenshotUrl?: string;
  status: 'pending' | 'completed' | 'rejected';
  timestamp: number;
  playerBalanceAtRequest: number;
}

export interface Player {
  id: string;
  name: string;
  email?: string;
  override: 'win' | 'lose' | 'none';
  balance: number;
  pendingBet?: {
    amount: number;
    timestamp: number;
  };
  referralCode: string;
  referredBy?: string;
  referralCount: number;
}

export interface PaymentSettings {
  upiId?: string;
  qrCodeUrl?: string; // Will store base64 string
  additionalInstructions?: string;
}

export interface AppState {
  players: Player[];
  currentPlayerId: string;
  transactions: Transaction[];
  withdrawals: WithdrawalRequest[];
  deposits: DepositRequest[];
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
}
