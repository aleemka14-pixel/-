import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  runTransaction 
} from 'firebase/firestore';
import { walletService } from '../../services/wallet-service.js';
import { validateDestinationAddress, evaluateWithdrawalRisk } from './withdrawal-validator.js';
import { checkWithdrawalRateLimit } from '../utils/rate-limiter.js';
import { logSecurityEvent } from '../utils/security-logger.js';

/**
 * Helper to record a notification record for the user in Firestore.
 */
async function notifyUser(db, userId, title, message) {
  if (!db || !userId) return;
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
  } catch (err) {
    console.error(`[Notification Error] Failed to write user notification:`, err.message);
  }
}

export const withdrawalService = {
  /**
   * Creates a new withdrawal request with atomic balance deduction,
   * idempotency protection, address validation, rate limiting, and risk evaluation.
   */
  async createWithdrawal(db, payload, ip = '127.0.0.1') {
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
      settlementCurrency,
      idempotencyKey
    } = payload;

    const resolvedUserId = userId || playerId;
    const resolvedAddress = (walletAddress || withdrawalAddress || '').trim();
    const netUpper = (network || 'TRC20').toUpperCase();
    const numAmount = Number(amount);

    // 1. Authenticated User Check
    if (!resolvedUserId) {
      await logSecurityEvent(db, {
        type: 'UNAUTHORIZED_WITHDRAWAL_ATTEMPT',
        message: 'Withdrawal attempt failed: missing userId/playerId',
        ip,
        severity: 'warning'
      });
      return {
        statusCode: 401,
        body: { success: false, error: "Authentication required. Missing user identifier.", errorCode: "UNAUTHORIZED" }
      };
    }

    // 2. Input Validations
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      return {
        statusCode: 400,
        body: { success: false, error: "Invalid withdrawal amount. Must be a positive number.", errorCode: "INVALID_AMOUNT" }
      };
    }

    // 3. Address Validation
    const addrValidation = validateDestinationAddress(resolvedAddress, netUpper);
    if (!addrValidation.isValid) {
      await logSecurityEvent(db, {
        type: 'INVALID_WALLET_ADDRESS',
        userId: resolvedUserId,
        message: addrValidation.reason,
        details: { network: netUpper, address: resolvedAddress },
        ip,
        severity: 'warning'
      });
      return {
        statusCode: 400,
        body: { success: false, error: addrValidation.reason, errorCode: "INVALID_ADDRESS" }
      };
    }

    // 4. Rate Limiting Check
    const rateLimitCheck = await checkWithdrawalRateLimit(db, resolvedUserId);
    if (!rateLimitCheck.allowed) {
      await logSecurityEvent(db, {
        type: 'RATE_LIMIT_EXCEEDED',
        userId: resolvedUserId,
        message: rateLimitCheck.error,
        ip,
        severity: 'warning'
      });
      return {
        statusCode: 429,
        body: { 
          success: false, 
          error: rateLimitCheck.error, 
          errorCode: rateLimitCheck.errorCode,
          cooldownRemainingMs: rateLimitCheck.cooldownRemainingMs
        }
      };
    }

    // 5. Dynamic Limits Check from Firestore Settings
    let minLimit = 10.0;
    let maxLimit = 10000.0;
    let autoWithdrawEnabled = true;

    try {
      const settingsRef = doc(db, 'config', 'withdrawal_settings');
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        const s = settingsSnap.data();
        if (s.minWithdraw) minLimit = Number(s.minWithdraw);
        if (s.maxWithdraw) maxLimit = Number(s.maxWithdraw);
        if (s.autoWithdrawEnabled !== undefined) autoWithdrawEnabled = s.autoWithdrawEnabled;
      }
    } catch (e) {
      console.warn("[WithdrawalService] Could not load withdrawal settings, using standard defaults:", e.message);
    }

    if (numAmount < minLimit) {
      return {
        statusCode: 400,
        body: { success: false, error: `Withdrawal amount is below the minimum allowed limit of ${minLimit} USDT.`, errorCode: "BELOW_MIN_LIMIT" }
      };
    }

    if (numAmount > maxLimit) {
      return {
        statusCode: 400,
        body: { success: false, error: `Withdrawal amount exceeds the maximum single transaction limit of ${maxLimit} USDT.`, errorCode: "EXCEEDS_MAX_LIMIT" }
      };
    }

    // 6. Idempotency & Duplicate Check
    const withdrawalId = (payload.withdrawalId || paymentId || payload.id || 'WID-' + Math.random().toString(36).substr(2, 9).toUpperCase()).trim();
    const txnId = 'TXN-' + withdrawalId.replace(/[^a-zA-Z0-9-]/g, '');
    const timestampNow = Date.now();

    // Check recent duplicate requests with same parameters within 60s
    try {
      const withdrawalsRef = collection(db, 'withdrawals');
      const sixtySecsAgo = timestampNow - 60000;
      const q = query(
        withdrawalsRef,
        where('playerId', '==', resolvedUserId),
        where('amount', '==', numAmount),
        where('status', 'in', ['pending', 'processing']),
        where('timestamp', '>', sixtySecsAgo)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        return {
          statusCode: 409,
          body: { success: false, error: "A pending withdrawal with the exact same amount was submitted recently. Please wait.", errorCode: "DUPLICATE_SUBMISSION" }
        };
      }
    } catch (e) {
      console.warn("[WithdrawalService] Fallback index check for duplicates bypassed:", e.message);
    }

    let withdrawalDocData = null;
    let transactionDocData = null;
    let userProfileData = {};

    // 7. Atomic Balance Check & Deduction via Wallet Service
    try {
      const walletRes = await walletService.withdraw(
        resolvedUserId,
        numAmount,
        {
          withdrawalId,
          network: netUpper,
          destinationAddress: resolvedAddress,
          description: `Withdrawal Request: ${numAmount} USDT to ${resolvedAddress}`
        },
        idempotencyKey || `wd_${withdrawalId}`,
        db
      );

      const currentBalance = walletRes.balanceBefore;
      const updatedBalance = walletRes.balanceAfter;

      const playerRef = doc(db, 'players', resolvedUserId);
      const playerSnap = await getDoc(playerRef);
      const playerData = playerSnap.exists() ? playerSnap.data() : {};
      userProfileData = playerData;

      // Risk Score Evaluation
      const riskEvaluation = evaluateWithdrawalRisk({
        amount: numAmount,
        currentBalance,
        userCreatedAt: playerData.createdAt || timestampNow
      });

      // Fee calculations
      let networkFee = 1.0;
      if (netUpper.includes('BEP20')) networkFee = 0.5;
      if (netUpper.includes('ERC20')) networkFee = 5.0;
      const finalAmount = Math.max(0, numAmount - networkFee);

      const initialStatus = 'pending';

      // Construct Withdrawal Document
      withdrawalDocData = {
        id: withdrawalId,
        withdrawalId: withdrawalId,
        userId: resolvedUserId,
        playerId: resolvedUserId,
        playerName: playerData.name || playerData.username || resolvedUserId,
        amount: numAmount,
        network: netUpper,
        blockchain: netUpper,
        method: netUpper,
        details: `USDT Withdrawal to ${resolvedAddress}`,
        walletAddress: resolvedAddress,
        withdrawalAddress: resolvedAddress,
        destinationAddress: resolvedAddress,
        status: initialStatus,
        createdAt: timestampNow,
        updatedAt: timestampNow,
        timestamp: timestampNow,
        processedAt: null,
        playerBalanceAtRequest: currentBalance,
        balanceBefore: currentBalance,
        balanceAfter: updatedBalance,
        fee: networkFee,
        finalAmount: finalAmount,
        transactionHash: '',
        blockchainTxHash: '',
        riskScore: riskEvaluation.riskScore,
        riskFlags: riskEvaluation.flags,
        requiresManualApproval: riskEvaluation.requiresManualApproval,
        idempotencyKey: idempotencyKey || withdrawalId,
        preferredCurrency: preferredCurrency || 'USD',
        exchangeRate: exchangeRate ? Number(exchangeRate) : 1.0,
        preferredAmount: preferredAmount ? Number(preferredAmount) : numAmount,
        settlementCurrency: settlementCurrency || 'USDT'
      };

      const withdrawalRef = doc(db, 'withdrawals', withdrawalId);
      await setDoc(withdrawalRef, withdrawalDocData);

        // Construct Transaction Ledger Document
        transactionDocData = {
          id: txnId,
          transactionId: txnId,
          withdrawalId: withdrawalId,
          userId: resolvedUserId,
          playerId: resolvedUserId,
          type: 'withdrawal',
          amount: numAmount,
          network: netUpper,
          destinationAddress: resolvedAddress,
          balanceBefore: currentBalance,
          balanceAfter: updatedBalance,
          blockchainTxHash: '',
          status: initialStatus,
          createdAt: timestampNow,
          processedAt: null,
          timestamp: timestampNow,
          referenceId: withdrawalId
        };

        const txnDocRef = doc(db, 'transactions', txnId);
        await setDoc(txnDocRef, transactionDocData);

        // Record Audit Log Entry
        const auditLogId = `AUD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        const auditDocRef = doc(db, 'auditLogs', auditLogId);
        await setDoc(auditDocRef, {
          logId: auditLogId,
          transactionId: txnId,
          withdrawalId: withdrawalId,
          userId: resolvedUserId,
          action: 'withdrawal_created',
          module: 'withdrawal',
          oldValue: currentBalance.toFixed(4),
          newValue: updatedBalance.toFixed(4),
          riskScore: riskEvaluation.riskScore,
          ipAddress: ip,
          timestamp: timestampNow
        });

    } catch (txError) {
      const errMsg = txError.message || String(txError);

      if (errMsg.includes('IDEMPOTENCY_EXISTS')) {
        return {
          statusCode: 409,
          body: { success: false, error: "Duplicate request. Withdrawal ID already exists.", errorCode: "IDEMPOTENCY_CONFLICT" }
        };
      }

      if (errMsg.includes('INSUFFICIENT_FUNDS')) {
        return {
          statusCode: 400,
          body: { success: false, error: "Insufficient wallet balance for this withdrawal.", errorCode: "INSUFFICIENT_FUNDS" }
        };
      }

      await logSecurityEvent(db, {
        type: 'WITHDRAWAL_CREATION_FAILED',
        userId: resolvedUserId,
        message: errMsg,
        ip,
        severity: 'warning'
      });

      return {
        statusCode: 400,
        body: { success: false, error: errMsg, errorCode: "TRANSACTION_FAILED" }
      };
    }

    // 8. Auto-Withdrawal Flow Execution
    const shouldAutoProcess = autoWithdrawEnabled && (withdrawalDocData.riskScore < 50);

    if (shouldAutoProcess) {
      console.log(`[WithdrawalService] Executing auto-processing for withdrawal ${withdrawalId}...`);
      
      const withdrawalRef = doc(db, 'withdrawals', withdrawalId);
      await updateDoc(withdrawalRef, {
        status: 'processing',
        adminNotes: 'Automated hot wallet transfer initiated.',
        updatedAt: Date.now()
      });

      try {
        const txReceipt = await walletService.sendTransaction(netUpper, resolvedAddress, withdrawalDocData.finalAmount);

        if (txReceipt && txReceipt.success) {
          const nowProcessed = Date.now();
          await runTransaction(db, async (txn) => {
            txn.update(withdrawalRef, {
              status: 'completed',
              transactionHash: txReceipt.txHash,
              blockchainTxHash: txReceipt.txHash,
              processedAt: nowProcessed,
              completedAt: nowProcessed,
              completedDate: nowProcessed,
              updatedAt: nowProcessed,
              adminNotes: 'Automatically completed via Hot Wallet Service.'
            });

            const txnRef = doc(db, 'transactions', txnId);
            txn.update(txnRef, {
              status: 'completed',
              blockchainTxHash: txReceipt.txHash,
              processedAt: nowProcessed
            });

            const compAuditId = `AUD-AUT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            txn.set(doc(db, 'auditLogs', compAuditId), {
              logId: compAuditId,
              transactionId: txnId,
              withdrawalId: withdrawalId,
              userId: resolvedUserId,
              adminId: 'system_auto',
              action: 'withdrawal_automatic_completion',
              module: 'withdrawal',
              oldValue: 'processing',
              newValue: 'completed',
              ipAddress: ip,
              timestamp: nowProcessed
            });
          });

          await notifyUser(db, resolvedUserId, 'Withdrawal Completed', `Your automatic withdrawal of ${numAmount} USDT was completed. TxHash: ${txReceipt.txHash}`);

          withdrawalDocData.status = 'completed';
          withdrawalDocData.blockchainTxHash = txReceipt.txHash;
          withdrawalDocData.transactionHash = txReceipt.txHash;
          withdrawalDocData.processedAt = nowProcessed;
        } else {
          throw new Error("Hot wallet transfer completed without valid txHash.");
        }

      } catch (broadcastErr) {
        console.error(`[WithdrawalService] Hot wallet transfer error:`, broadcastErr.message);

        // Auto refund on failure
        const nowFailed = Date.now();
        await walletService.deposit(
          resolvedUserId,
          numAmount,
          {
            withdrawalId,
            reason: `Auto transfer failed: ${broadcastErr.message || 'Network error'}`,
            source: 'withdrawal_auto_refund',
            description: `Withdrawal Refund: ${numAmount} USDT (Auto Transfer Failed)`
          },
          `wd_auto_refund_${withdrawalId}`,
          db
        );

        await updateDoc(withdrawalRef, {
          status: 'failed',
          adminNotes: `Auto transfer failed: ${broadcastErr.message || 'Network error'}. Balance refunded.`,
          processedAt: nowFailed,
          updatedAt: nowFailed
        });

        const txnRef = doc(db, 'transactions', txnId);
        const txnSnap = await getDoc(txnRef);
        if (txnSnap.exists()) {
          await updateDoc(txnRef, {
            status: 'failed',
            processedAt: nowFailed
          });
        }

        const failAuditId = `AUD-FAIL-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        await setDoc(doc(db, 'auditLogs', failAuditId), {
          logId: failAuditId,
          transactionId: txnId,
          withdrawalId: withdrawalId,
          userId: resolvedUserId,
          adminId: 'system_auto',
          action: 'withdrawal_failed_refund',
          module: 'withdrawal',
          oldValue: 'processing',
          newValue: 'failed',
          ipAddress: ip,
          timestamp: nowFailed
        });

        await notifyUser(db, resolvedUserId, 'Withdrawal Failed & Refunded', `Your withdrawal of ${numAmount} USDT failed: ${broadcastErr.message || 'Network error'}. Balance refunded.`);

        withdrawalDocData.status = 'failed';
        withdrawalDocData.processedAt = nowFailed;
      }
    } else {
      await notifyUser(db, resolvedUserId, 'Withdrawal Pending Review', `Your withdrawal request of ${numAmount} USDT has been submitted and is currently pending security review.`);
    }

    return {
      statusCode: 200,
      body: {
        success: true,
        message: withdrawalDocData.status === 'completed'
          ? "Automatic withdrawal processed successfully."
          : "Withdrawal request submitted successfully.",
        withdrawal: withdrawalDocData,
        transaction: transactionDocData
      }
    };
  },

  /**
   * Admin / Automated processing of an existing withdrawal request.
   * Actions: 'approve', 'reject', 'complete', 'retry', 'cancel'
   */
  async processWithdrawal(db, options = {}) {
    const { 
      withdrawalId, 
      action, 
      notes = '', 
      transactionHash = '', 
      adminId = 'Admin', 
      adminRole = 'Super Admin', 
      ip = '127.0.0.1' 
    } = options;

    if (!withdrawalId) {
      return {
        statusCode: 400,
        body: { success: false, error: "Missing required parameter: withdrawalId.", errorCode: "MISSING_ID" }
      };
    }

    if (!['approve', 'reject', 'complete', 'retry', 'cancel'].includes(action)) {
      return {
        statusCode: 400,
        body: { success: false, error: `Invalid action '${action}'. Supported actions: approve, reject, complete, retry, cancel.`, errorCode: "INVALID_ACTION" }
      };
    }

    // Role-based Access Control Check
    if (adminRole === 'Support') {
      await logSecurityEvent(db, {
        type: 'UNAUTHORIZED_ADMIN_ACTION',
        userId: adminId,
        message: `Support role attempted to perform financial action '${action}' on withdrawal ${withdrawalId}`,
        ip,
        severity: 'warning'
      });
      return {
        statusCode: 403,
        body: { success: false, error: "Forbidden: Support role does not have financial execution permissions.", errorCode: "FORBIDDEN" }
      };
    }

    const withdrawalRef = doc(db, 'withdrawals', withdrawalId);
    const withdrawalSnap = await getDoc(withdrawalRef);

    if (!withdrawalSnap.exists()) {
      return {
        statusCode: 404,
        body: { success: false, error: `Withdrawal request '${withdrawalId}' not found.`, errorCode: "NOT_FOUND" }
      };
    }

    const withdrawal = withdrawalSnap.data();
    const resolvedUserId = withdrawal.userId || withdrawal.playerId;
    const txnId = 'TXN-' + withdrawalId.replace(/[^a-zA-Z0-9-]/g, '');
    const txnRef = doc(db, 'transactions', txnId);

    // Terminal State Protection
    const isTerminal = ['completed', 'rejected'].includes(withdrawal.status);
    if (isTerminal && action !== 'retry') {
      return {
        statusCode: 400,
        body: { success: false, error: `Withdrawal '${withdrawalId}' is already in terminal state '${withdrawal.status}'.`, errorCode: "ALREADY_TERMINAL" }
      };
    }

    // A. Handle REJECT / CANCEL Action (Atomic Refund)
    if (action === 'reject' || action === 'cancel') {
      const newStatus = action === 'reject' ? 'rejected' : 'cancelled';
      const nowTs = Date.now();
      let prevStatus = 'pending';

      try {
        await runTransaction(db, async (txn) => {
          const freshSnap = await txn.get(withdrawalRef);
          if (!freshSnap.exists()) {
            throw new Error('WITHDRAWAL_NOT_FOUND');
          }
          const freshData = freshSnap.data();
          prevStatus = freshData.status || 'pending';

          if (['rejected', 'cancelled', 'completed'].includes(freshData.status)) {
            throw new Error(`ALREADY_TERMINAL_${freshData.status}`);
          }

          txn.update(withdrawalRef, {
            status: newStatus,
            adminNotes: notes || `Withdrawal ${newStatus} by ${adminId}. Balance refunded.`,
            processedAt: nowTs,
            updatedAt: nowTs
          });

          const txnSnap = await txn.get(txnRef);
          if (txnSnap.exists()) {
            txn.update(txnRef, {
              status: newStatus,
              processedAt: nowTs
            });
          }
        });
      } catch (txErr) {
        const errStr = txErr.message || '';
        if (errStr.startsWith('ALREADY_TERMINAL_')) {
          const existingStatus = errStr.replace('ALREADY_TERMINAL_', '');
          return {
            statusCode: 200,
            body: { success: true, message: `Withdrawal is already in terminal state '${existingStatus}'. No action taken.`, alreadyProcessed: true }
          };
        }
        throw txErr;
      }

      // Execute refund through walletService ONLY after status update was locked in transaction
      const refundAttemptId = `wd_refund_${withdrawalId}_${nowTs}`;
      await walletService.deposit(
        resolvedUserId,
        Number(withdrawal.amount),
        {
          withdrawalId,
          reason: notes || `Withdrawal ${newStatus} by admin ${adminId}`,
          source: 'withdrawal_refund',
          description: `Withdrawal Refund: ${withdrawal.amount} USDT (${newStatus})`
        },
        refundAttemptId,
        db
      );

      // Record Audit Log
      const auditLogId = `AUD-${newStatus.toUpperCase()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      await setDoc(doc(db, 'auditLogs', auditLogId), {
        logId: auditLogId,
        transactionId: txnId,
        withdrawalId: withdrawalId,
        userId: resolvedUserId,
        adminId,
        action: `withdrawal_${newStatus}`,
        module: 'admin_withdrawal',
        oldValue: prevStatus,
        newValue: newStatus,
        ipAddress: ip,
        timestamp: nowTs
      });

      await notifyUser(db, resolvedUserId, `Withdrawal Request ${newStatus === 'rejected' ? 'Rejected' : 'Cancelled'}`, `Your withdrawal request of ${withdrawal.amount} USDT was ${newStatus}. Balance refunded.`);

      return {
        statusCode: 200,
        body: { success: true, message: `Withdrawal successfully ${newStatus} and user balance refunded.` }
      };
    }

    // B. Handle MANUAL COMPLETE Action
    if (action === 'complete') {
      const nowTs = Date.now();
      const finalTxHash = transactionHash || withdrawal.blockchainTxHash || withdrawal.transactionHash || 'Manual Override';

      await runTransaction(db, async (txn) => {
        txn.update(withdrawalRef, {
          status: 'completed',
          blockchainTxHash: finalTxHash,
          transactionHash: finalTxHash,
          adminNotes: notes || `Manually marked as completed by ${adminId}.`,
          processedAt: nowTs,
          completedAt: nowTs,
          completedDate: nowTs,
          updatedAt: nowTs
        });

        txn.update(txnRef, {
          status: 'completed',
          blockchainTxHash: finalTxHash,
          processedAt: nowTs
        });

        const auditLogId = `AUD-MAN-COM-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        txn.set(doc(db, 'auditLogs', auditLogId), {
          logId: auditLogId,
          transactionId: txnId,
          withdrawalId: withdrawalId,
          userId: resolvedUserId,
          adminId,
          action: 'withdrawal_manual_completion',
          module: 'admin_withdrawal',
          oldValue: withdrawal.status,
          newValue: 'completed',
          ipAddress: ip,
          timestamp: nowTs
        });
      });

      await notifyUser(db, resolvedUserId, 'Withdrawal Completed', `Your withdrawal request of ${withdrawal.amount} USDT has been completed.`);

      return {
        statusCode: 200,
        body: { success: true, message: "Withdrawal marked as completed manually." }
      };
    }

    // C. Handle APPROVE / RETRY Action (Hot Wallet Transfer)
    if (action === 'approve' || action === 'retry') {
      const nowProcessing = Date.now();

      // Transition to 'processing'
      await runTransaction(db, async (txn) => {
        txn.update(withdrawalRef, {
          status: 'processing',
          adminNotes: notes || `Hot wallet transfer initiated by ${adminId}...`,
          processedAt: nowProcessing,
          updatedAt: nowProcessing
        });

        txn.update(txnRef, {
          status: 'processing',
          processedAt: nowProcessing
        });

        const auditLogId = `AUD-PROC-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        txn.set(doc(db, 'auditLogs', auditLogId), {
          logId: auditLogId,
          transactionId: txnId,
          withdrawalId: withdrawalId,
          userId: resolvedUserId,
          adminId,
          action: 'withdrawal_processing_start',
          module: 'admin_withdrawal',
          oldValue: withdrawal.status,
          newValue: 'processing',
          ipAddress: ip,
          timestamp: nowProcessing
        });
      });

      try {
        const netToUse = withdrawal.network || withdrawal.blockchain || 'TRC20';
        const destAddress = withdrawal.walletAddress || withdrawal.withdrawalAddress || withdrawal.destinationAddress;
        const amountToSend = withdrawal.finalAmount || withdrawal.amount;

        const txReceipt = await walletService.sendTransaction(netToUse, destAddress, amountToSend);

        if (txReceipt && txReceipt.success) {
          const nowComp = Date.now();

          await runTransaction(db, async (txn) => {
            txn.update(withdrawalRef, {
              status: 'completed',
              blockchainTxHash: txReceipt.txHash,
              transactionHash: txReceipt.txHash,
              adminNotes: notes || 'Successfully processed via Hot Wallet Service.',
              processedAt: nowComp,
              completedAt: nowComp,
              completedDate: nowComp,
              updatedAt: nowComp
            });

            txn.update(txnRef, {
              status: 'completed',
              blockchainTxHash: txReceipt.txHash,
              processedAt: nowComp
            });

            const auditLogId = `AUD-AUT-COMP-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            txn.set(doc(db, 'auditLogs', auditLogId), {
              logId: auditLogId,
              transactionId: txnId,
              withdrawalId: withdrawalId,
              userId: resolvedUserId,
              adminId,
              action: 'withdrawal_approval_completion',
              module: 'admin_withdrawal',
              oldValue: 'processing',
              newValue: 'completed',
              ipAddress: ip,
              timestamp: nowComp
            });
          });

          await notifyUser(db, resolvedUserId, 'Withdrawal Completed', `Your withdrawal of ${withdrawal.amount} USDT was completed. TxHash: ${txReceipt.txHash}`);

          return {
            statusCode: 200,
            body: { success: true, message: "Hot wallet transfer completed successfully.", txHash: txReceipt.txHash }
          };
        } else {
          throw new Error("Hot wallet service did not return a valid success receipt.");
        }

      } catch (broadcastErr) {
        console.error(`[WithdrawalService] Hot wallet transfer failed:`, broadcastErr.message);

        const nowFail = Date.now();
        await walletService.deposit(
          resolvedUserId,
          Number(withdrawal.amount),
          {
            withdrawalId,
            reason: `Hot wallet transfer failed: ${broadcastErr.message || 'Node error'}`,
            source: 'withdrawal_auto_refund',
            description: `Withdrawal Refund: ${withdrawal.amount} USDT (Transfer Failed)`
          },
          `wd_auto_refund_${withdrawalId}`,
          db
        );

        await updateDoc(withdrawalRef, {
          status: 'failed',
          adminNotes: `Hot wallet transfer failed: ${broadcastErr.message || 'Node error'}. Balance refunded.`,
          processedAt: nowFail,
          updatedAt: nowFail
        });

        const txnSnap = await getDoc(txnRef);
        if (txnSnap.exists()) {
          await updateDoc(txnRef, {
            status: 'failed',
            processedAt: nowFail
          });
        }

        const auditLogId = `AUD-FAIL-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        await setDoc(doc(db, 'auditLogs', auditLogId), {
          logId: auditLogId,
          transactionId: txnId,
          withdrawalId: withdrawalId,
          userId: resolvedUserId,
          adminId,
          action: 'withdrawal_transfer_failed',
          module: 'admin_withdrawal',
          oldValue: 'processing',
          newValue: 'failed',
          ipAddress: ip,
          timestamp: nowFail
        });

        await notifyUser(db, resolvedUserId, 'Withdrawal Failed & Refunded', `Your withdrawal of ${withdrawal.amount} USDT failed: ${broadcastErr.message || 'Network error'}. Balance refunded.`);

        return {
          statusCode: 400,
          body: { success: false, error: `Hot wallet transfer failed: ${broadcastErr.message || 'Unknown network error'}. User balance refunded.` }
        };
      }
    }

    return {
      statusCode: 400,
      body: { success: false, error: `Unsupported action '${action}'.`, errorCode: "UNSUPPORTED_ACTION" }
    };
  }
};
