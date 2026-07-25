import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { withdrawalService } from '../../backend/services/withdrawal-service.js';

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
 * Securely processes pending/processing/failed/cancelled withdrawals.
 * Actions supported: 'approve', 'reject', 'complete', 'retry', 'cancel'
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} Not Allowed`,
      errorCode: "METHOD_NOT_ALLOWED"
    });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

  try {
    const { withdrawalId, action, notes, transactionHash, adminId, adminRole } = req.body;

    const result = await withdrawalService.processWithdrawal(db, {
      withdrawalId,
      action,
      notes,
      transactionHash,
      adminId,
      adminRole,
      ip
    });

    return res.status(result.statusCode).json(result.body);

  } catch (error) {
    console.error("CRITICAL: Error during admin process-withdrawal handler:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error during withdrawal administrative processing.",
      errorCode: "SERVER_ERROR"
    });
  }
}
