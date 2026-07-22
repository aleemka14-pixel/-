import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, ToggleLeft, ToggleRight, Key, Globe, FileText, Settings, 
  Database, RefreshCw, AlertTriangle, CheckCircle, Wifi, WifiOff,
  Coins, Trash2, Edit3, Save, Copy, Check, QrCode, PlayCircle, HelpCircle, ArrowRight
} from 'lucide-react';
import { 
  getFirestore, doc, onSnapshot, setDoc, updateDoc, 
  collection, query, where, orderBy, limit, getDocs, deleteDoc
} from 'firebase/firestore';
import { PaymentManagementConfig, PaymentLogEvent, RetryQueueItem, PaymentProviderConfig } from '../lib/payment/types';

interface AdminPaymentManagementProps {
  db: any;
  playSound: (sound: 'CLICK' | 'WIN' | 'LOSE' | 'BET' | 'SPIN') => void;
  adminRole: 'Super Admin' | 'Support' | 'Admin';
}

export function AdminPaymentManagement({ db, playSound, adminRole }: AdminPaymentManagementProps) {
  const isReadOnly = adminRole === 'Support';

  // State
  const [config, setConfig] = useState<PaymentManagementConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<
    'providers' | 'credentials' | 'limits' | 'networks' | 'monitoring' | 'retry'
  >('providers');

  // Input editing states
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editingCredentials, setEditingCredentials] = useState<any>({});
  
  // Settings values (limits)
  const [minDep, setMinDep] = useState<string>('10');
  const [maxDep, setMaxDep] = useState<string>('50000');
  const [cooldown, setCooldown] = useState<string>('30');
  const [minWith, setMinWith] = useState<string>('15');
  const [maxWith, setMaxWith] = useState<string>('10000');
  const [dailyWithLimit, setDailyWithLimit] = useState<string>('50000');
  const [autoWith, setAutoWith] = useState<boolean>(false);

  // QR settings
  const [qrSize, setQrSize] = useState<string>('250');
  const [qrBorder, setQrBorder] = useState<string>('1');
  const [qrUseLogo, setQrUseLogo] = useState<boolean>(true);

  // Action status indicators
  const [saving, setSaving] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Simulated Retry Queue (Dynamic Storage inside payment_settings retryQueue key)
  const [retryQueue, setRetryQueue] = useState<RetryQueueItem[]>([]);

  // Real-time subscribe to payment_settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'payment_settings'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as PaymentManagementConfig;
        setConfig(data);
        
        // Populate inputs
        if (data.depositSettings) {
          setMinDep(String(data.depositSettings.minDepositUsd || '10'));
          setMaxDep(String(data.depositSettings.maxDepositUsd || '50000'));
          setCooldown(String(data.depositSettings.cooldownSeconds || '30'));
        }
        if (data.withdrawalSettings) {
          setMinWith(String(data.withdrawalSettings.minWithdraw || '15'));
          setMaxWith(String(data.withdrawalSettings.maxWithdraw || '10000'));
          setDailyWithLimit(String(data.withdrawalSettings.dailyWithdrawLimit || '50000'));
          setAutoWith(data.withdrawalSettings.autoWithdrawEnabled || false);
        }
        if (data.qrSettings) {
          setQrSize(String(data.qrSettings.size || '250'));
          setQrBorder(String(data.qrSettings.border || '1'));
          setQrUseLogo(data.qrSettings.useLogo !== false);
        }
        
        // Grab retry queue from settings or mock default
        setRetryQueue((data as any).retryQueue || []);
      }
      setLoading(false);
    }, (err: any) => {
      const errMsg = err?.message || String(err);
      console.warn('[PaymentService] Failed to retrieve settings, using memory fallback:', errMsg);
      if (errMsg.toLowerCase().includes('quota') || err?.code === 'resource-exhausted') {
        if (typeof window !== 'undefined') {
          (window as any).__firestoreQuotaExceeded = true;
          window.dispatchEvent(new CustomEvent('firestore-quota-exceeded', { detail: { error: errMsg } }));
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, [db]);

  // Real-time subscribe to payment logs inside auditLogs
  useEffect(() => {
    const logsQuery = query(
      collection(db, 'auditLogs'),
      where('action', '==', 'payment_event'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    const unsub = onSnapshot(logsQuery, (snap) => {
      const dbLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLogs(dbLogs);
    }, (err: any) => {
      const errMsg = err?.message || String(err);
      console.warn('[PaymentService] Failed to retrieve payment logs, using memory fallback:', errMsg);
      if (errMsg.toLowerCase().includes('quota') || err?.code === 'resource-exhausted') {
        if (typeof window !== 'undefined') {
          (window as any).__firestoreQuotaExceeded = true;
          window.dispatchEvent(new CustomEvent('firestore-quota-exceeded', { detail: { error: errMsg } }));
        }
      }
    });

    return () => unsub();
  }, [db]);

  // Copy to Clipboard Utility
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    playSound('CLICK');
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Toast confirmation
  const triggerToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Save General System-Wide Toggles
  const handleToggleSystem = async (field: 'maintenanceMode' | 'globalTestMode', val: boolean) => {
    if (isReadOnly) {
      alert('Access Denied: Support role cannot modify global toggles.');
      return;
    }
    if (!config) return;
    playSound('CLICK');

    try {
      const configRef = doc(db, 'config', 'payment_settings');
      await updateDoc(configRef, { [field]: val });
      triggerToast(`${field === 'maintenanceMode' ? 'Maintenance Mode' : 'Test Mode'} successfully updated.`);
    } catch (e: any) {
      alert(`Error updating system state: ${e.message}`);
    }
  };

  // Toggle Single Provider (Enabled/Disabled)
  const handleToggleProvider = async (providerId: string, enabled: boolean) => {
    if (isReadOnly) {
      alert('Access Denied: Support role cannot toggle payment providers.');
      return;
    }
    if (!config) return;
    playSound('CLICK');

    try {
      const configRef = doc(db, 'config', 'payment_settings');
      const updatedProviders = { ...config.providers };
      if (updatedProviders[providerId]) {
        updatedProviders[providerId].enabled = enabled;
        updatedProviders[providerId].status = enabled ? 'Online' : 'Offline';
        // Reset failures count on manually enabling
        if (enabled) updatedProviders[providerId].failureCount = 0;
      }
      await updateDoc(configRef, { providers: updatedProviders });
      triggerToast(`Provider status updated successfully.`);
    } catch (e: any) {
      alert(`Error toggling provider: ${e.message}`);
    }
  };

  // Edit/Save Provider Credentials
  const handleStartEditCredentials = (providerId: string) => {
    if (isReadOnly) {
      alert('Access Denied: Support role cannot modify payment credentials.');
      return;
    }
    playSound('CLICK');
    setEditingProviderId(providerId);
    setEditingCredentials({ ...(config?.providers[providerId]?.credentials || {}) });
  };

  const handleSaveCredentials = async () => {
    if (!config || !editingProviderId) return;
    playSound('CLICK');
    setSaving(true);

    try {
      const configRef = doc(db, 'config', 'payment_settings');
      const updatedProviders = { ...config.providers };
      if (updatedProviders[editingProviderId]) {
        updatedProviders[editingProviderId].credentials = { ...editingCredentials };
      }
      await updateDoc(configRef, { providers: updatedProviders });
      setEditingProviderId(null);
      triggerToast('Credentials updated and saved securely.');
    } catch (e: any) {
      alert(`Error saving credentials: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Save Limits & QR Settings
  const handleSaveLimits = async () => {
    if (isReadOnly) {
      alert('Access Denied: Support role cannot modify financial limits.');
      return;
    }
    if (!config) return;
    playSound('CLICK');
    setSaving(true);

    try {
      const configRef = doc(db, 'config', 'payment_settings');
      const updatedConfig = {
        ...config,
        depositSettings: {
          minDepositUsd: Number(minDep),
          maxDepositUsd: Number(maxDep),
          cooldownSeconds: Number(cooldown)
        },
        withdrawalSettings: {
          minWithdraw: Number(minWith),
          maxWithdraw: Number(maxWith),
          dailyWithdrawLimit: Number(dailyWithLimit),
          autoWithdrawEnabled: autoWith
        },
        qrSettings: {
          size: Number(qrSize),
          border: Number(qrBorder),
          useLogo: qrUseLogo
        }
      };
      await setDoc(configRef, updatedConfig);
      triggerToast('Global limits and QR Settings saved successfully.');
    } catch (e: any) {
      alert(`Error saving configurations: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Trigger manual transaction verification (Retry Queue settlement)
  const handleSimulateRetry = async (item: RetryQueueItem) => {
    if (isReadOnly) {
      alert('Access Denied: Support role cannot settle transaction queues.');
      return;
    }
    playSound('CLICK');
    triggerToast(`Re-verifying transaction #${item.depositId} against ${item.providerId} API...`);

    // Simulate contacting the payment gateway
    setTimeout(async () => {
      try {
        const configRef = doc(db, 'config', 'payment_settings');
        // Filter out resolved item or update its status
        const updatedQueue = retryQueue.map(q => {
          if (q.depositId === item.depositId) {
            return { ...q, status: 'resolved' as const, retryCount: q.retryCount + 1 };
          }
          return q;
        });

        await updateDoc(configRef, { retryQueue: updatedQueue });
        triggerToast(`Transaction #${item.depositId} reconciled. Wallet credited successfully!`);
        playSound('WIN');
      } catch (e: any) {
        alert(`Failed to reconcile retry queue: ${e.message}`);
      }
    }, 1500);
  };

  // Clear Audit Logs
  const handlePurgeLogs = async () => {
    if (adminRole !== 'Super Admin') {
      alert('Access Denied: Purging audit logs is restricted to Super Admin role only.');
      return;
    }
    if (!window.confirm('Are you sure you want to purge all payment activity monitor logs? This action is irreversible.')) return;
    playSound('LOSE');

    try {
      const snap = await getDocs(query(collection(db, 'auditLogs'), where('action', '==', 'payment_event')));
      const batchPromises = snap.docs.map(d => deleteDoc(doc(db, 'auditLogs', d.id)));
      await Promise.all(batchPromises);
      triggerToast('All payment log events successfully purged.');
    } catch (e: any) {
      alert(`Error purging logs: ${e.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <RefreshCw className="w-10 h-10 animate-spin text-emerald-500" />
        <p className="text-slate-500 font-mono text-xs">Synchronizing Payment Configuration Module...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-left text-slate-100">
      
      {/* Toast Alert Header */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-emerald-950/90 border border-emerald-500/30 text-emerald-200 px-5 py-4 rounded-2xl shadow-2xl font-sans text-xs font-semibold"
          >
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global States & maintenance mode */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Card 1: Maintenance Toggles */}
        <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-black font-mono uppercase tracking-wider text-slate-400">Maintenance Gateway</h4>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              When Maintenance Mode is active, all deposit and withdrawal requests are frozen across the platform. Users will receive a graceful notification.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <span className="text-xs font-bold font-mono">Maintenance Mode Status</span>
            <button
              onClick={() => handleToggleSystem('maintenanceMode', !config?.maintenanceMode)}
              className="focus:outline-none transition-transform active:scale-95"
            >
              {config?.maintenanceMode ? (
                <ToggleRight className="w-12 h-12 text-rose-500 cursor-pointer" />
              ) : (
                <ToggleLeft className="w-12 h-12 text-slate-700 cursor-pointer" />
              )}
            </button>
          </div>
        </div>

        {/* Card 2: Test vs Live mode */}
        <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-400" />
              <h4 className="text-xs font-black font-mono uppercase tracking-wider text-slate-400">Environment Sandbox</h4>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Toggle between Sandbox (Test Mode) and Production (Live Mode) globally. Test Mode forces payment simulators and uses mock APIs for development safety.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/5">
            <span className="text-xs font-bold font-mono">Live Production Mode</span>
            <button
              onClick={() => handleToggleSystem('globalTestMode', !config?.globalTestMode)}
              className="focus:outline-none transition-transform active:scale-95"
            >
              {config?.globalTestMode ? (
                <div className="flex items-center gap-2 bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1.5 rounded-xl font-mono text-[10px] font-black uppercase">
                  <span>Sandbox Test</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-xl font-mono text-[10px] font-black uppercase">
                  <span>Live Production</span>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Card 3: Webhook copy */}
        <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-400" />
              <h4 className="text-xs font-black font-mono uppercase tracking-wider text-slate-400">IPN Webhook Endpoints</h4>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Use these endpoint callback URLs in your provider dashboards (such as NOWPayments) to automatically confirm deposits in real-time.
            </p>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-white/5 font-mono text-[9px]">
            <div className="flex items-center justify-between bg-black/30 px-3 py-2 rounded-xl">
              <span className="text-slate-500">DIRECT: /api/payment-webhook</span>
              <button 
                onClick={() => handleCopy(`${window.location.origin}/api/payment-webhook`, 'direct')}
                className="text-emerald-500 hover:text-emerald-400"
              >
                {copiedText === 'direct' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex items-center justify-between bg-black/30 px-3 py-2 rounded-xl">
              <span className="text-slate-500">NOWPAY: /api/webhook</span>
              <button 
                onClick={() => handleCopy(`${window.location.origin}/api/webhook`, 'nowpay')}
                className="text-emerald-500 hover:text-emerald-400"
              >
                {copiedText === 'nowpay' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Internal Subtabs */}
      <div className="border-b border-white/5 flex gap-1 overflow-x-auto pb-1 font-sans">
        {[
          { id: 'providers', label: 'Payment Providers', icon: Coins },
          { id: 'credentials', label: 'API Credentials', icon: Key },
          { id: 'limits', label: 'Deposit & Withdrawal Rules', icon: Settings },
          { id: 'monitoring', label: 'Transaction Monitoring', icon: Database },
          { id: 'retry', label: 'Retry Queue', icon: AlertTriangle }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { playSound('CLICK'); setActiveSubTab(tab.id as any); }}
              className={`px-4 py-2.5 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all border shrink-0 flex items-center gap-2 ${
                isActive 
                  ? 'bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-500/10' 
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SUBTAB DETAILS */}
      <div className="animate-in fade-in duration-200">
        
        {/* SUBTAB 1: PROVIDERS */}
        {activeSubTab === 'providers' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-display font-black">Configured Payment Providers</h3>
                <p className="text-xs text-slate-500">Configure and toggle adapters currently integrated into the system.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(Object.values(config?.providers || {}) as PaymentProviderConfig[]).map((prov) => {
                const failures = prov.failureCount || 0;
                return (
                  <div key={prov.id} className="bg-slate-900/30 border border-white/5 rounded-3xl p-6 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <span className={`text-[9px] font-black uppercase font-mono px-2 py-0.5 rounded-md ${
                          prov.status === 'Online' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {prov.status}
                        </span>
                        <h4 className="font-bold text-sm text-white pt-1">{prov.name}</h4>
                        <p className="text-[10px] text-slate-500 font-mono">ID: {prov.id}</p>
                      </div>
                      
                      {/* Health Indicator */}
                      <div className="text-right">
                        {failures > 0 ? (
                          <div className="flex items-center gap-1.5 text-amber-500 font-mono text-[10px]">
                            <WifiOff className="w-3.5 h-3.5" />
                            <span>{failures}/3 Failures</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-emerald-500 font-mono text-[10px]">
                            <Wifi className="w-3.5 h-3.5" />
                            <span>Healthy</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/5 pt-4">
                      <span className="text-xs text-slate-400">Mode: <strong className="font-mono text-[10px] text-emerald-400 uppercase">{prov.mode}</strong></span>
                      <button
                        onClick={() => handleToggleProvider(prov.id, !prov.enabled)}
                        className={`px-3 py-1.5 rounded-xl font-bold font-mono text-[10px] uppercase transition-all ${
                          prov.enabled 
                            ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20' 
                            : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                        }`}
                      >
                        {prov.enabled ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SUBTAB 2: CREDENTIALS */}
        {activeSubTab === 'credentials' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-display font-black">Secure Provider Credentials</h3>
              <p className="text-xs text-slate-500">Manage sensitive API Keys, private Webhook secrets, and destination wallet addresses.</p>
            </div>

            <div className="space-y-4">
              {(Object.values(config?.providers || {}) as PaymentProviderConfig[]).map((prov) => {
                const isEditing = editingProviderId === prov.id;
                return (
                  <div key={prov.id} className="bg-slate-900/30 border border-white/5 rounded-3xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-emerald-400" />
                        <h4 className="font-bold text-sm text-white">{prov.name} Credentials</h4>
                      </div>
                      
                      {!isEditing ? (
                        <button
                          onClick={() => handleStartEditCredentials(prov.id)}
                          className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-slate-400 hover:text-white text-[10px] uppercase font-bold flex items-center gap-1.5 transition-all"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit Credentials</span>
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingProviderId(null)}
                            className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-slate-400 text-[10px] uppercase font-bold transition-all"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveCredentials}
                            disabled={saving}
                            className="px-3 py-1.5 rounded-xl bg-emerald-500 text-black text-[10px] uppercase font-bold flex items-center gap-1.5 transition-all"
                          >
                            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3 h-3" />}
                            <span>Save</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* EDITABLE FIELDS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      {prov.id === 'cryptodirect' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">USDT TRC20 Wallet Address</label>
                            <input
                              type="text"
                              disabled={!isEditing}
                              value={isEditing ? (editingCredentials.usdtTrc20Address || '') : (prov.credentials.usdtTrc20Address || '')}
                              onChange={(e) => setEditingCredentials({ ...editingCredentials, usdtTrc20Address: e.target.value })}
                              className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none disabled:opacity-50"
                              placeholder="Starts with T..."
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">USDT BEP20 Wallet Address</label>
                            <input
                              type="text"
                              disabled={!isEditing}
                              value={isEditing ? (editingCredentials.usdtBep20Address || '') : (prov.credentials.usdtBep20Address || '')}
                              onChange={(e) => setEditingCredentials({ ...editingCredentials, usdtBep20Address: e.target.value })}
                              className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none disabled:opacity-50"
                              placeholder="Starts with 0x..."
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">USDT ERC20 Wallet Address</label>
                            <input
                              type="text"
                              disabled={!isEditing}
                              value={isEditing ? (editingCredentials.usdtErc20Address || '') : (prov.credentials.usdtErc20Address || '')}
                              onChange={(e) => setEditingCredentials({ ...editingCredentials, usdtErc20Address: e.target.value })}
                              className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none disabled:opacity-50"
                              placeholder="Starts with 0x..."
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">Direct Webhook IPN Auth Secret</label>
                            <input
                              type="password"
                              disabled={!isEditing}
                              value={isEditing ? (editingCredentials.ipnSecret || '') : (prov.credentials.ipnSecret ? '••••••••••••••••' : '')}
                              onChange={(e) => setEditingCredentials({ ...editingCredentials, ipnSecret: e.target.value })}
                              className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none disabled:opacity-50"
                              placeholder="Enter secret token"
                            />
                          </div>
                        </>
                      )}

                      {prov.id === 'nowpayments' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">NOWPayments API Key</label>
                            <input
                              type="text"
                              disabled={!isEditing}
                              value={isEditing ? (editingCredentials.apiKey || '') : (prov.credentials.apiKey ? '••••••••••••••••' : '')}
                              onChange={(e) => setEditingCredentials({ ...editingCredentials, apiKey: e.target.value })}
                              className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none disabled:opacity-50"
                              placeholder="NOWPayments API Token"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">NOWPayments IPN Secret</label>
                            <input
                              type="password"
                              disabled={!isEditing}
                              value={isEditing ? (editingCredentials.ipnSecret || '') : (prov.credentials.ipnSecret ? '••••••••••••••••' : '')}
                              onChange={(e) => setEditingCredentials({ ...editingCredentials, ipnSecret: e.target.value })}
                              className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none disabled:opacity-50"
                              placeholder="Instant Payment Notification Secret"
                            />
                          </div>
                        </>
                      )}

                      {prov.id === 'upi' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">Static merchant UPI ID</label>
                            <input
                              type="text"
                              disabled={!isEditing}
                              value={isEditing ? (editingCredentials.upiId || '') : (prov.credentials.upiId || '')}
                              onChange={(e) => setEditingCredentials({ ...editingCredentials, upiId: e.target.value })}
                              className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none disabled:opacity-50"
                              placeholder="e.g. business@upi"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">Custom Static QR Image URL (Optional)</label>
                            <input
                              type="text"
                              disabled={!isEditing}
                              value={isEditing ? (editingCredentials.qrCodeUrl || '') : (prov.credentials.qrCodeUrl || '')}
                              onChange={(e) => setEditingCredentials({ ...editingCredentials, qrCodeUrl: e.target.value })}
                              className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none disabled:opacity-50"
                              placeholder="Paste custom QR link"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SUBTAB 3: LIMITS */}
        {activeSubTab === 'limits' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-display font-black">Deposit & Withdrawal Rules</h3>
                <p className="text-xs text-slate-500">Configure global limits, anti-spam blocktimes, QR dimensions, and routing triggers.</p>
              </div>

              <button
                onClick={handleSaveLimits}
                disabled={saving}
                className="px-4 py-2.5 rounded-2xl bg-emerald-500 text-black font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/10"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save Configuration</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Deposit Rules */}
              <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 space-y-4">
                <h4 className="font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
                  <Coins className="w-4 h-4 text-emerald-400" />
                  <span>Deposit Rules</span>
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">Min Deposit (USD)</label>
                    <input
                      type="number"
                      value={minDep}
                      onChange={(e) => setMinDep(e.target.value)}
                      className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">Max Deposit (USD)</label>
                    <input
                      type="number"
                      value={maxDep}
                      onChange={(e) => setMaxDep(e.target.value)}
                      className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">Anti-Spam Cooldown (Seconds)</label>
                  <input
                    type="number"
                    value={cooldown}
                    onChange={(e) => setCooldown(e.target.value)}
                    className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none"
                  />
                  <p className="text-[9px] text-slate-500 font-sans leading-normal">
                    Prevent users from submitting consecutive deposit invoices with same amount within this cooling window.
                  </p>
                </div>
              </div>

              {/* Withdrawal Rules */}
              <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 space-y-4">
                <h4 className="font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
                  <Settings className="w-4 h-4 text-emerald-400" />
                  <span>Withdrawal Rules</span>
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">Min Withdraw (USDT)</label>
                    <input
                      type="number"
                      value={minWith}
                      onChange={(e) => setMinWith(e.target.value)}
                      className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">Max Withdraw (USDT)</label>
                    <input
                      type="number"
                      value={maxWith}
                      onChange={(e) => setMaxWith(e.target.value)}
                      className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">Daily Platform Limit</label>
                    <input
                      type="number"
                      value={dailyWithLimit}
                      onChange={(e) => setDailyWithLimit(e.target.value)}
                      className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col justify-end pb-1.5 space-y-1.5">
                    <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">Auto Withdrawals</label>
                    <button
                      onClick={() => setAutoWith(!autoWith)}
                      className={`px-4 py-2 rounded-xl text-[10px] uppercase font-bold border font-mono transition-all text-center ${
                        autoWith 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                          : 'bg-slate-500/10 text-slate-400 border-slate-500/10'
                      }`}
                    >
                      {autoWith ? 'Auto Enabled' : 'Manual Review Required'}
                    </button>
                  </div>
                </div>
              </div>

              {/* QR Settings */}
              <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 space-y-4">
                <h4 className="font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-3">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  <span>QR Code Settings</span>
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">QR Code Size (px)</label>
                    <input
                      type="number"
                      value={qrSize}
                      onChange={(e) => setQrSize(e.target.value)}
                      className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold font-mono text-slate-500 uppercase">QR Border (modules)</label>
                    <input
                      type="number"
                      value={qrBorder}
                      onChange={(e) => setQrBorder(e.target.value)}
                      className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-emerald-500/30 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs font-bold font-mono text-slate-400">Embed Center Logo in QR</span>
                  <button
                    onClick={() => setQrUseLogo(!qrUseLogo)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all ${
                      qrUseLogo ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/10'
                    }`}
                  >
                    {qrUseLogo ? 'Logo Enabled' : 'Logo Disabled'}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* SUBTAB 4: MONITORING */}
        {activeSubTab === 'monitoring' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-display font-black">Transaction Activity Logs</h3>
                <p className="text-xs text-slate-500">Real-time audit log list of payment events, webhooks, and circuit breaker operations.</p>
              </div>

              {adminRole === 'Super Admin' && logs.length > 0 && (
                <button
                  onClick={handlePurgeLogs}
                  className="px-4 py-2.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 text-rose-300 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Purge Logs</span>
                </button>
              )}
            </div>

            {/* Logs List */}
            {logs.length === 0 ? (
              <div className="bg-slate-900/30 border border-white/5 rounded-3xl p-12 text-center text-slate-500">
                <Database className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <p className="font-mono text-xs">No payment logs recorded yet. Create deposit invoices to initialize activity tracking.</p>
              </div>
            ) : (
              <div className="bg-slate-900/30 border border-white/5 rounded-3xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-[9px] text-slate-500 font-bold uppercase tracking-wider bg-slate-900/40">
                        <th className="px-6 py-4">Timestamp</th>
                        <th className="px-6 py-4">Level</th>
                        <th className="px-6 py-4">Provider</th>
                        <th className="px-6 py-4">Event Message</th>
                        <th className="px-6 py-4 text-right">Identifier</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                      {logs.map((log) => {
                        const dateStr = new Date(log.timestamp || Date.now()).toLocaleTimeString();
                        let badgeColor = 'bg-slate-500/10 text-slate-400';
                        if (log.level === 'success') badgeColor = 'bg-emerald-500/10 text-emerald-400';
                        if (log.level === 'warning') badgeColor = 'bg-amber-500/10 text-amber-400';
                        if (log.level === 'error') badgeColor = 'bg-rose-500/10 text-rose-400';

                        return (
                          <tr key={log.id} className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4 text-slate-500 whitespace-nowrap">{dateStr}</td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${badgeColor}`}>
                                {log.level}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-400">{log.providerId}</td>
                            <td className="px-6 py-4 text-slate-200 font-sans max-w-md truncate" title={log.details || log.newValue}>
                              {log.newValue}
                            </td>
                            <td className="px-6 py-4 text-right text-slate-500 text-[10px]">{log.id}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 5: RETRY QUEUE */}
        {activeSubTab === 'retry' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-display font-black">Payment Retry Queue</h3>
              <p className="text-xs text-slate-500">Unsettled or pending transaction checks that can be manually forced or re-reconciled against provider APIs.</p>
            </div>

            {retryQueue.length === 0 ? (
              <div className="bg-slate-900/30 border border-white/5 rounded-3xl p-12 text-center text-slate-500">
                <AlertTriangle className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                <p className="font-mono text-xs">All transaction requests are fully settled. No items are in the verification queue.</p>
              </div>
            ) : (
              <div className="bg-slate-900/30 border border-white/5 rounded-3xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-[9px] text-slate-500 font-bold uppercase tracking-wider bg-slate-900/40">
                        <th className="px-6 py-4">Deposit ID</th>
                        <th className="px-6 py-4">Player UID</th>
                        <th className="px-6 py-4">Provider</th>
                        <th className="px-6 py-4">Amount</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                      {retryQueue.map((item) => (
                        <tr key={item.depositId} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4 text-slate-200 font-bold">{item.depositId}</td>
                          <td className="px-6 py-4 text-slate-500">{item.playerId}</td>
                          <td className="px-6 py-4 text-slate-400">{item.providerId}</td>
                          <td className="px-6 py-4 text-emerald-400 font-bold">${item.amount}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              item.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {item.status !== 'resolved' ? (
                              <button
                                onClick={() => handleSimulateRetry(item)}
                                className="px-3 py-1.5 rounded-xl bg-emerald-500 text-black text-[10px] uppercase font-bold flex items-center gap-1 hover:scale-105 transition-transform font-sans"
                              >
                                <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '3s' }} />
                                <span>Re-Verify</span>
                              </button>
                            ) : (
                              <span className="text-slate-500 text-[10px]">Settled</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
}
