import { initializeApp } from 'firebase/app';
import { initializeAuth, GoogleAuthProvider, signInWithPopup, signOut, browserLocalPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';

// Support loading Firebase config from environment variables (useful for Vercel deployments)
// with a fallback to the committed firebase-applet-config.json values.
const env = (import.meta as any).env || {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || firebaseConfigJson.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigJson.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || firebaseConfigJson.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJson.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJson.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || firebaseConfigJson.appId,
  firestoreDatabaseId: env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || firebaseConfigJson.firestoreDatabaseId,
};

const app = initializeApp(firebaseConfig);

// Improved Firestore initialization with auto-detect long-polling and multi-tab persistent offline cache
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseConfig.firestoreDatabaseId);

// Use initializeAuth with explicit persistence and resolver for better iframe compatibility
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});

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
      const snap = await getDocFromServer(doc(db, 'test', 'connection'));
      console.log("[Firebase Info] Connection test successful. Remote server reached:", snap.exists());
    } catch (error: any) {
      const isUnavailable = error.code === 'unavailable' || (error.message && error.message.toLowerCase().includes('unavailable')) || (error.message && error.message.toLowerCase().includes('could not reach'));
      if (isUnavailable) {
        console.warn("[Firebase Info] Firestore backend is temporarily unreachable. Client is operating seamlessly in OFFLINE/CACHE mode and will auto-sync with the cloud.");
      } else {
        console.error("[Firebase Error] Connection test failed:", error.message, error.code);
        if (error.message && error.message.includes('the client is offline')) {
          console.warn("[Firebase Info] Please verify your network and Firebase configuration.");
        }
      }
      
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('quota') || msg.includes('resource-exhausted') || msg.includes('limit exceeded')) {
        if (typeof window !== 'undefined') {
          (window as any).__firestoreQuotaExceeded = true;
          window.dispatchEvent(new CustomEvent('firestore-quota-exceeded', { detail: { error: error.message } }));
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  if (typeof window !== 'undefined') {
    const msg = errInfo.error.toLowerCase();
    if (msg.includes('quota') || msg.includes('resource-exhausted') || msg.includes('resource_exhausted') || msg.includes('limit exceeded')) {
      (window as any).__firestoreQuotaExceeded = true;
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded', { detail: errInfo }));
    }
  }

  throw new Error(JSON.stringify(errInfo));
}
