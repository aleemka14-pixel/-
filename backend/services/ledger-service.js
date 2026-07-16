import { doc } from 'firebase/firestore';

export function generateDeterministicTxId(userId, type, referenceId) {
  const cleanRef = (referenceId || '').replace(/[^a-zA-Z0-9]/g, '');
  return `TX-${userId.substring(0, 5).toUpperCase()}-${type.toUpperCase()}-${cleanRef || Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

export const ledgerService = {
  /**
   * Executes a safe ledger transaction inside an existing firestore runTransaction block.
   */
  async execute(transaction, db, { userId, type, amount, referenceId, preventDuplicates = false }) {
    const playerRef = doc(db, 'players', userId);
    const userRef = doc(db, 'users', userId);

    const txId = (preventDuplicates && referenceId)
      ? generateDeterministicTxId(userId, type, referenceId)
      : `TX-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;

    const txRef = doc(db, 'transactions', txId);

    if (preventDuplicates && referenceId) {
      const duplicateSnap = await transaction.get(txRef);
      if (duplicateSnap.exists()) {
        throw new Error(`Transaction already processed. Duplicate transaction blocked for referenceId '${referenceId}'.`);
      }
    }

    const playerSnap = await transaction.get(playerRef);
    if (!playerSnap.exists()) {
      throw new Error(`Player profile for user '${userId}' does not exist.`);
    }

    const playerData = playerSnap.data();
    let balanceBefore = playerData.balance ?? 0;

    const userSnap = await transaction.get(userRef);
    if (userSnap.exists()) {
      balanceBefore = userSnap.data().balance ?? userSnap.data().walletBalance ?? balanceBefore;
    }

    let balanceAfter = balanceBefore;
    const isAdding = (type === 'deposit' || type === 'win');
    if (isAdding) {
      balanceAfter = balanceBefore + amount;
    } else {
      balanceAfter = balanceBefore - amount;
    }

    if (balanceAfter < 0) {
      throw new Error(`Insufficient balance. Current balance is ${balanceBefore} USDT. Requested deduction: ${amount} USDT.`);
    }

    const timestamp = Date.now();

    // Update both tables atomically
    if (userSnap.exists()) {
      transaction.update(userRef, {
        balance: balanceAfter,
        walletBalance: balanceAfter,
        updatedAt: timestamp
      });
    } else {
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

    transaction.update(playerRef, {
      balance: balanceAfter,
      updatedAt: timestamp
    });

    transaction.set(txRef, {
      id: txId,
      transactionId: txId,
      playerId: userId,
      userId,
      type,
      amount,
      balanceBefore,
      balanceAfter,
      referenceId: referenceId || '',
      timestamp,
      createdAt: timestamp,
      status: 'completed'
    });

    // Write audit activity log
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
  }
};
