import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { getPaymentProviderAdapter } from '../providers/index.js';
import { PaymentLogger } from '../utils/payment-logger.js';

// Centralized dynamic default configurations
const DEFAULT_PAYMENT_CONFIG = {
  maintenanceMode: false,
  globalTestMode: true,
  providers: {
    cryptodirect: {
      id: 'cryptodirect',
      name: 'Direct Crypto Transfers',
      enabled: true,
      mode: 'live',
      credentials: {
        usdtTrc20Address: process.env.DIRECT_CRYPTO_USDT_TRC20_ADDRESS || 'TYb3jV2kR7K3XvSNoK83A7NnBkWqE9M2S4h',
        usdtBep20Address: process.env.DIRECT_CRYPTO_USDT_BEP20_ADDRESS || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        usdtErc20Address: process.env.DIRECT_CRYPTO_USDT_ERC20_ADDRESS || '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        ipnSecret: process.env.CRYPTO_WEBHOOK_SECRET || 'DIRECT_CRYPTO_SECRET_992'
      },
      failureCount: 0,
      lastFailureTime: null,
      status: 'Online'
    },
    nowpayments: {
      id: 'nowpayments',
      name: 'NOWPayments Gateway',
      enabled: true,
      mode: 'test',
      credentials: {
        apiKey: process.env.NOWPAYMENTS_API_KEY || '',
        ipnSecret: process.env.NOWPAYMENTS_IPN_SECRET || ''
      },
      failureCount: 0,
      lastFailureTime: null,
      status: 'Online'
    },
    upi: {
      id: 'upi',
      name: 'UPI static QR',
      enabled: false,
      mode: 'live',
      credentials: {
        upiId: process.env.UPI_ID || 'merchant@upi',
        qrCodeUrl: process.env.UPI_QR_CODE_URL || ''
      },
      failureCount: 0,
      lastFailureTime: null,
      status: 'Online'
    }
  },
  qrSettings: {
    size: 250,
    border: 1,
    useLogo: true
  },
  depositSettings: {
    minDepositUsd: 10,
    maxDepositUsd: 50000,
    cooldownSeconds: 30
  },
  withdrawalSettings: {
    minWithdraw: 15,
    maxWithdraw: 10000,
    dailyWithdrawLimit: 50000,
    autoWithdrawEnabled: false
  }
};

export class PaymentService {
  constructor() {
    // 1. Initialize Firebase App server-side securely
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    let app;
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    this.db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    
    // Instantiate core operational logger
    this.logger = new PaymentLogger(this.db);
    this.defaultConfig = DEFAULT_PAYMENT_CONFIG;
  }

