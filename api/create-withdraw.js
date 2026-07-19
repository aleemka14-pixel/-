import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, runTransaction, updateDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { walletService } from '../wallet/wallet-service.js';

/**
 * Helper to record a notification record for the user in Firestore.
 */
async function notifyUser(db, userId, title, message) {
  try {
    const notificationId = 'NTF-' + Math.random().toString(36).substr(2, 9).toUpperCase();
    const notificationRef = doc(db, 'notifications', notificationId);
    await setDoc(notificationRef, {
      id: notificationId,
      userId,
      title,
      message,
      type: 'withdrawal',
      status: 'unread',
      createdAt: Date.now()
    });
    console.log(`[Notification] Created notification for user ${userId}: ${title}`);
  } catch (err) {
    console.error(`[Notification Error] Failed to write user notification:`, err.message);
  }
}

// Initialize Firebase App server-side
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

/**
 * Validates a crypto wallet address format according to network rules.
 */
function validateWalletAddress(address, network) {
  const addr = address.trim();
  if (!addr) return false;
  
  const netUpper = network.toUpperCase();
  if (netUpper.includes('TRC20') || netUpper === 'TRON' || netUpper === 'TRX') {
    return /^T[a-km-zA-HJ-NP-Z1-9]{33}$/.test(addr);
  } else if (netUpper.includes('BEP20') || netUpper.includes('ERC20') || netUpper === 'BSC' || netUpper === 'ETH' || netUpper === 'ETHEREUM') {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }
  
  return addr.length >= 10 && addr.length <= 64;
}

