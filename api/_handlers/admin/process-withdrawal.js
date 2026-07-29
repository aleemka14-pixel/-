import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { withdrawalService } from '../../../backend/services/withdrawal-service.js';

let firebaseConfig;
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.warn('[Admin Process Withdrawal] Config read warning:', e.message);
}

if (!firebaseConfig) {
  firebaseConfig = {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0100195413',
    appId: process.env.VITE_FIREBASE_APP_ID || '1:996872918053:web:2511101fd327cf9f7e1bcc',
    apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyCl-J4tP32LvcMtExXC_c84fqbTr6VdFs0',
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'gen-lang-client-0100195413.firebaseapp.com',
    firestoreDatabaseId: process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || 'ai-studio-8036f1f6-5204-4076-9a49-fc8a3d7ebda4',
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0100195413.firebasestorage.app',
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '996872918053'
  };
}

let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const dbId = firebaseConfig.firestoreDatabaseId || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;
const db = dbId ? getFirestore(app, dbId) : getFirestore(app);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
