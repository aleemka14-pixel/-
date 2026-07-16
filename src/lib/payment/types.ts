export interface ProviderCredentials {
  // NOWPayments
  apiKey?: string;
  ipnSecret?: string;
  // Direct Crypto Addresses
  usdtTrc20Address?: string;
  usdtBep20Address?: string;
  usdtErc20Address?: string;
  // UPI
  upiId?: string;
  qrCodeUrl?: string;
}

export type PaymentMode = 'live' | 'test';

export interface PaymentProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  mode: PaymentMode;
  credentials: ProviderCredentials;
  failureCount: number;
  lastFailureTime: number | null;
  status: 'Online' | 'Offline' | 'Maintenance';
}

export interface QRSettings {
  size: number;
  border: number;
  useLogo: boolean;
  logoUrl?: string;
}

export interface UnifiedDepositSettings {
  minDepositUsd: number;
  maxDepositUsd: number;
  cooldownSeconds: number;
}

export interface UnifiedWithdrawalSettings {
  minWithdraw: number;
  maxWithdraw: number;
  dailyWithdrawLimit: number;
  autoWithdrawEnabled: boolean;
}

export interface PaymentManagementConfig {
  maintenanceMode: boolean;
  globalTestMode: boolean;
  providers: Record<string, PaymentProviderConfig>;
  qrSettings: QRSettings;
  depositSettings: UnifiedDepositSettings;
  withdrawalSettings: UnifiedWithdrawalSettings;
}

export interface PaymentLogEvent {
  id: string;
  timestamp: number;
  level: 'info' | 'warning' | 'error' | 'success';
  providerId: string;
  message: string;
  details?: string;
}

export interface RetryQueueItem {
  id: string;
  depositId: string;
  playerId: string;
  providerId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'failed' | 'resolved';
  failureReason?: string;
  retryCount: number;
  lastRetryTimestamp: number;
  createdAt: number;
}

export interface CreatePaymentRequest {
  userId: string;
  amount: number;
  network: string;
  currency?: string;
}

export interface CreatePaymentResponse {
  success: boolean;
  paymentId: string;
  walletAddress: string;
  amount: number;
  qrData: string;
  qrCodeUrl: string;
  status: string;
  isMock: boolean;
}
