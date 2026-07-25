import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { withdrawalService } from '../backend/services/withdrawal-service.js';

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
 * API Endpoint: POST /api/create-withdraw (or /api/create-withdrawal)
 * Production-ready automatic crypto/fiat withdrawal endpoint.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      success: false,
      error: `Method ${req.method} Not Allowed. Only POST is supported.`,
      errorCode: "METHOD_NOT_ALLOWED"
    });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

  try {
    const result = await withdrawalService.createWithdrawal(db, req.body, ip);
    return res.status(result.statusCode).json(result.body);
  } catch (error) {
    console.error("[Withdrawal API] Critical unhandled error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal Server Error during withdrawal creation.",
      errorCode: "SERVER_ERROR"
    });
  }
}