/**
 * API Endpoint: POST /api/create-withdraw
 * 
 * Production-ready automatic crypto withdrawal system handler with 
 * duplicate protection, atomic balance locks, and automated ledger logging.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} Not Allowed. Only POST is supported.`
    });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  try {
    const { 
      userId, 
      playerId, 
      amount, 
      network, 
      walletAddress, 
      withdrawalAddress,
      paymentId,
      preferredCurrency, 
      exchangeRate, 
      preferredAmount, 
      settlementCurrency 
    } = req.body;

    const resolvedUserId = userId || playerId;
    const resolvedWalletAddress = (walletAddress || withdrawalAddress || '').trim();
    
    // Log withdrawal requested
    console.log(`[Withdrawal Service] Withdrawal requested: Amount=${amount} USDT, Network=${network}, WalletAddress=${resolvedWalletAddress}, User=${resolvedUserId}`);

    // 1. Core Request Validations
    if (!resolvedUserId) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameter: userId (or playerId)."
      });
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid withdrawal amount. Must be a positive number."
      });
    }

    if (!network) {
      return res.status(400).json({
        success: false,
        error: "Missing crypto network parameter (TRC20, BEP20, ERC20)."
      });
    }

    if (!resolvedWalletAddress) {
      return res.status(400).json({
        success: false,
        error: "Missing wallet Address."
      });
    }

    const netUpper = network.toUpperCase();
    if (!netUpper.includes('TRC20') && !netUpper.includes('BEP20') && !netUpper.includes('ERC20')) {
      return res.status(400).json({
        success: false,
        error: `Crypto network '${network}' is not supported. Supported networks: TRC20, BEP20, ERC20.`
      });
    }

    // 2. Validate wallet address format
    const isValidAddress = validateWalletAddress(resolvedWalletAddress, netUpper);
    if (!isValidAddress) {
      return res.status(400).json({
        success: false,
        error: `Invalid address format for network '${network}'. Please verify the receiving address.`
      });
    }

    // 3. Retrieve global settings to validate dynamic withdrawal limits
    const settingsRef = doc(db, 'config', 'withdrawal_settings');
    const settingsSnap = await getDoc(settingsRef);
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};

    const minLimit = Number(settings.minWithdraw) || 10.0;
    const maxLimit = Number(settings.maxWithdraw) || 10000.0;

    if (Number(amount) < minLimit) {
      return res.status(400).json({
        success: false,
        error: `Withdrawal amount is below the minimum limit of ${minLimit} USDT.`
      });
    }

    if (Number(amount) > maxLimit) {
      return res.status(400).json({
        success: false,
        error: `Withdrawal amount exceeds the maximum single transaction limit of ${maxLimit} USDT.`
      });
    }

    // 4. Determine withdrawal identifiers & enforce duplicate protection
    const withdrawalId = (req.body.withdrawalId || paymentId || req.body.id || 'WID-' + Math.random().toString(36).substr(2, 9).toUpperCase()).trim();
    const txnId = 'TXN-' + withdrawalId.replace(/[^a-zA-Z0-9-]/g, '');
    const timestampNow = Date.now();

    // Prevent duplicate submission in a short period (fallback lock)
    try {
      const withdrawalsRef = collection(db, 'withdrawals');
      const sixtySecondsAgo = timestampNow - 60 * 1000;
      const q = query(
        withdrawalsRef,
        where('playerId', '==', resolvedUserId),
        where('amount', '==', Number(amount)),
        where('status', '==', 'pending'),
        where('timestamp', '>', sixtySecondsAgo)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        return res.status(400).json({
          success: false,
          error: "A pending withdrawal request with the exact same amount is currently in queue. Please wait."
        });
      }
    } catch (e) {
      console.warn("[Withdrawal Service Info] Quick duplicate check bypassed:", e.message);
    }

    let withdrawalDocData = null;
    let isAutoWithdraw = settings.autoWithdrawEnabled ?? true;

    // 5. Execute Atomic Balance Check, Lock and Deduction inside Firestore Transaction
    await runTransaction(db, async (transaction) => {
      // Check if withdrawalId has already been processed to prevent double-spending/duplicate withdrawal request
      const existingWithdrawalRef = doc(db, 'withdrawals', withdrawalId);
      const existingSnap = await transaction.get(existingWithdrawalRef);
      if (existingSnap.exists()) {
        throw new Error(`Duplicate transaction blocked. Withdrawal with ID ${withdrawalId} has already been processed.`);
      }

      // Check user/player profiles
      const playerRef = doc(db, 'players', resolvedUserId);
      const userRef = doc(db, 'users', resolvedUserId);

      const playerSnap = await transaction.get(playerRef);
      if (!playerSnap.exists()) {
        throw new Error(`Player profile with ID '${resolvedUserId}' was not found.`);
      }

      const playerData = playerSnap.data();
      const currentBalance = playerData.balance || 0;

      // Ensure insufficient balance and negative balance are strictly rejected
      if (currentBalance < Number(amount)) {
        throw new Error(`Insufficient balance. Available balance: ${currentBalance} USDT. Requested: ${amount} USDT.`);
      }

      const updatedBalance = currentBalance - Number(amount);
      if (updatedBalance < 0) {
        throw new Error("Deduction would result in a negative balance. Transaction aborted.");
      }

      // Log balance locked
      console.log(`[Withdrawal Service] Balance locked. Deducting ${amount} USDT. Balance: ${currentBalance} -> ${updatedBalance}`);

      // Deduct balance from player profile
      transaction.update(playerRef, { 
        balance: updatedBalance,
        updatedAt: timestampNow
      });

      // Deduct balance from user profile (if exists)
      const userSnap = await transaction.get(userRef);
      if (userSnap.exists()) {
        transaction.update(userRef, { 
          balance: updatedBalance,
          walletBalance: updatedBalance,
          updatedAt: timestampNow
        });
      }

      // Fee calculations
      let networkFee = 1.0;
      if (netUpper.includes('BEP20')) networkFee = 0.5;
      if (netUpper.includes('ERC20')) networkFee = 5.0;

      const finalAmount = Math.max(0, Number(amount) - networkFee);

      // Create withdrawal document (matching requested schema + backward-compatible schema)
      withdrawalDocData = {
        id: withdrawalId,
        withdrawalId: withdrawalId,
        userId: resolvedUserId,
        playerId: resolvedUserId,
        playerName: playerData.name || resolvedUserId,
        amount: Number(amount),
        network: netUpper,
        blockchain: netUpper,
        method: netUpper,
        details: `USDT Withdrawal to ${resolvedWalletAddress}`,
        walletAddress: resolvedWalletAddress,
        withdrawalAddress: resolvedWalletAddress,
        provider: walletService.config.activeProvider || 'mock',
        status: 'pending',
        createdAt: timestampNow,
        updatedAt: timestampNow,
        timestamp: timestampNow,
        processedAt: null,
        playerBalanceAtRequest: currentBalance,
        fee: networkFee,
        finalAmount: finalAmount,
        transactionHash: '',
        preferredCurrency: preferredCurrency || 'USD',
        exchangeRate: exchangeRate ? Number(exchangeRate) : 1.0,
        preferredAmount: preferredAmount ? Number(preferredAmount) : Number(amount),
        settlementCurrency: settlementCurrency || 'USDT'
      };

      transaction.set(existingWithdrawalRef, withdrawalDocData);

      // Record transaction ledger log
      const txnDocRef = doc(db, 'transactions', txnId);
      const transactionDoc = {
        id: txnId,
        transactionId: txnId,
        playerId: resolvedUserId,
        userId: resolvedUserId,
        type: 'withdrawal',
        amount: Number(amount),
        balanceBefore: currentBalance,
        balanceAfter: updatedBalance,
        referenceId: withdrawalId,
        network: netUpper,
        timestamp: timestampNow,
        createdAt: timestampNow,
        status: 'pending',
        transactionHash: '',
        preferredCurrency: preferredCurrency || 'USD',
        exchangeRate: exchangeRate ? Number(exchangeRate) : 1.0,
        preferredAmount: preferredAmount ? Number(preferredAmount) : Number(amount),
        settlementCurrency: settlementCurrency || 'USDT'
      };
      transaction.set(txnDocRef, transactionDoc);

      // Record Activity Audit Log
      const auditLogId = `AUD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      const auditDocRef = doc(db, 'auditLogs', auditLogId);
      transaction.set(auditDocRef, {
        logId: auditLogId,
        userId: resolvedUserId,
        adminId: null,
        action: 'withdrawal_request',
        module: 'withdrawal',
        oldValue: currentBalance.toFixed(4),
        newValue: updatedBalance.toFixed(4),
        ipAddress: ip,
        timestamp: timestampNow
      });
    });

    console.log(`[Withdrawal Service] Balance locked & withdrawal document successfully written: ${withdrawalId}`);

    // 6. Automatic Withdrawal Execution Flow
    if (isAutoWithdraw) {
      console.log(`[Withdrawal Service] Automatic withdrawal enabled. Calling wallet provider...`);

      // Mark status as 'processing' in database immediately before blockchain broadcast
      const withdrawalRef = doc(db, 'withdrawals', withdrawalId);
      await updateDoc(withdrawalRef, { 
        status: 'processing',
        adminNotes: 'Automated transfer initiated.',
        updatedAt: Date.now()
      });

      try {
        console.log(`[Withdrawal Service] Wallet provider called for ${withdrawalId}`);
        const finalAmountToSend = withdrawalDocData.finalAmount;

        // Perform crypto transfer
        const txReceipt = await walletService.sendTransaction(netUpper, resolvedWalletAddress, finalAmountToSend);
        
        if (txReceipt && txReceipt.success) {
          console.log(`[Withdrawal Service] Transaction hash received: ${txReceipt.txHash}`);
          
          // Complete withdrawal in database
          await runTransaction(db, async (txn) => {
            txn.update(withdrawalRef, {
              status: 'completed',
              transactionHash: txReceipt.txHash,
              completedAt: Date.now(),
              processedAt: Date.now(),
              updatedAt: Date.now(),
              adminNotes: 'Automatically completed via modular hot wallet service.'
            });

            // Update transaction ledger
            const txnRef = doc(db, 'transactions', txnId);
            txn.update(txnRef, {
              status: 'completed',
              transactionHash: txReceipt.txHash
            });

            // Record completion audit log
            const completionAuditId = `AUD-COM-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            const compAuditRef = doc(db, 'auditLogs', completionAuditId);
            txn.set(compAuditRef, {
              logId: completionAuditId,
              userId: resolvedUserId,
              adminId: 'system_auto',
              action: 'withdrawal_automatic_completion',
              module: 'withdrawal',
              oldValue: 'processing',
              newValue: 'completed',
              ipAddress: ip,
              timestamp: Date.now()
            });
          });

          await notifyUser(db, resolvedUserId, 'Withdrawal Completed', `Your automatic withdrawal of ${amount} USDT has been completed on network ${network}. TxHash: ${txReceipt.txHash}`);

          withdrawalDocData.status = 'completed';
          withdrawalDocData.transactionHash = txReceipt.txHash;
          
          console.log(`[Withdrawal Service] Withdrawal completed for ID: ${withdrawalId}`);
        } else {
          throw new Error("Wallet provider completed transfer but failed to return a transaction hash.");
        }
      } catch (transferError) {
        console.error(`[Withdrawal Service] Crypto transfer failed: ${transferError.message || transferError}`);
        console.log(`[Withdrawal Service] Withdrawal failed for ID: ${withdrawalId}. Executing automatic user refund...`);

        // Update document status to failed and refund the balance
        await runTransaction(db, async (txn) => {
          const playerRef = doc(db, 'players', resolvedUserId);
          const userRef = doc(db, 'users', resolvedUserId);

          const playerSnap = await txn.get(playerRef);
          const currentBal = playerSnap.exists() ? (playerSnap.data().balance || 0) : 0;
          const refundedBalance = currentBal + Number(amount);

          txn.update(playerRef, { 
            balance: refundedBalance,
            updatedAt: Date.now()
          });

          const userSnap = await txn.get(userRef);
          if (userSnap.exists()) {
            txn.update(userRef, {
              balance: refundedBalance,
              walletBalance: refundedBalance,
              updatedAt: Date.now()
            });
          }

          txn.update(withdrawalRef, {
            status: 'failed',
            adminNotes: `Auto transfer failed: ${transferError.message || 'Node network error'}. Balance refunded.`,
            processedAt: Date.now(),
            updatedAt: Date.now()
          });

          const txnRef = doc(db, 'transactions', txnId);
          txn.update(txnRef, {
            status: 'failed'
          });

          // Record rollback audit log
          const rollbackAuditId = `AUD-RBF-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
          const rollAuditRef = doc(db, 'auditLogs', rollbackAuditId);
          txn.set(rollAuditRef, {
            logId: rollbackAuditId,
            userId: resolvedUserId,
            adminId: 'system_auto',
            action: 'withdrawal_automatic_refund',
            module: 'withdrawal',
            oldValue: 'processing',
            newValue: 'failed',
            ipAddress: ip,
            timestamp: Date.now()
          });
        });

        await notifyUser(db, resolvedUserId, 'Withdrawal Failed & Refunded', `Your automatic withdrawal of ${amount} USDT failed: ${transferError.message || 'Network error'}. Your balance has been fully refunded.`);

        withdrawalDocData.status = 'failed';
        withdrawalDocData.adminNotes = `Auto transfer failed: ${transferError.message || 'Node network error'}. Balance refunded.`;
      }
    } else {
      // Automatic withdrawal disabled, notify pending approval
      await notifyUser(db, resolvedUserId, 'Withdrawal Pending Approval', `Your withdrawal request of ${amount} USDT is pending admin review.`);
    }

    return res.status(200).json({
      success: true,
      message: isAutoWithdraw 
        ? (withdrawalDocData.status === 'completed' ? "Automatic withdrawal completed." : `Automatic withdrawal failed: ${withdrawalDocData.adminNotes}`)
        : "Withdrawal request submitted successfully, pending admin review.",
      withdrawal: withdrawalDocData
    });

  } catch (error) {
    console.error("[Withdrawal Service] Error:", error);
    return res.status(error.message?.includes('balance') || error.message?.includes('Duplicate') ? 400 : 500).json({
      success: false,
      error: error.message || "Internal Server Error during withdrawal creation."
    });
  }
}
