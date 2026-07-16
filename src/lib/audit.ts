import { db, auth } from './firebase.ts';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export interface AuditLog {
  id?: string;
  userId?: string;
  adminId?: string;
  action: string;
  module: string;
  oldValue?: string;
  newValue?: string;
  ipAddress: string;
  timestamp: number;
}

/**
 * Audit Logging Helper
 * Writes a structured entry to the `auditLogs` Firestore collection.
 */
export async function logActivity({
  userId,
  adminId,
  action,
  module,
  oldValue,
  newValue,
  ipAddress
}: Omit<AuditLog, 'timestamp'>) {
  try {
    const currentUserId = userId || auth.currentUser?.uid || '';
    const resolvedAdminId = adminId || (auth.currentUser ? auth.currentUser.uid : undefined);

    const logData = {
      userId: currentUserId,
      adminId: resolvedAdminId || null,
      action,
      module,
      oldValue: oldValue || '',
      newValue: newValue || '',
      ipAddress: ipAddress || '127.0.0.1',
      timestamp: Date.now()
    };

    console.log('[AuditLog]', logData);
    await addDoc(collection(db, 'auditLogs'), logData);
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
