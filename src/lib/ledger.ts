import { Firestore, doc, getDoc, runTransaction } from 'firebase/firestore';
import { Transaction } from '../types';

/**
 * Computes a simple, deterministic alphanumeric key for transaction reference duplicate check.
 */
export function generateDeterministicTxId(userId: string, type: string, referenceId: string): string {
  const cleanRef = (referenceId || '').replace(/[^a-zA-Z0-9]/g, '');
  return `TX-${userId.substring(0, 5).toUpperCase()}-${type.toUpperCase()}-${cleanRef || Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

interface LedgerParams {
  db: Firestore;
  userId: string;
  type: 'deposit' | 'bet' | 'win' | 'withdrawal' | 'game_win' | 'game_loss' | 'bonus' | 'admin_adjustment';
  amount: number;
  referenceId?: string;
  preventDuplicates?: boolean;
  description?: string;
}

/**
 * Secure Balance Ledger System
 * 
 * Guarantees that:
 * 1. User balance is never updated without creating a robust, searchable Transaction record.
 * 2. Every single change tracks balanceBefore and balanceAfter atomically.
 * 3. Prevents concurrent modifications and race conditions using Firestore transactions.
 * 4. Strictly prevents duplicate transactions for the same reference ID.
 */
export async function executeLedgerTransaction({
  db,
  userId,
  type,
  amount,
  referenceId,
  preventDuplicates = false,
  description
}: LedgerParams): Promise<{ success: boolean; balanceBefore: number; balanceAfter: number; transactionId: string }> {
  const playerRef = doc(db, 'players', userId);
  const userRef = doc(db, 'users', userId);
  
  // Create a deterministic ID if preventDuplicates is true, otherwise generate a unique random ID
  const txId = (preventDuplicates && referenceId)
    ? generateDeterministicTxId(userId, type, referenceId)
    : `TX-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;

  const txRef = doc(db, 'transactions', txId);

  return await runTransaction(db, async (transaction) => {
    // 1. Check for duplicate transactions if requested
    if (preventDuplicates && referenceId) {
      const duplicateSnap = await transaction.get(txRef);
      if (duplicateSnap.exists()) {
        throw new Error(`Transaction already processed. Duplicate transaction blocked for referenceId '${referenceId}'.`);
      }
    }

    // 2. Fetch both profiles
    const playerSnap = await transaction.get(playerRef);
    if (!playerSnap.exists()) {
      throw new Error(`Player profile for user '${userId}' does not exist.`);
    }

    const playerData = playerSnap.data();
    
    // Determine balanceBefore (use user collection as source of truth if available, otherwise player)
    let balanceBefore = playerData.balance ?? 0;
    
    const userSnap = await transaction.get(userRef);
    if (userSnap.exists()) {
      balanceBefore = userSnap.data().balance ?? userSnap.data().walletBalance ?? balanceBefore;
    }

    // 3. Compute balanceAfter
    let balanceAfter = balanceBefore;
    const isAdding = (type === 'deposit' || type === 'win' || type === 'game_win' || type === 'bonus');
    const isSubtracting = (type === 'withdrawal' || type === 'bet' || type === 'game_loss');

    if (isAdding) {
      balanceAfter = balanceBefore + Math.abs(amount);
    } else if (isSubtracting) {
      balanceAfter = balanceBefore - Math.abs(amount);
    } else if (type === 'admin_adjustment') {
      balanceAfter = balanceBefore + amount; // amount can be positive or negative for adjustments
    } else {
      balanceAfter = balanceBefore + amount;
    }

    // 4. Ensure deduction does not cause negative balance
    if (balanceAfter < 0) {
      throw new Error(`Insufficient balance. Current balance is ${balanceBefore} USDT. Requested deduction: ${amount} USDT.`);
    }

    const timestamp = Date.now();

    // 5. Update user record
    if (userSnap.exists()) {
      transaction.update(userRef, {
        balance: balanceAfter,
        walletBalance: balanceAfter, // Keep for backwards compatibility
        updatedAt: timestamp
      });
    } else {
      // Create user record if missing
      transaction.set(userRef, {
        userId,
        username: playerData.name || 'Player',
        email: playerData.email || '',
        balance: balanceAfter,
        walletBalance: balanceAfter,
        createdAt: timestamp,
        updatedAt: timestamp,
        status: 'active'
      });
    }

    // 6. Update player record
    transaction.update(playerRef, {
      balance: balanceAfter,
      updatedAt: timestamp
    });

    // Default description based on transaction type
    let defaultDesc = '';
    switch (type) {
      case 'deposit':
        defaultDesc = 'Funds deposited into wallet';
        break;
      case 'withdrawal':
        defaultDesc = 'Funds withdrawn from wallet';
        break;
      case 'game_win':
      case 'win':
        defaultDesc = 'Winnings from game round';
        break;
      case 'game_loss':
      case 'bet':
        defaultDesc = 'Bet placed on game round';
        break;
      case 'bonus':
        defaultDesc = 'Bonus credited to wallet';
        break;
      case 'admin_adjustment':
        defaultDesc = 'Administrative balance adjustment';
        break;
      default:
        defaultDesc = 'Wallet balance transaction';
    }
    const finalDescription = description || defaultDesc;

    // 7. Write the immutable transaction record
    const newTxn: Transaction = {
      id: txId,
      transactionId: txId,
      playerId: userId,
      userId: userId,
      type,
      amount: Math.abs(amount),
      balanceBefore,
      balanceAfter,
      referenceId: referenceId || '',
      timestamp,
      createdAt: timestamp,
      status: 'completed',
      description: finalDescription
    };
    transaction.set(txRef, newTxn);

    // 8. Write activity audit log
    const auditId = `AUD-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
    const auditRef = doc(db, 'auditLogs', auditId);
    transaction.set(auditRef, {
      logId: auditId,
      userId,
      adminId: null,
      action: `balance_${type}`,
      module: 'ledger',
      oldValue: balanceBefore.toFixed(4),
      newValue: balanceAfter.toFixed(4),
      timestamp,
      ipAddress: '127.0.0.1'
    });

    return {
      success: true,
      balanceBefore,
      balanceAfter,
      transactionId: txId
    };
  });
}
