import React, { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, ToggleLeft, ToggleRight, Plus, Trash2, Edit3, Save, X, 
  CheckCircle, AlertTriangle, RefreshCw, Power, Wrench, ArrowUpRight, ArrowDownRight, CreditCard, Wallet, Landmark
} from 'lucide-react';
import { 
  getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs 
} from 'firebase/firestore';
import { PaymentGatewayMethod } from '../types';

interface AdminPaymentGatewaySettingsProps {
  db: any;
  playSound: (sound: 'CLICK' | 'WIN' | 'LOSE' | 'BET' | 'SPIN') => void;
  adminRole: 'Super Admin' | 'Support' | 'Admin';
}

const DEFAULT_GATEWAYS: PaymentGatewayMethod[] = [
  {
    id: 'sunpay',
    gatewayName: 'Sunpay (UPI)',
    gatewayType: 'fiat',
    status: 'active',
    depositEnabled: true,
    withdrawalEnabled: true,
    maintenanceMessage: 'Sunpay UPI service is currently under maintenance.',
    providerCode: 'sunpay',
    description: 'Fiat UPI Deposit and Withdrawal gateway via Sunpay.'
  },
  {
    id: 'watchpay',
    gatewayName: 'WATCH-PAY (UPI)',
    gatewayType: 'fiat',
    status: 'active',
    depositEnabled: true,
    withdrawalEnabled: true,
    maintenanceMessage: 'WATCH-PAY service is under routine maintenance.',
    providerCode: 'watchpay',
    description: 'Fiat UPI Deposit and Withdrawal gateway via WATCH-PAY.'
  },
  {
    id: 'nowpayments',
    gatewayName: 'NOWPayments (USDT Crypto)',
    gatewayType: 'crypto',
    status: 'active',
    depositEnabled: true,
    withdrawalEnabled: true,
    maintenanceMessage: 'NOWPayments USDT crypto gateway is undergoing routine maintenance.',
    providerCode: 'nowpayments',
    description: 'Automated multi-network USDT crypto deposits and withdrawals (TRC20, BEP20, ERC20).'
  },
  {
    id: 'cashfree_upi',
    gatewayName: 'Cashfree UPI Instant',
    gatewayType: 'fiat',
    status: 'active',
    depositEnabled: true,
    withdrawalEnabled: true,
    maintenanceMessage: 'Cashfree UPI channel is currently under scheduled maintenance.',
    providerCode: 'cashfree',
    description: 'Instant automated UPI payment collection and payout via Cashfree PG.'
  },
  {
    id: 'bank_transfer',
    gatewayName: 'IMPS/NEFT Bank Transfer',
    gatewayType: 'Bank',
    status: 'active',
    depositEnabled: true,
    withdrawalEnabled: true,
    maintenanceMessage: 'Bank IMPS channel is temporarily under maintenance.',
    providerCode: 'bank_manual',
    description: 'Direct Indian Bank Account transfers and automated payouts.'
  }
];