  /**
   * Retrieves current configurations from Firestore and merges with defaults.
   * If document does not exist, initializes it.
   */
  async getSettings() {
    try {
      const configRef = doc(this.db, 'config', 'payment_settings');
      const snap = await getDoc(configRef);
      
      let mergedConfig = this.defaultConfig;

      if (snap.exists()) {
        const dbConfig = snap.data();
        mergedConfig = {
          ...this.defaultConfig,
          ...dbConfig,
          providers: {
            ...this.defaultConfig.providers,
            ...(dbConfig.providers || {})
          },
          qrSettings: {
            ...this.defaultConfig.qrSettings,
            ...(dbConfig.qrSettings || {})
          },
          depositSettings: {
            ...this.defaultConfig.depositSettings,
            ...(dbConfig.depositSettings || {})
          },
          withdrawalSettings: {
            ...this.defaultConfig.withdrawalSettings,
            ...(dbConfig.withdrawalSettings || {})
          }
        };
      } else {
        // First-time initialization
        await setDoc(configRef, this.defaultConfig);
      }

      // Explicitly override database credentials with environment variables if set (Environment-first priority)
      if (mergedConfig.providers) {
        if (mergedConfig.providers.cryptodirect && mergedConfig.providers.cryptodirect.credentials) {
          mergedConfig.providers.cryptodirect.credentials.usdtTrc20Address = 
            process.env.DIRECT_CRYPTO_USDT_TRC20_ADDRESS || mergedConfig.providers.cryptodirect.credentials.usdtTrc20Address;
          mergedConfig.providers.cryptodirect.credentials.usdtBep20Address = 
            process.env.DIRECT_CRYPTO_USDT_BEP20_ADDRESS || mergedConfig.providers.cryptodirect.credentials.usdtBep20Address;
          mergedConfig.providers.cryptodirect.credentials.usdtErc20Address = 
            process.env.DIRECT_CRYPTO_USDT_ERC20_ADDRESS || mergedConfig.providers.cryptodirect.credentials.usdtErc20Address;
          mergedConfig.providers.cryptodirect.credentials.ipnSecret = 
            process.env.CRYPTO_WEBHOOK_SECRET || mergedConfig.providers.cryptodirect.credentials.ipnSecret;
        }
        if (mergedConfig.providers.nowpayments && mergedConfig.providers.nowpayments.credentials) {
          mergedConfig.providers.nowpayments.credentials.apiKey = 
            process.env.NOWPAYMENTS_API_KEY || mergedConfig.providers.nowpayments.credentials.apiKey;
          mergedConfig.providers.nowpayments.credentials.ipnSecret = 
            process.env.NOWPAYMENTS_IPN_SECRET || mergedConfig.providers.nowpayments.credentials.ipnSecret;
        }
        if (mergedConfig.providers.upi && mergedConfig.providers.upi.credentials) {
          mergedConfig.providers.upi.credentials.upiId = 
            process.env.UPI_ID || mergedConfig.providers.upi.credentials.upiId;
          mergedConfig.providers.upi.credentials.qrCodeUrl = 
            process.env.UPI_QR_CODE_URL || mergedConfig.providers.upi.credentials.qrCodeUrl;
        }
      }

      // Sync layer: load legay admin settings from config/admin to map changes made via existing admin panel UI
      try {
        const adminRef = doc(this.db, 'config', 'admin');
        const adminSnap = await getDoc(adminRef);
        if (adminSnap.exists()) {
          const adminData = adminSnap.data();
          const legacySettings = adminData.paymentSettings || {};
          
          if (legacySettings.usdtTrc20Address) {
            mergedConfig.providers.cryptodirect.credentials.usdtTrc20Address = legacySettings.usdtTrc20Address;
          }
          if (legacySettings.usdtBep20Address) {
            mergedConfig.providers.cryptodirect.credentials.usdtBep20Address = legacySettings.usdtBep20Address;
          }
          if (legacySettings.usdtErc20Address) {
            mergedConfig.providers.cryptodirect.credentials.usdtErc20Address = legacySettings.usdtErc20Address;
          }
          if (legacySettings.upiId) {
            mergedConfig.providers.upi.credentials.upiId = legacySettings.upiId;
          }
          if (legacySettings.qrCodeUrl) {
            mergedConfig.providers.upi.credentials.qrCodeUrl = legacySettings.qrCodeUrl;
          }
        }
      } catch (adminErr) {
        console.warn('[PaymentService] Legacy admin settings sync bypassed:', adminErr.message);
      }

      return mergedConfig;
    } catch (error) {
      console.error('[PaymentService] Failed to retrieve settings, using memory fallback:', error);
      return this.defaultConfig;
    }
  }

  /**
   * Health Circuit Breaker: Tracks failed provider interactions.
   * Automatically disables a provider and flags alert when failure count hits 3.
   */
  async recordProviderFailure(providerId, errMessage) {
    try {
      const timestamp = Date.now();
      const configRef = doc(this.db, 'config', 'payment_settings');
      const settings = await this.getSettings();
      const provider = settings.providers[providerId];

      if (!provider) return;

      const currentFailures = (provider.failureCount || 0) + 1;
      let updatedEnabled = provider.enabled;
      let updatedStatus = provider.status;

      if (currentFailures >= 3) {
        updatedEnabled = false;
        updatedStatus = 'Offline';
        await this.logger.error(
          providerId,
          `Circuit Breaker Tripped: Provider "${provider.name}" was automatically disabled due to 3 consecutive failures.`,
          `Last Error: ${errMessage}`
        );
      } else {
        await this.logger.warning(
          providerId,
          `Consecutive Failure Registered (${currentFailures}/3): ${errMessage}`
        );
      }

      settings.providers[providerId] = {
        ...provider,
        failureCount: currentFailures,
        lastFailureTime: timestamp,
        enabled: updatedEnabled,
        status: updatedStatus
      };

      await setDoc(configRef, settings);
    } catch (err) {
      console.error('[PaymentService] Failed to record provider failure:', err);
    }
  }

  /**
   * Resets consecutive failures to 0 on a successful transaction
   */
  async recordProviderSuccess(providerId) {
    try {
      const configRef = doc(this.db, 'config', 'payment_settings');
      const settings = await this.getSettings();
      const provider = settings.providers[providerId];

      if (provider && (provider.failureCount || 0) > 0) {
        settings.providers[providerId] = {
          ...provider,
          failureCount: 0,
          lastFailureTime: null,
          status: 'Online'
        };
        await setDoc(configRef, settings);
        await this.logger.info(providerId, 'Provider circuit breaker successfully reset. Status: Online.');
      }
    } catch (err) {
      console.error('[PaymentService] Failed to record success:', err);
    }
  }

  /**
   * Fetches provider settings and resolves the requested provider adapter.
   */
  async getProvider(providerId) {
    const settings = await this.getSettings();
    const providerConfig = settings.providers[providerId];
    if (!providerConfig) {
      throw new Error(`Payment provider '${providerId}' configuration is not registered.`);
    }
    return getPaymentProviderAdapter(providerConfig);
  }
}

export const paymentServiceInstance = new PaymentService();
export default paymentServiceInstance;
