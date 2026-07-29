import { 
  getFirestore, 
  doc, 
  runTransaction, 
  collection, 
  getDoc 
} from 'firebase/firestore';
import { getApps, getApp } from 'firebase/app';
import fs from 'fs';
import path from 'path';

/**
 * Safe Helper to retrieve default Firestore instance
 */
function getDefaultDb() {
  let firebaseConfig;
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    // Ignore in client browser context
  }

  const app = getApps().length === 0 ? null : getApp();
  if (!app) {
    throw new Error('WalletService: Firebase App is not initialized.');
  }

  const dbId = firebaseConfig?.firestoreDatabaseId || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || 'ai-studio-8036f1f6-5204-4076-9a49-fc8a3d7ebda4';
  return getFirestore(app, dbId);
}

export class WalletService {
  constructor(db) {
    this._db = db;
  }

  get db() {
    return this._db || getDefaultDb();
  }

  /**
   * Internal Core Transaction Execution Engine
   * Atomic balance update + Idempotency Protection + Transaction Ledger Entry
   */
  async executeWalletTransaction({
    userId,
    type, // 'deposit' | 'withdrawal' | 'game_win' | 'game_loss' | 'bonus' | 'admin_adjustment'
    amount,
    metadata = {},
    idempotencyKey = null,
    dbOverride = null
  }) {
    const targetDb = dbOverride || this.db;
    const numAmount = Number(amount);

    if (!userId) {
      throw new Error('WalletService: userId is required.');
    }
    if (isNaN(numAmount) || numAmount < 0) {
      throw new Error(`WalletService: Invalid transaction amount '${amount}'. Amount must be a non-negative number.`);
    }

    // Determine unique transaction doc ID
    const externalTxId = idempotencyKey || metadata.idempotencyKey || metadata.externalTransactionId || metadata.paymentId || metadata.depositId;
    const txnId = externalTxId ? `tx_${externalTxId}` : `tx_${type}_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const txnRef = doc(collection(targetDb, 'transactions'), txnId);
    const userRef = doc(targetDb, 'users', userId);
    const playerRef = doc(targetDb, 'players', userId);

    return await runTransaction(targetDb, async (transaction) => {
      // 1. Idempotency check: Ensure transaction wasn't already processed
      const existingTxnSnap = await transaction.get(txnRef);
      if (existingTxnSnap.exists()) {
        const existingData = existingTxnSnap.data();
        console.log(`[WalletService] Idempotency triggered. Transaction '${txnId}' already processed.`);
        return {
          success: true,
          duplicate: true,
          transactionId: txnId,
          balanceBefore: existingData.balanceBefore,
          balanceAfter: existingData.balanceAfter,
          amount: existingData.amount,
          type: existingData.type
        };
      }

      // 2. Fetch User & Player documents
      const userSnap = await transaction.get(userRef);
      const playerSnap = await transaction.get(playerRef);

      let balanceBefore = 0;
      if (userSnap.exists()) {
        const uData = userSnap.data();
        balanceBefore = Number(uData.walletBalance ?? uData.balance ?? 0);
      } else if (playerSnap.exists()) {
        const pData = playerSnap.data();
        balanceBefore = Number(pData.balance ?? pData.walletBalance ?? 0);
      }
      if (isNaN(balanceBefore)) balanceBefore = 0;

      // 3. Calculate new balance based on transaction type
      let balanceAfter = balanceBefore;
      const isCredit = ['deposit', 'game_win', 'bonus', 'admin_adjustment'].includes(type) && (metadata.isDeduction !== true);

      if (isCredit) {
        balanceAfter = balanceBefore + numAmount;
      } else {
        // Deduction check: Prevent negative balance
        if (balanceBefore < numAmount && !metadata.allowNegative) {
          throw new Error(`WalletService: Insufficient balance for user '${userId}'. Current: ₹${balanceBefore.toFixed(2)}, Required: ₹${numAmount.toFixed(2)}.`);
        }
        balanceAfter = Math.max(0, balanceBefore - numAmount);
      }

      balanceAfter = parseFloat(balanceAfter.toFixed(4));
      const now = Date.now();

      // 4. Update User document
      if (userSnap.exists()) {
        transaction.update(userRef, {
          walletBalance: balanceAfter,
          balance: balanceAfter,
          updatedAt: now
        });
      } else {
        transaction.set(userRef, {
          id: userId,
          walletBalance: balanceAfter,
          balance: balanceAfter,
          createdAt: now,
          updatedAt: now
        }, { merge: true });
      }

      // 5. Update Player document
      if (playerSnap.exists()) {
        transaction.update(playerRef, {
          balance: balanceAfter,
          walletBalance: balanceAfter,
          updatedAt: now
        });
      } else {
        transaction.set(playerRef, {
          id: userId,
          balance: balanceAfter,
          walletBalance: balanceAfter,
          createdAt: now,
          updatedAt: now
        }, { merge: true });
      }

      // 6. Record transaction in ledger with standardized currency fields
      const currency = metadata.currency || 'USDT';
      const baseCurrency = metadata.baseCurrency || 'USDT';
      const baseAmount = metadata.baseAmount !== undefined ? Number(metadata.baseAmount) : numAmount;

      const ledgerEntry = {
        transactionId: txnId,
        userId,
        type,
        amount: numAmount,
        currency,
        baseAmount,
        baseCurrency,
        balanceBefore,
        balanceAfter,
        status: 'completed',
        description: metadata.description || `Wallet ${type} of ${currency === 'INR' ? '₹' : ''}${numAmount}`,
        createdAt: now,
        idempotencyKey: externalTxId || null,
        metadata: {
          ...metadata,
          source: metadata.source || 'wallet_service'
        }
      };

      transaction.set(txnRef, ledgerEntry);

      console.log(`[WalletService] Successfully executed ${type} for user ${userId}. Balance: ₹${balanceBefore} -> ₹${balanceAfter}`);

      return {
        success: true,
        transactionId: txnId,
        userId,
        type,
        amount: numAmount,
        balanceBefore,
        balanceAfter,
        status: 'completed'
      };
    });
  }

  // Helper Methods

  async deposit(userId, amount, metadata = {}, idempotencyKey = null, dbOverride = null) {
    return this.executeWalletTransaction({
      userId,
      type: 'deposit',
      amount,
      metadata,
      idempotencyKey,
      dbOverride
    });
  }

  async withdraw(userId, amount, metadata = {}, idempotencyKey = null, dbOverride = null) {
    return this.executeWalletTransaction({
      userId,
      type: 'withdrawal',
      amount,
      metadata,
      idempotencyKey,
      dbOverride
    });
  }

  async gameWin(userId, amount, metadata = {}, idempotencyKey = null, dbOverride = null) {
    return this.executeWalletTransaction({
      userId,
      type: 'game_win',
      amount,
      metadata,
      idempotencyKey,
      dbOverride
    });
  }

  async gameLoss(userId, amount, metadata = {}, idempotencyKey = null, dbOverride = null) {
    return this.executeWalletTransaction({
      userId,
      type: 'game_loss',
      amount,
      metadata,
      idempotencyKey,
      dbOverride
    });
  }

  async adminAdjustment(userId, amount, metadata = {}, idempotencyKey = null, dbOverride = null) {
    return this.executeWalletTransaction({
      userId,
      type: 'admin_adjustment',
      amount,
      metadata,
      idempotencyKey,
      dbOverride
    });
  }

  async bonus(userId, amount, metadata = {}, idempotencyKey = null, dbOverride = null) {
    return this.executeWalletTransaction({
      userId,
      type: 'bonus',
      amount,
      metadata,
      idempotencyKey,
      dbOverride
    });
  }
}

export const walletService = new WalletService();
export default walletService;