export const AdminPaymentGatewaySettings = memo(function AdminPaymentGatewaySettings({ db, playSound, adminRole }: AdminPaymentGatewaySettingsProps) {
  const isReadOnly = adminRole === 'Support';

  const [gateways, setGateways] = useState<PaymentGatewayMethod[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // New Gateway Modal State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newGatewayName, setNewGatewayName] = useState<string>('');
  const [newGatewayType, setNewGatewayType] = useState<'UPI' | 'Crypto' | 'Bank'>('UPI');
  const [newProviderCode, setNewProviderCode] = useState<string>('future_gateway');
  const [newDescription, setNewDescription] = useState<string>('');

  // Editing Maintenance Message State
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [tempMsg, setTempMsg] = useState<string>('');

  // Real-time listener for Firestore `paymentMethods` collection
  useEffect(() => {
    if (!db) return;

    const gatewayColRef = collection(db, 'paymentMethods');
    const unsub = onSnapshot(gatewayColRef, async (snap) => {
      if (snap.empty) {
        // Seed default gateways if empty
        console.log('[PaymentGatewaySettings] Seeding initial paymentMethods collection...');
        try {
          for (const gw of DEFAULT_GATEWAYS) {
            await setDoc(doc(db, 'paymentMethods', gw.id), {
              ...gw,
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
          }
        } catch (e) {
          console.warn('[PaymentGatewaySettings] Error seeding default gateways:', e);
        }
      } else {
        const fetched = snap.docs.map(d => ({
          id: d.id,
          ...d.data()
        })) as PaymentGatewayMethod[];

        setGateways(fetched);
      }
      setLoading(false);
    }, (err) => {
      console.warn('[PaymentGatewaySettings] Error fetching paymentMethods:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [db]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Toggle Gateway Status: active vs disabled
  const handleToggleStatus = async (gw: PaymentGatewayMethod) => {
    if (isReadOnly) {
      alert('Access Denied: Support role cannot modify gateway status.');
      return;
    }
    playSound('CLICK');
    const nextStatus = gw.status === 'active' ? 'disabled' : 'active';
    setSavingId(gw.id);

    try {
      await updateDoc(doc(db, 'paymentMethods', gw.id), {
        status: nextStatus,
        updatedAt: Date.now()
      });
      showToast(`${gw.gatewayName} status set to '${nextStatus.toUpperCase()}'.`);
    } catch (e: any) {
      alert(`Error updating gateway status: ${e.message}`);
    } finally {
      setSavingId(null);
    }
  };

  // Toggle Maintenance Mode
  const handleToggleMaintenance = async (gw: PaymentGatewayMethod) => {
    if (isReadOnly) {
      alert('Access Denied: Support role cannot modify gateway maintenance state.');
      return;
    }
    playSound('CLICK');
    const nextStatus = gw.status === 'maintenance' ? 'active' : 'maintenance';
    setSavingId(gw.id);

    try {
      await updateDoc(doc(db, 'paymentMethods', gw.id), {
        status: nextStatus,
        updatedAt: Date.now()
      });
      showToast(`${gw.gatewayName} ${nextStatus === 'maintenance' ? 'placed under MAINTENANCE' : 'restored to ACTIVE'}.`);
    } catch (e: any) {
      alert(`Error toggling maintenance mode: ${e.message}`);
    } finally {
      setSavingId(null);
    }
  };

  // Toggle Deposit Enabled
  const handleToggleDeposit = async (gw: PaymentGatewayMethod) => {
    if (isReadOnly) return;
    playSound('CLICK');
    setSavingId(gw.id);

    try {
      await updateDoc(doc(db, 'paymentMethods', gw.id), {
        depositEnabled: !gw.depositEnabled,
        updatedAt: Date.now()
      });
      showToast(`Deposit ${!gw.depositEnabled ? 'ENABLED' : 'DISABLED'} for ${gw.gatewayName}.`);
    } catch (e: any) {
      alert(`Error toggling deposit state: ${e.message}`);
    } finally {
      setSavingId(null);
    }
  };

  // Toggle Withdrawal Enabled
  const handleToggleWithdrawal = async (gw: PaymentGatewayMethod) => {
    if (isReadOnly) return;
    playSound('CLICK');
    setSavingId(gw.id);

    try {
      await updateDoc(doc(db, 'paymentMethods', gw.id), {
        withdrawalEnabled: !gw.withdrawalEnabled,
        updatedAt: Date.now()
      });
      showToast(`Withdrawal ${!gw.withdrawalEnabled ? 'ENABLED' : 'DISABLED'} for ${gw.gatewayName}.`);
    } catch (e: any) {
      alert(`Error toggling withdrawal state: ${e.message}`);
    } finally {
      setSavingId(null);
    }
  };

  // Save Maintenance Message
  const handleSaveMessage = async (id: string) => {
    if (isReadOnly) return;
    playSound('CLICK');
    setSavingId(id);

    try {
      await updateDoc(doc(db, 'paymentMethods', id), {
        maintenanceMessage: tempMsg,
        updatedAt: Date.now()
      });
      setEditingMsgId(null);
      showToast('Maintenance message updated successfully.');
    } catch (e: any) {
      alert(`Error saving message: ${e.message}`);
    } finally {
      setSavingId(null);
    }
  };

  // Add New Gateway
  const handleAddGateway = async () => {
    if (isReadOnly) return;
    if (!newGatewayName.trim()) {
      alert('Please enter a Gateway Name.');
      return;
    }

    playSound('CLICK');
    const id = `gw_${newGatewayType.toLowerCase()}_${Date.now()}`;

    try {
      await setDoc(doc(db, 'paymentMethods', id), {
        id,
        gatewayName: newGatewayName.trim(),
        gatewayType: newGatewayType,
        status: 'active',
        depositEnabled: true,
        withdrawalEnabled: true,
        maintenanceMessage: `${newGatewayName} is currently under maintenance.`,
        providerCode: newProviderCode.trim() || 'future_gateway',
        description: newDescription.trim() || 'Payment gateway module',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      setShowAddModal(false);
      setNewGatewayName('');
      setNewDescription('');
      showToast(`New Gateway '${newGatewayName}' added successfully!`);
      playSound('WIN');
    } catch (e: any) {
      alert(`Error creating gateway: ${e.message}`);
    }
  };

  // Delete Gateway
  const handleDeleteGateway = async (gw: PaymentGatewayMethod) => {
    if (isReadOnly) return;
    if (!window.confirm(`Are you sure you want to delete gateway '${gw.gatewayName}'? This action cannot be undone.`)) {
      return;
    }

    playSound('LOSE');
    try {
      await deleteDoc(doc(db, 'paymentMethods', gw.id));
      showToast(`Gateway '${gw.gatewayName}' deleted.`);
    } catch (e: any) {
      alert(`Error deleting gateway: ${e.message}`);
    }
  };

  const getGatewayIcon = (type: string) => {
    if (type === 'Crypto') return <Wallet className="w-5 h-5 text-amber-400" />;
    if (type === 'Bank') return <Landmark className="w-5 h-5 text-blue-400" />;
    return <CreditCard className="w-5 h-5 text-emerald-400" />;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
        <p className="text-slate-400 font-mono text-xs">Loading Payment Gateway Configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      {/* Toast Alert */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-emerald-950/90 border border-emerald-500/30 text-emerald-200 px-5 py-4 rounded-2xl shadow-2xl font-sans text-xs font-semibold"
          >
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-white/5 rounded-3xl p-6">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-bold text-white">Payment Gateway Manager</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Manage active payment gateways, set maintenance modes, enable/disable deposit and withdrawal channels dynamically.
          </p>
        </div>

        {!isReadOnly && (
          <button
            onClick={() => { playSound('CLICK'); setShowAddModal(true); }}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-lg shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Gateway</span>
          </button>
        )}
      </div>

      {/* Gateways Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {gateways.map((gw) => {
          const isActive = gw.status === 'active';
          const isMaintenance = gw.status === 'maintenance';
          const isDisabled = gw.status === 'disabled';

          return (
            <div
              key={gw.id}
              className={`relative bg-slate-900/40 border rounded-3xl p-6 space-y-5 transition-all ${
                isMaintenance 
                  ? 'border-amber-500/40 bg-amber-950/10' 
                  : isDisabled 
                  ? 'border-red-500/20 bg-red-950/10 opacity-75' 
                  : 'border-white/10 hover:border-white/20'
              }`}
            >
              {/* Top Row: Gateway Title & Status Badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-slate-800/80 border border-white/5">
                    {getGatewayIcon(gw.gatewayType)}
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">{gw.gatewayName}</h4>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Type: <span className="text-slate-200">{gw.gatewayType}</span> | Code: <span className="text-emerald-400">{gw.providerCode || gw.id}</span>
                    </p>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono ${
                    isActive 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : isMaintenance 
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {gw.status}
                  </span>

                  {!isReadOnly && (
                    <button
                      onClick={() => handleDeleteGateway(gw)}
                      title="Delete Gateway"
                      className="p-1.5 rounded-xl hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {gw.description && (
                <p className="text-xs text-slate-400 leading-relaxed">
                  {gw.description}
                </p>
              )}

              {/* Toggles Panel */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                {/* Deposit Toggle */}
                <button
                  disabled={isReadOnly || savingId === gw.id}
                  onClick={() => handleToggleDeposit(gw)}
                  className={`flex items-center justify-between p-3 rounded-2xl border transition text-xs font-medium ${
                    gw.depositEnabled 
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300' 
                      : 'bg-slate-800/40 border-white/5 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ArrowDownRight className="w-4 h-4" />
                    <span>Deposit</span>
                  </div>
                  {gw.depositEnabled ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-slate-500" />}
                </button>

                {/* Withdrawal Toggle */}
                <button
                  disabled={isReadOnly || savingId === gw.id}
                  onClick={() => handleToggleWithdrawal(gw)}
                  className={`flex items-center justify-between p-3 rounded-2xl border transition text-xs font-medium ${
                    gw.withdrawalEnabled 
                      ? 'bg-blue-950/20 border-blue-500/30 text-blue-300' 
                      : 'bg-slate-800/40 border-white/5 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4" />
                    <span>Withdrawal</span>
                  </div>
                  {gw.withdrawalEnabled ? <ToggleRight className="w-5 h-5 text-blue-400" /> : <ToggleLeft className="w-5 h-5 text-slate-500" />}
                </button>
              </div>

              {/* Action Buttons: Status ON/OFF & Maintenance Mode */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  disabled={isReadOnly || savingId === gw.id}
                  onClick={() => handleToggleStatus(gw)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-bold transition ${
                    isActive 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' 
                      : 'bg-slate-800 border-white/10 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{isActive ? 'Gateway Active' : 'Enable Gateway'}</span>
                </button>

                <button
                  disabled={isReadOnly || savingId === gw.id}
                  onClick={() => handleToggleMaintenance(gw)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-bold transition ${
                    isMaintenance 
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30' 
                      : 'bg-slate-800 border-white/10 text-slate-400 hover:text-amber-400'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>{isMaintenance ? 'Exit Maintenance' : 'Set Maintenance'}</span>
                </button>
              </div>

              {/* Maintenance Message Box */}
              <div className="pt-2 border-t border-white/5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-mono font-bold text-slate-400">Maintenance Message</label>
                  {editingMsgId !== gw.id && !isReadOnly && (
                    <button
                      onClick={() => { setEditingMsgId(gw.id); setTempMsg(gw.maintenanceMessage || ''); }}
                      className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1 font-mono"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  )}
                </div>

                {editingMsgId === gw.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={tempMsg}
                      onChange={(e) => setTempMsg(e.target.value)}
                      className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                      placeholder="Enter maintenance message for users..."
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingMsgId(null)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 text-xs hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveMessage(gw.id)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold hover:bg-emerald-400 flex items-center gap-1"
                      >
                        <Save className="w-3 h-3" />
                        <span>Save</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic bg-slate-950/40 rounded-xl p-2.5 border border-white/5">
                    "{gw.maintenanceMessage || 'No maintenance message set.'}"
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Gateway Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-6 w-full max-w-lg space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <h3 className="text-base font-bold text-white">Add New Payment Gateway</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 font-mono mb-1">Gateway Name *</label>
                  <input
                    type="text"
                    value={newGatewayName}
                    onChange={(e) => setNewGatewayName(e.target.value)}
                    placeholder="e.g. Razorpay UPI, Stripe Cards, Custom Crypto"
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 font-mono mb-1">Gateway Type</label>
                    <select
                      value={newGatewayType}
                      onChange={(e) => setNewGatewayType(e.target.value as any)}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="UPI">UPI</option>
                      <option value="Crypto">Crypto</option>
                      <option value="Bank">Bank Account</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-mono mb-1">Provider Service Code</label>
                    <input
                      type="text"
                      value={newProviderCode}
                      onChange={(e) => setNewProviderCode(e.target.value)}
                      placeholder="e.g. cashfree, nowpayments, future_gateway"
                      className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 font-mono mb-1">Description</label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Brief description of this payment method..."
                    rows={2}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/5">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium text-xs hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddGateway}
                  className="px-5 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition shadow-lg"
                >
                  Save Gateway
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
});
