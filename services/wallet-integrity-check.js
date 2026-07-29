import { 
  getFirestore, 
  collection, 
  getDocs, 
  query, 
  where, 
  doc, 
  getDoc
} from 'firebase/firestore';
import { getApps, getApp } from 'firebase/app';
import fs from 'fs';
import path from 'path';

function getDefaultDb() {
  const app = getApps().length === 0 ? null : getApp();
  if (!app) {
    throw new Error('WalletIntegrityCheck: Firebase App is not initialized.');
  }
  return getFirestore(app);
}

/**
  Checks balance integrity for a specific user or all active users.
  Calculates expected balance by processing transaction ledger entries.
 */
export async function verifyWalletIntegrity(userId = null, dbOverride = null) {
  const db = dbOverride || getDefaultDb();
  const report = {
    checkedAt: new Date().toISOString(),
    totalUsersChecked: 0,
    mismatchesFound: 0,
    discrepancies: []
  };

  let userIdsToCheck = [];

  if (userId) {
    userIdsToCheck = [userId];
  } else {
    const playersSnap = await getDocs(collection(db, 'players'));
    userIdsToCheck = playersSnap.docs.map(d => d.id);
  }

  report.totalUsersChecked = userIdsToCheck.length;

  for (const targetUid of userIdsToCheck) {
    try {
      const userRef = doc(db, 'users', targetUid);
      const playerRef = doc(db, 'players', targetUid);

      const [userSnap, playerSnap] = await Promise.all([
        getDoc(userRef),
        getDoc(playerRef)
      ]);

      const userBalance = userSnap.exists() ? (Number(userSnap.data().walletBalance ?? userSnap.data().balance) || 0) : null;
      const playerBalance = playerSnap.exists() ? (Number(playerSnap.data().balance) || 0) : null;
      const currentStoredBalance = userBalance !== null ? userBalance : (playerBalance || 0);

      // Query all completed transactions for this user
      const qUser = query(collection(db, 'transactions'), where('userId', '==', targetUid));
      const qPlayer = query(collection(db, 'transactions'), where('playerId', '==', targetUid));

      const [txUserSnap, txPlayerSnap] = await Promise.all([
        getDocs(qUser),
        getDocs(qPlayer)
      ]);

      const seenTxIds = new Set();
      const userTransactions = [];

      [...txUserSnap.docs, ...txPlayerSnap.docs].forEach(d => {
        if (!seenTxIds.has(d.id)) {
          seenTxIds.add(d.id);
          userTransactions.push({ id: d.id, ...d.data() });
        }
      });

      // Calculate balance from transaction ledger
      let calculatedBalance = 0;
      let duplicateCredits = [];
      const seenIdempotencyKeys = new Set();

      userTransactions.forEach(tx => {
        if (tx.status !== 'completed' && tx.status !== 'confirmed') return;

        const amt = Number(tx.amount || 0);
        const type = (tx.type || tx.action || '').toLowerCase();

        if (tx.idempotencyKey || tx.transactionId) {
          const key = tx.idempotencyKey || tx.transactionId;
          if (seenIdempotencyKeys.has(key)) {
            duplicateCredits.push({ txId: tx.id, key, amt });
          } else {
            seenIdempotencyKeys.add(key);
          }
        }

        const isCredit = ['deposit', 'game_win', 'bonus', 'admin_adjustment', 'win', 'crypto_deposit'].includes(type) && (!tx.metadata || !tx.metadata.isDeduction);

        if (isCredit) {
          calculatedBalance += amt;
        } else {
          calculatedBalance -= amt;
        }
      });

      calculatedBalance = parseFloat(calculatedBalance.toFixed(4));
      const diff = Math.abs(currentStoredBalance - calculatedBalance);

      if (diff > 0.01 || duplicateCredits.length > 0) {
        report.mismatchesFound++;
        report.discrepancies.push({
          userId: targetUid,
          storedBalance: currentStoredBalance,
          calculatedBalance,
          difference: parseFloat((currentStoredBalance - calculatedBalance).toFixed(4)),
          duplicateCreditsCount: duplicateCredits.length,
          duplicateCredits,
          totalTransactions: userTransactions.length
        });
      }
    } catch (err) {
      console.error(`Error checking integrity for user ${targetUid}:`, err);
    }
  }

  return report;
}

export default verifyWalletIntegrity;
