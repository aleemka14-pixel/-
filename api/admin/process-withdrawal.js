import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, runTransaction } from 'firebase/firestore';
import { walletService } from '../../backend/services/wallet-service.js';
import { ledgerService } from '../../backend/services/ledger-service.js';

// Initialize Firebase App
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
 * Serverless API Endpoint: POST /api/admin/process-withdrawal
 * 
 * Securely processes a pending crypto withdrawal.
 * Handles:
 * - Admin Approve (Triggers Wallet Service automatic USDT transfer -> 'processing' -> 'completed' + records txHash)
 * - Admin Reject (Refunds user balance -> 'rejected')
 * - Admin Mark as Completed (Manual override -> 'completed')
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { withdrawalId, action, notes, transactionHash, adminRole = 'Super Admin', adminId = 'Admin' } = req.body;

    if (!withdrawalId) {
      return res.status(400).json({ success: false, error: "Missing withdrawalId." });
    }

    // Role-based Access Control Check
    if (adminRole === 'Support') {
      return res.status(403).json({
        success: false,
        error: "Forbidden: Support role does not have permission to modify financial states."
      });
    }

    const withdrawalRef = doc(db, 'withdrawals', withdrawalId);
    const withdrawalSnap = await getDoc(withdrawalRef);

    if (!withdrawalSnap.exists()) {
      return res.status(404).json({ success: false, error: "Withdrawal request not found." });
    }

    const withdrawal = withdrawalSnap.data();

    // Prevent re-processing already completed or terminal states
    if (['completed', 'rejected', 'failed'].includes(withdrawal.status)) {
      return res.status(400).json({
        success: false,
        error: `This withdrawal request is already in a terminal state: '${withdrawal.status}'.`
      });
    }

    // A. Handle REJECT action (Refund player balance and mark as rejected)
    if (action === 'reject') {
      await runTransaction(db, async (transaction) => {
        const freshWithdrawalSnap = await transaction.get(withdrawalRef);
        const freshW = freshWithdrawalSnap.data();
        if (freshW.status === 'rejected') return;

        // Perform Ledger refund
        await ledgerService.execute(transaction, db, {
          userId: freshW.playerId,
          type: 'win', // Refunding is logged as win (credit back)
          amount: freshW.amount,
          referenceId: `REFUND-REJ-${withdrawalId}`,
          preventDuplicates: true
        });

        transaction.update(withdrawalRef, {
          status: 'rejected',
          adminNotes: notes || 'Rejected by administrator.',
          processedAt: Date.now()
        });

        // Add Transactional Audit Log
        const logId = `AUD-REJ-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        const auditLogRef = doc(db, 'auditLogs', logId);
        transaction.set(auditLogRef, {
          logId,
          userId: freshW.playerId,
          adminId,
          action: 'withdrawal_rejection',
          module: 'admin_withdrawal',
          oldValue: freshW.status,
          newValue: 'rejected',
          ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1',
          timestamp: Date.now()
        });
      });

      return res.status(200).json({
        success: true,
        message: "Withdrawal rejected and player balance has been successfully refunded."
      });
    }

    // B. Handle MANUAL COMPLETE action
    if (action === 'complete') {
      await runTransaction(db, async (transaction) => {
        transaction.update(withdrawalRef, {
          status: 'completed',
          transactionHash: transactionHash || 'Manual Override',
          adminNotes: notes || 'Manually completed by administrator.',
          processedAt: Date.now(),
          completedDate: Date.now()
        });

        // Add Transactional Audit Log
        const logId = `AUD-COM-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        const auditLogRef = doc(db, 'auditLogs', logId);
        transaction.set(auditLogRef, {
          logId,
          userId: withdrawal.playerId,
          adminId,
          action: 'withdrawal_manual_completion',
          module: 'admin_withdrawal',
          oldValue: withdrawal.status,
          newValue: 'completed',
          ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1',
          timestamp: Date.now()
        });
      });

      return res.status(200).json({
        success: true,
        message: "Withdrawal marked as completed manually."
      });
    }

    // C. Handle APPROVE action (Automated Hot Wallet transfer: pending -> processing -> completed)
    if (action === 'approve') {
      // 1. Instantly transition status to 'processing' in database
      await runTransaction(db, async (transaction) => {
        transaction.update(withdrawalRef, {
          status: 'processing',
          adminNotes: notes || 'Processing hot wallet transfer...',
          processedAt: Date.now()
        });

        // Add Processing Audit Log
        const logId = `AUD-APP-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        const auditLogRef = doc(db, 'auditLogs', logId);
        transaction.set(auditLogRef, {
          logId,
          userId: withdrawal.playerId,
          adminId,
          action: 'withdrawal_approval',
          module: 'admin_withdrawal',
          oldValue: withdrawal.status,
          newValue: 'processing',
          ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1',
          timestamp: Date.now()
        });
      });

      try {
        // 2. Perform the actual hot wallet broadcast transfer
        const txReceipt = await walletService.sendUSDT({
          network: withdrawal.network,
          toAddress: withdrawal.walletAddress,
          amount: withdrawal.amount
        });

        if (txReceipt && txReceipt.success) {
          // 3. Complete withdrawal in database with generated txHash
          await runTransaction(db, async (transaction) => {
            transaction.update(withdrawalRef, {
              status: 'completed',
              transactionHash: txReceipt.txHash,
              adminNotes: notes || 'Successfully processed via automatic hot wallet.',
              completedDate: Date.now(),
              processedAt: Date.now()
            });

            // Also update any matching transaction log
            const txnRef = doc(db, 'transactions', withdrawalId);
            const txnSnap = await transaction.get(txnRef);
            if (txnSnap.exists()) {
              transaction.update(txnRef, {
                status: 'completed',
                transactionHash: txReceipt.txHash
              });
            }

            // Add Transactional Audit Log
            const logId = `AUD-AUT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
            const auditLogRef = doc(db, 'auditLogs', logId);
            transaction.set(auditLogRef, {
              logId,
              userId: withdrawal.playerId,
              adminId,
              action: 'withdrawal_automatic_completion',
              module: 'admin_withdrawal',
              oldValue: 'processing',
              newValue: 'completed',
              ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1',
              timestamp: Date.now()
            });
          });

          return res.status(200).json({
            success: true,
            message: "Automatic hot wallet withdrawal completed successfully.",
            txHash: txReceipt.txHash
          });
        } else {
          throw new Error("Broadcasting transaction did not return a valid success receipt.");
        }

      } catch (broadcastError) {
        console.error(`[Hot Wallet Failure] Broadcast failed for withdrawal ${withdrawalId}:`, broadcastError);

        // 4. Update status to failed and refund the player balance
        await runTransaction(db, async (transaction) => {
          await ledgerService.execute(transaction, db, {
            userId: withdrawal.playerId,
            type: 'win',
            amount: withdrawal.amount,
            referenceId: `REFUND-FAIL-${withdrawalId}`,
            preventDuplicates: true
          });

          transaction.update(withdrawalRef, {
            status: 'failed',
            adminNotes: `Automated transfer failed: ${broadcastError.message || broadcastError}. Balance refunded.`,
            processedAt: Date.now()
          });
        });

        return res.status(400).json({
          success: false,
          error: `Automated transfer failed: ${broadcastError.message || 'Unknown network error'}. User balance refunded.`
        });
      }
    }

    return res.status(400).json({ success: false, error: `Unsupported action: '${action}'.` });

  } catch (error) {
    console.error("CRITICAL: Error during admin process-withdrawal handler:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error during withdrawal administrative processing."
    });
  }
}
