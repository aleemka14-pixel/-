import createDepositHandler from './_handlers/create-deposit.js';
import createPaymentHandler from './_handlers/create-payment.js';
import createWithdrawHandler from './_handlers/create-withdraw.js';
import healthHandler from './_handlers/health.js';
import paymentWebhookHandler from './_handlers/payment-webhook.js';
import webhookHandler from './_handlers/webhook.js';

import adminPaymentsHandler from './_handlers/admin/payments.js';
import adminProcessWithdrawalHandler from './_handlers/admin/process-withdrawal.js';
import adminSystemHealthHandler from './_handlers/admin/system-health.js';
import adminTriggerJobHandler from './_handlers/admin/trigger-job.js';
import adminVerifyAuthHandler from './_handlers/admin/verify-auth.js';
import adminWalletIntegrityHandler from './_handlers/admin/wallet-integrity.js';
import adminWalletStatusHandler from './_handlers/admin/wallet-status.js';
import adminWalletAdjustHandler from './_handlers/admin/wallet/adjust.js';
import adminWalletDepositHandler from './_handlers/admin/wallet/deposit.js';
import adminWalletWithdrawHandler from './_handlers/admin/wallet/withdraw.js';

import walletDepositHandler from './_handlers/wallet/deposit.js';
import walletTransactionHandler from './_handlers/wallet/transaction.js';
import walletWithdrawHandler from './_handlers/wallet/withdraw.js';

import aviatorPlaceBetHandler from './_handlers/aviator/place-bet.js';
import aviatorCashoutHandler from './_handlers/aviator/cashout.js';
import aviatorCancelBetHandler from './_handlers/aviator/cancel-bet.js';
import aviatorStateHandler from './_handlers/aviator/state.js';

const routes = {
  '/api/create-deposit': createDepositHandler,
  '/api/create-payment': createPaymentHandler,
  '/api/create-withdraw': createWithdrawHandler,
  '/api/create-withdrawal': createWithdrawHandler,
  '/api/health': healthHandler,
  '/api/payment-webhook': paymentWebhookHandler,
  '/api/webhook': webhookHandler,

  '/api/admin/payments': adminPaymentsHandler,
  '/api/admin/process-withdrawal': adminProcessWithdrawalHandler,
  '/api/admin/system-health': adminSystemHealthHandler,
  '/api/admin/trigger-job': adminTriggerJobHandler,
  '/api/admin/verify-auth': adminVerifyAuthHandler,
  '/api/admin/wallet-integrity': adminWalletIntegrityHandler,
  '/api/admin/wallet-status': adminWalletStatusHandler,
  '/api/admin/wallet/adjust': adminWalletAdjustHandler,
  '/api/admin/wallet/deposit': adminWalletDepositHandler,
  '/api/admin/wallet/withdraw': adminWalletWithdrawHandler,

  '/api/wallet/deposit': walletDepositHandler,
  '/api/wallet/transaction': walletTransactionHandler,
  '/api/wallet/withdraw': walletWithdrawHandler,

  '/api/aviator/place-bet': aviatorPlaceBetHandler,
  '/api/aviator/cashout': aviatorCashoutHandler,
  '/api/aviator/cancel-bet': aviatorCancelBetHandler,
  '/api/aviator/state': aviatorStateHandler,
};

/**
 * Central Vercel Serverless Gateway Router
 * Consolidates all backend API routes under 1 serverless function to prevent Vercel Hobby tier function limit errors.
 */
export default async function handler(req, res) {
  const rawUrl = req.url || '/api';
  const urlObj = new URL(rawUrl, 'http://localhost');
  let pathname = urlObj.pathname;

  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  if (pathname.endsWith('.js')) {
    pathname = pathname.slice(0, -3);
  }

  const routeHandler = routes[pathname];

  if (routeHandler) {
    return await routeHandler(req, res);
  }

  if (pathname === '/api' || pathname === '') {
    return res.status(200).json({
      status: 'online',
      gateway: 'Centralized Serverless API Gateway',
      timestamp: Date.now()
    });
  }

  return res.status(404).json({
    success: false,
    error: `API Route '${pathname}' not found.`,
    errorCode: 'NOT_FOUND'
  });
}
