import { 
  doc, 
  runTransaction, 
  collection, 
  Firestore 
} from 'firebase/firestore';
import { db } from './firebase';

export interface WalletTransactionMetadata {
  description?: string;
  source?: string;
  paymentId?: string;
  externalTransactionId?: string;
  idempotencyKey?: string;
  isDeduction?: boolean;
  allowNegative?: boolean;
  [key: string]: any;
}

export interface WalletTransactionResult {
  success: boolean;
  duplicate?: boolean;
  transactionId: string;
  userId?: string;
  type?: string;
  amount?: number;
  balanceBefore?: number;
  balanceAfter?: number;
  status?: string;
}

export class WalletServiceTS {
  private customDb?: Firestore;

  constructor(customDb?: Firestore) {
    this.customDb = customDb;
  }

  private get targetDb(): Firestore {
    return this.customDb || db;
  }

  async executeWalletTransaction({
    userId,
    type,
    amount,
    metadata = {},
    idempotencyKey = null
  }: {
    userId: string;
    type: 'deposit' | 'withdrawal' | 'game_win' | 'game_loss' | 'bonus' | 'admin_adjustment';
    amount: number;
    metadata?: WalletTransactionMetadata;
    idempotencyKey?: string | null;
  }): Promise<WalletTransactionResult> {
    const numAmount = Number(amount);

    if (!userId) {
      throw new Error('WalletService: userId is required.');
    }
    if (isNaN(numAmount) || numAmount < 0) {
      throw new Error(`WalletService: Invalid transaction amount '${amount}'.`);
    }

    const externalTxId = idempotencyKey || metadata.idempotencyKey || metadata.externalTransactionId || metadata.paymentId;
    const txnId = externalTxId ? `tx_${externalTxId}` : `tx_${type}_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    const txnRef = doc(collection(this.targetDb, 'transactions'), txnId);
    const userRef = doc(this.targetDb, 'users', userId);
    const playerRef = doc(this.targetDb, 'players', userId);

    return await runTransaction(this.targetDb, async (transaction) => {
      // 1. Idempotency check
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

      // 2. Fetch documents
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

      // 3. Calculate new balance
      let balanceAfter = balanceBefore;
      const isCredit = ['deposit', 'game_win', 'bonus', 'admin_adjustment'].includes(type) && (metadata.isDeduction !== true);

      if (isCredit) {
        balanceAfter = balanceBefore + numAmount;
      } else {
        if (balanceBefore < numAmount && !metadata.allowNegative) {
          throw new Error(`WalletService: Insufficient balance. Available: ₹${balanceBefore.toFixed(2)}, Required: ₹${numAmount.toFixed(2)}.`);
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

      // 6. Record transaction in ledger
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
          source: metadata.source || 'wallet_service_ts'
        }
      };

      transaction.set(txnRef, ledgerEntry);

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

  async deposit(userId: string, amount: number, metadata: WalletTransactionMetadata = {}, idempotencyKey: string | null = null) {
    return this.executeWalletTransaction({ userId, type: 'deposit', amount, metadata, idempotencyKey });
  }

  async withdraw(userId: string, amount: number, metadata: WalletTransactionMetadata = {}, idempotencyKey: string | null = null) {
    return this.executeWalletTransaction({ userId, type: 'withdrawal', amount, metadata, idempotencyKey });
  }

  async gameWin(userId: string, amount: number, metadata: WalletTransactionMetadata = {}, idempotencyKey: string | null = null) {
    return this.executeWalletTransaction({ userId, type: 'game_win', amount, metadata, idempotencyKey });
  }

  async gameLoss(userId: string, amount: number, metadata: WalletTransactionMetadata = {}, idempotencyKey: string | null = null) {
    return this.executeWalletTransaction({ userId, type: 'game_loss', amount, metadata, idempotencyKey });
  }

  async adminAdjustment(userId: string, amount: number, metadata: WalletTransactionMetadata = {}, idempotencyKey: string | null = null) {
    return this.executeWalletTransaction({ userId, type: 'admin_adjustment', amount, metadata, idempotencyKey });
  }

  async bonus(userId: string, amount: number, metadata: WalletTransactionMetadata = {}, idempotencyKey: string | null = null) {
    return this.executeWalletTransaction({ userId, type: 'bonus', amount, metadata, idempotencyKey });
  }
}

export const walletServiceTS = new WalletServiceTS();
export default walletServiceTS;
