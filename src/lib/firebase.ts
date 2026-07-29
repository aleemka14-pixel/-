import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getAuth, GoogleAuthProvider, signInWithPopup, signOut, browserLocalPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import { initializeFirestore, getFirestore, doc, getDoc, getDocFromServer, persistentLocalCache, persistentMultipleTabManager, setLogLevel } from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';

// Support loading Firebase config from environment variables (useful for Vercel deployments)
// with a fallback to the committed firebase-applet-config.json values.
const env = (import.meta as any).env || {};

const targetDbId = (env.VITE_FIREBASE_FIRESTORE_DATABASE_ID && env.VITE_FIREBASE_FIRESTORE_DATABASE_ID !== '(default)' && env.VITE_FIREBASE_FIRESTORE_DATABASE_ID.trim() !== '') 
  ? env.VITE_FIREBASE_FIRESTORE_DATABASE_ID 
  : (firebaseConfigJson.firestoreDatabaseId || 'ai-studio-8036f1f6-5204-4076-9a49-fc8a3d7ebda4');

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || firebaseConfigJson.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigJson.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || firebaseConfigJson.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJson.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJson.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || firebaseConfigJson.appId,
  firestoreDatabaseId: targetDbId,
};

console.log('[PRODUCTION DIAGNOSTICS 1] Firebase Project ID:', firebaseConfig.projectId);
console.log('[PRODUCTION DIAGNOSTICS 5] Config check:', {
  projectId: firebaseConfig.projectId,
  firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
  authDomain: firebaseConfig.authDomain,
  hasApiKey: Boolean(firebaseConfig.apiKey),
  rawEnvDbId: env.VITE_FIREBASE_FIRESTORE_DATABASE_ID,
  rawConfigJsonDbId: firebaseConfigJson.firestoreDatabaseId,
});

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Set log level to 'error' to suppress harmless gRPC stream disconnection warnings
try {
  setLogLevel('error');
} catch (e) {
  // Ignored
}

// Resilient Firestore initialization with fallback to standard getFirestore if persistent cache is blocked in iframe/cross-origin
let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  }, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  console.warn('[Firebase Info] Fallback to standard Firestore instance:', e);
  dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}
export const db = dbInstance;

// Resilient Auth initialization
let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: browserLocalPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
} catch (e) {
  authInstance = getAuth(app);
}
export const auth = authInstance;

export const googleProvider = new GoogleAuthProvider();

let isLoginInProgress = false;

export async function loginWithGoogle() {
  if (isLoginInProgress) {
    console.warn("Login already in progress, skipping duplicate request.");
    return null;
  }
  
  isLoginInProgress = true;
  try {
    const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    return result.user;
  } catch (error: any) {
    if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
      console.warn('Login popup closed by user or cancelled.');
      return null;
    }
    console.error('Login Error:', error);
    throw error;
  } finally {
    isLoginInProgress = false;
  }
}

export async function logout() {
  await signOut(auth);
}

// Critical connection test (Deferred and made connection-resilient)
async function testConnection() {
  setTimeout(async () => {
    try {
      const snap = await getDoc(doc(db, 'test', 'connection'));
      console.log("[Firebase Info] Connection test successful. Remote server reached:", snap.exists());
    } catch (error: any) {
      const msg = String(error?.message || '').toLowerCase();
      const isQuota = msg.includes('quota') || msg.includes('resource-exhausted') || msg.includes('limit exceeded');
      
      if (isQuota) {
        console.info("[Firebase Info] Connection test info: Quota limit exceeded. Client will operate in DEMO/OFFLINE mode.");
        if (typeof window !== 'undefined') {
          (window as any).__firestoreQuotaExceeded = true;
          window.dispatchEvent(new CustomEvent('firestore-quota-exceeded', { detail: { error: error?.message } }));
        }
      } else {
        const isUnavailable = error?.code === 'unavailable' || msg.includes('unavailable') || msg.includes('could not reach');
        if (isUnavailable) {
          console.info("[Firebase Info] Firestore backend is temporarily unreachable. Client operating in OFFLINE/CACHE mode.");
        } else {
          console.info("[Firebase Info] Connection test info:", error?.message || error);
        }
      }
    }
  }, 1500); // Small delay to prioritize main thread loading
}
testConnection();

// Error handler for Firestore
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  const msg = errInfo.error.toLowerCase();
  const isQuota = msg.includes('quota') || msg.includes('resource-exhausted') || msg.includes('resource_exhausted') || msg.includes('limit exceeded');
  
  if (isQuota) {
    console.info('[Firebase Info] Quota limit exceeded. Client operating in demo/offline mode.');
    if (typeof window !== 'undefined') {
      (window as any).__firestoreQuotaExceeded = true;
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded', { detail: errInfo }));
    }
    return;
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }

  throw new Error(errInfo.error);
}
