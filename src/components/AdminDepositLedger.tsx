import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Calendar, SlidersHorizontal, ArrowUpRight, CheckCircle, 
  XCircle, Clock, Copy, Eye, User, ShieldAlert, Check, RefreshCw, 
  MessageSquare, ExternalLink, ChevronLeft, ChevronRight, FileText,
  DollarSign, Activity, AlertTriangle
} from 'lucide-react';
import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { DepositRequest, Player } from '../types.ts';

interface AdminDepositLedgerProps {
  deposits: DepositRequest[];
  players: Player[];
  adminRole?: 'Super Admin' | 'Admin' | 'Support';
  playSound: (key: 'CLICK' | 'WIN' | 'LOSE' | 'BET' | 'SPIN') => void;
}

export function AdminDepositLedger({ 
  deposits = [], 
  players = [], 
  adminRole = 'Super Admin', 
  playSound 
}: AdminDepositLedgerProps) {
  
  // State variables for Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed' | 'rejected'>('all');
  const [networkFilter, setNetworkFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Selected Deposit for Details Modal
  const [selectedDeposit, setSelectedDeposit] = useState<DepositRequest | null>(null);
  
  // Inline edit states inside details modal
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Rejection input states
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReasonText, setRejectionReasonText] = useState('');
  const [depositToReject, setDepositToReject] = useState<DepositRequest | null>(null);
  const [rejectingLoading, setRejectingLoading] = useState(false);

  // Secure Password confirmation modal for approve/reject actions
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [actionToConfirm, setActionToConfirm] = useState<'confirm' | 'reject' | null>(null);
  const [targetDepositId, setTargetDepositId] = useState<string>('');
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Copy Feedback UI states
  const [copyFeedback, setCopyFeedback] = useState<Record<string, boolean>>({});

  // Notification Toast states
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(prev => ({ ...prev, [key]: true }));
    playSound('CLICK');
    showToast('Copied to clipboard!', 'info');
    setTimeout(() => {
      setCopyFeedback(prev => ({ ...prev, [key]: false }));
    }, 2000);
  };

  // Extract unique networks present in the deposits data
  const uniqueNetworks = useMemo(() => {
    const nets = new Set<string>();
    deposits.forEach(d => {
      if (d.network) nets.add(d.network.toLowerCase());
      if (d.method) nets.add(d.method.toLowerCase());
    });
    return Array.from(nets);
  }, [deposits]);

  // Compute stats for Dashboard
  const stats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    
    let totalToday = 0;
    let pendingCount = 0;
    let confirmedCount = 0;
    let rejectedCount = 0;
    let confirmedVolume = 0;

    deposits.forEach(d => {
      const isConfirmed = d.status === 'confirmed' || d.status === 'completed';
      const isPending = d.status === 'pending';
      const isRejected = d.status === 'rejected';

      if (isPending) pendingCount++;
      if (isConfirmed) {
        confirmedCount++;
        confirmedVolume += d.amount || 0;
      }
      if (isRejected) rejectedCount++;

      // Today's deposits (any status)
      const depTime = d.timestamp || 0;
      if (depTime >= startOfToday) {
        totalToday += d.amount || 0;
      }
    });

    return {
      totalToday,
      pendingCount,
      confirmedCount,
      rejectedCount,
      confirmedVolume
    };
  }, [deposits]);

  // Reset pagination on filter trigger
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, networkFilter, startDate, endDate]);

  // Filters applying logic
  const filteredDeposits = useMemo(() => {
    return deposits.filter(d => {
      // 1. Status Filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'confirmed') {
          if (d.status !== 'confirmed' && d.status !== 'completed') return false;
        } else {
          if (d.status !== statusFilter) return false;
        }
      }

      // 2. Network Filter
      if (networkFilter !== 'all') {
        const dNet = (d.network || d.method || '').toLowerCase();
        if (dNet !== networkFilter.toLowerCase()) return false;
      }

      // 3. Date Range Filter
      const dTime = d.timestamp || 0;
      if (startDate) {
        const startMs = new Date(startDate).getTime();
        if (dTime < startMs) return false;
      }
      if (endDate) {
        // Adjust end date to the end of that day (23:59:59)
        const endMs = new Date(endDate).getTime() + (24 * 60 * 60 * 1000) - 1;
        if (dTime > endMs) return false;
      }

      // 4. Search Filter (User ID, Deposit ID, Transaction Hash, Name, Email)
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const player = players.find(p => p.id === d.playerId);
        const pName = (player?.name || '').toLowerCase();
        const pEmail = (player?.email || '').toLowerCase();
        const depId = (d.id || d.depositId || '').toLowerCase();
        const pId = (d.playerId || d.userId || '').toLowerCase();
        const txHash = (d.transactionHash || '').toLowerCase();

        const match = 
          depId.includes(term) || 
          pId.includes(term) || 
          txHash.includes(term) || 
          pName.includes(term) || 
          pEmail.includes(term);

        if (!match) return false;
      }

      return true;
    }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [deposits, players, searchTerm, statusFilter, networkFilter, startDate, endDate]);

  // Paginated List
  const paginatedDeposits = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredDeposits.slice(start, start + itemsPerPage);
  }, [filteredDeposits, currentPage]);

  const totalPages = Math.ceil(filteredDeposits.length / itemsPerPage);

  // Sync details modal notes text when selected deposit changes
  useEffect(() => {
    if (selectedDeposit) {
      setNotesText(selectedDeposit.adminNotes || selectedDeposit.details || '');
    }
  }, [selectedDeposit]);

  // Find player details for custom display helper
  const getPlayerDetails = (playerId: string) => {
    return players.find(p => p.id === playerId) || {
      id: playerId,
      name: 'Unknown User',
      email: 'No email registered',
      balance: 0,
      referralCode: 'NONE',
      referralCount: 0
    };
  };

  // Secure confirmation action pipeline
  const initiateSecureAction = (action: 'confirm' | 'reject', depId: string) => {
    playSound('CLICK');
    setActionToConfirm(action);
    setTargetDepositId(depId);
    setConfirmPassword('');
    setConfirmError('');
    setShowConfirmModal(true);
  };

  // Process Confirm Deposit directly with Firestore Transaction
  const handleConfirmDeposit = async (depositId: string) => {
    if (adminRole === 'Support') {
      showToast('Access Denied: Support role cannot approve transactions.', 'error');
      playSound('LOSE');
      return;
    }

    setConfirmLoading(true);
    try {
      const depositRef = doc(db, 'deposits', depositId);
      
      const result = await runTransaction(db, async (transaction) => {
        // Fetch original deposit doc
        const depSnap = await transaction.get(depositRef);
        if (!depSnap.exists()) {
          throw new Error(`Deposit request #${depositId} not found in database.`);
        }

        const depositData = depSnap.data() as DepositRequest;
        
        // 1. Verify deposit is still pending
        if (depositData.status === 'confirmed' || depositData.status === 'completed') {
          throw new Error('This deposit has already been processed and confirmed.');
        }
        if (depositData.status === 'rejected') {
          throw new Error('This deposit has already been rejected.');
        }

        const playerId = depositData.playerId || depositData.userId;
        const playerRef = doc(db, 'players', playerId);
        const userRef = doc(db, 'users', playerId);

        // Fetch Player profile
        const playerSnap = await transaction.get(playerRef);
        if (!playerSnap.exists()) {
          throw new Error(`User player profile (${playerId}) does not exist. Cannot complete balance adjustment.`);
        }

        const playerData = playerSnap.data() as Player;
        let balanceBefore = playerData.balance ?? 0;

        // Sync with user doc if available
        const userSnap = await transaction.get(userRef);
        if (userSnap.exists()) {
          balanceBefore = userSnap.data().balance ?? userSnap.data().walletBalance ?? balanceBefore;
        }

        const creditAmount = depositData.amount || 0;
        const balanceAfter = balanceBefore + creditAmount;
        const timestamp = Date.now();

        // 2. Update user collections
        if (userSnap.exists()) {
          transaction.update(userRef, {
            balance: balanceAfter,
            walletBalance: balanceAfter,
            updatedAt: timestamp
          });
        } else {
          transaction.set(userRef, {
            userId: playerId,
            username: playerData.name || 'Player',
            email: playerData.email || '',
            balance: balanceAfter,
            walletBalance: balanceAfter,
            createdAt: timestamp,
            updatedAt: timestamp,
            status: 'active'
          });
        }

        transaction.update(playerRef, {
          balance: balanceAfter,
          updatedAt: timestamp
        });

        // 3. Update deposit status to confirmed
        transaction.update(depositRef, {
          status: 'confirmed',
          confirmedAt: timestamp,
          updatedAt: timestamp,
          balanceBefore,
          balanceAfter,
          confirmedBy: adminRole
        });

        // 4. Create immutable Transaction ledger entry
        const txnId = `TXN-DEP-${depositId}`;
        const txnRef = doc(db, 'transactions', txnId);
        transaction.set(txnRef, {
          id: txnId,
          transactionId: txnId,
          playerId: playerId,
          userId: playerId,
          type: 'deposit',
          amount: creditAmount,
          balanceBefore,
          balanceAfter,
          referenceId: depositId,
          network: (depositData.network || depositData.method || 'USDT').toUpperCase(),
          status: 'completed',
          transactionHash: depositData.transactionHash || '',
          timestamp,
          createdAt: timestamp
        });

        // 5. Save Admin Audit activity log
        const auditId = `AUD-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
        const auditRef = doc(db, 'auditLogs', auditId);
        transaction.set(auditRef, {
          logId: auditId,
          userId: 'ADMIN', // Fallback
          adminId: adminRole,
          action: 'deposit_confirm',
          module: 'deposit_management',
          oldValue: balanceBefore.toFixed(2),
          newValue: balanceAfter.toFixed(2),
          timestamp,
          ipAddress: '127.0.0.1',
          details: `Confirmed deposit of ${creditAmount} USDT for user ${playerId}. RequestID: ${depositId}`
        });

        return {
          balanceBefore,
          balanceAfter,
          creditAmount
        };
      });

      playSound('WIN');
      showToast(`Deposit approved! Atomic transfer of ${result.creditAmount} USDT credited successfully.`, 'success');
      
      // Update local state if details modal is active
      if (selectedDeposit && selectedDeposit.id === depositId) {
        setSelectedDeposit(prev => prev ? {
          ...prev,
          status: 'confirmed',
          confirmedAt: Date.now(),
          balanceBefore: result.balanceBefore,
          balanceAfter: result.balanceAfter,
          confirmedBy: adminRole
        } : null);
      }

    } catch (err: any) {
      console.error(err);
      playSound('LOSE');
      showToast(err.message || 'Error processing deposit confirmation.', 'error');
    } finally {
      setConfirmLoading(false);
    }
  };

  // Process Reject Deposit with Reason
  const handleRejectDeposit = async (depositId: string, reason: string) => {
    if (adminRole === 'Support') {
      showToast('Access Denied: Support role cannot reject transactions.', 'error');
      playSound('LOSE');
      return;
    }

    setRejectingLoading(true);
    try {
      const depositRef = doc(db, 'deposits', depositId);
      
      await runTransaction(db, async (transaction) => {
        const depSnap = await transaction.get(depositRef);
        if (!depSnap.exists()) {
          throw new Error('Deposit request not found.');
        }

        const depositData = depSnap.data() as DepositRequest;
        if (depositData.status !== 'pending') {
          throw new Error('This deposit is already processed and cannot be rejected.');
        }

        const timestamp = Date.now();

        // 1. Update status to Rejected
        transaction.update(depositRef, {
          status: 'rejected',
          rejectionReason: reason || 'Transaction hash could not be verified on explorer.',
          rejectedBy: adminRole,
          updatedAt: timestamp
        });

        // 2. Log Audit Log
        const auditId = `AUD-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
        const auditRef = doc(db, 'auditLogs', auditId);
        transaction.set(auditRef, {
          logId: auditId,
          userId: 'ADMIN',
          adminId: adminRole,
          action: 'deposit_reject',
          module: 'deposit_management',
          oldValue: 'pending',
          newValue: 'rejected',
          timestamp,
          ipAddress: '127.0.0.1',
          details: `Rejected deposit #${depositId} for user ${depositData.playerId}. Reason: ${reason}`
        });
      });

      playSound('WIN');
      showToast(`Deposit request #${depositId} rejected successfully. No balances modified.`, 'success');
      
      // Close reject dialogs
      setShowRejectModal(false);
      setRejectionReasonText('');
      setDepositToReject(null);

      // Sync details modal
      if (selectedDeposit && selectedDeposit.id === depositId) {
        setSelectedDeposit(prev => prev ? {
          ...prev,
          status: 'rejected',
          rejectionReason: reason,
          rejectedBy: adminRole
        } : null);
      }

    } catch (err: any) {
      console.error(err);
      playSound('LOSE');
      showToast(err.message || 'Error processing rejection.', 'error');
    } finally {
      setRejectingLoading(false);
    }
  };

  // Save Internal Notes directly
  const handleSaveNotes = async () => {
    if (!selectedDeposit) return;
    setSavingNotes(true);
    try {
      const depositRef = doc(db, 'deposits', selectedDeposit.id);
      await runTransaction(db, async (transaction) => {
        transaction.update(depositRef, {
          adminNotes: notesText,
          updatedAt: Date.now()
        });
      });
      
      showToast('Internal administrator notes saved successfully.', 'success');
      playSound('WIN');
      setEditingNotes(false);
      setSelectedDeposit(prev => prev ? { ...prev, adminNotes: notesText } : null);
    } catch (err: any) {
      console.error(err);
      playSound('LOSE');
      showToast('Failed to save administrator notes.', 'error');
    } finally {
      setSavingNotes(false);
    }
  };

  // Secure Password validation before proceeding
  const handleVerifyPassword = () => {
    if (confirmPassword !== 'admin123') {
      setConfirmError('Incorrect administrative password. Action blocked.');
      playSound('LOSE');
      return;
    }

    setConfirmError('');
    setShowConfirmModal(false);
    playSound('CLICK');

    if (actionToConfirm === 'confirm') {
      handleConfirmDeposit(targetDepositId);
    } else if (actionToConfirm === 'reject') {
      // Find the target deposit to show the rejection modal
      const dep = deposits.find(d => d.id === targetDepositId);
      if (dep) {
        setDepositToReject(dep);
        setRejectionReasonText('');
        setShowRejectModal(true);
      }
    }
  };

  return (
    <div className="space-y-8 w-full text-slate-100">
      
      {/* Toast Alert Banner */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border font-sans text-xs font-semibold ${
              toastMessage.type === 'error' 
                ? 'bg-rose-950/90 border-rose-500/30 text-rose-200' 
                : toastMessage.type === 'info'
                ? 'bg-blue-950/90 border-blue-500/30 text-blue-200'
                : 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200'
            }`}
          >
            {toastMessage.type === 'error' && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {toastMessage.type === 'info' && <Clock className="w-4 h-4 text-blue-400 shrink-0" />}
            {toastMessage.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
            <span>{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. DEPOSIT ANALYTICS DASHBOARD */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Card: Volume */}
        <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 relative overflow-hidden backdrop-blur-xl flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Volume</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-display font-black text-white">{stats.confirmedVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs text-slate-500">USDT</span></h3>
            <p className="text-[9px] text-emerald-400 font-medium mt-1 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> Fully settled ledger entries
            </p>
          </div>
        </div>

        {/* Card: Today Deposits */}
        <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 relative overflow-hidden backdrop-blur-xl flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deposits Today</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-display font-black text-white">{stats.totalToday.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs text-slate-500">USDT</span></h3>
            <p className="text-[9px] text-slate-500 font-medium mt-1">Calendar day sum total</p>
          </div>
        </div>

        {/* Card: Pending */}
        <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 relative overflow-hidden backdrop-blur-xl flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pending Approvals</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Clock className="w-4 h-4 animate-pulse" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-display font-black text-white">{stats.pendingCount} <span className="text-xs text-slate-500">requests</span></h3>
            <p className="text-[9px] text-amber-400 font-medium mt-1">Awaiting verification</p>
          </div>
        </div>

        {/* Card: Confirmed */}
        <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 relative overflow-hidden backdrop-blur-xl flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Confirmed Ledger</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-display font-black text-white">{stats.confirmedCount} <span className="text-xs text-slate-500">cleared</span></h3>
            <p className="text-[9px] text-emerald-400 font-medium mt-1">Credit settled</p>
          </div>
        </div>

        {/* Card: Rejected */}
        <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 relative overflow-hidden backdrop-blur-xl flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rejected Tickets</span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-display font-black text-white">{stats.rejectedCount} <span className="text-xs text-slate-500">tickets</span></h3>
            <p className="text-[9px] text-slate-500 font-medium mt-1">Audit trail stored</p>
          </div>
        </div>

      </div>

      {/* 2. ADVANCED FILTERS SECTION */}
      <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-6 backdrop-blur-md space-y-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider">Interactive Query Filters</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          
          {/* Search Input */}
          <div className="md:col-span-4 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by User ID, Deposit ID, Tx Hash..."
              className="w-full bg-slate-950 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/50 font-sans"
            />
          </div>

          {/* Status Filter Dropdown */}
          <div className="md:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                playSound('CLICK');
              }}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50 font-sans font-bold cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="pending" className="text-amber-400 font-bold">Pending Approval</option>
              <option value="confirmed" className="text-emerald-400 font-bold">Confirmed Ledger</option>
              <option value="rejected" className="text-rose-400 font-bold">Rejected</option>
            </select>
          </div>

          {/* Network Filter Dropdown */}
          <div className="md:col-span-2">
            <select
              value={networkFilter}
              onChange={(e) => {
                setNetworkFilter(e.target.value);
                playSound('CLICK');
              }}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50 font-sans font-bold cursor-pointer"
            >
              <option value="all">All Networks</option>
              {uniqueNetworks.map(net => (
                <option key={net} value={net}>{net.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {/* Date Picker Start */}
          <div className="md:col-span-2 relative">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50 font-sans cursor-pointer"
              title="Start Date"
            />
          </div>

          {/* Date Picker End */}
          <div className="md:col-span-2 relative">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50 font-sans cursor-pointer"
              title="End Date"
            />
          </div>

        </div>

        {/* Query Summary Info */}
        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span>Found {filteredDeposits.length} record(s) matching your parameters</span>
          {(searchTerm || statusFilter !== 'all' || networkFilter !== 'all' || startDate || endDate) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setNetworkFilter('all');
                setStartDate('');
                setEndDate('');
                playSound('CLICK');
              }}
              className="text-emerald-400 hover:underline bg-transparent border-0 cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* 3. DEPOSIT DATA SPREADSHEET TABLE */}
      <div className="bg-slate-900/20 border border-white/5 rounded-3xl overflow-hidden">
        
        {/* Horizontal scroll container */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-sans text-xs">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5 text-[10px] font-bold uppercase tracking-wider text-slate-500 select-none">
                <th className="p-4">Deposit ID</th>
                <th className="p-4">User / Profile</th>
                <th className="p-4">Amount (USDT)</th>
                <th className="p-4">Network</th>
                <th className="p-4">Wallet Address</th>
                <th className="p-4">Tx Hash</th>
                <th className="p-4">Status</th>
                <th className="p-4">Created Time</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredDeposits.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-16 text-center text-slate-500 font-mono italic">
                    No deposit ledger records match the query.
                  </td>
                </tr>
              ) : (
                paginatedDeposits.map((d) => {
                  const player = getPlayerDetails(d.playerId);
                  const isPending = d.status === 'pending';
                  const isConfirmed = d.status === 'confirmed' || d.status === 'completed';
                  const isRejected = d.status === 'rejected';

                  return (
                    <tr 
                      key={d.id} 
                      className={`hover:bg-white/[0.01] transition-all ${
                        isPending ? 'bg-amber-500/[0.01]' : ''
                      }`}
                    >
                      {/* ID Column */}
                      <td className="p-4 font-mono font-semibold text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] uppercase text-slate-400">{d.id.substring(0, 12)}...</span>
                          <button
                            onClick={() => handleCopy(d.id, `id-${d.id}`)}
                            className="p-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-slate-400 hover:text-white transition-colors cursor-pointer"
                            title="Copy Deposit ID"
                          >
                            {copyFeedback[`id-${d.id}`] ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>

                      {/* User Column */}
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-white">{player.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono select-all shrink-0">{d.playerId.substring(0, 8)}...</span>
                        </div>
                      </td>

                      {/* Amount Column */}
                      <td className="p-4 font-mono font-bold text-slate-100">
                        <span className="text-emerald-400">{Number(d.amount).toFixed(2)}</span> USDT
                      </td>

                      {/* Network Column */}
                      <td className="p-4">
                        <span className="px-2 py-1 rounded bg-slate-950 text-emerald-400 font-mono text-[9px] uppercase tracking-wider font-semibold border border-emerald-500/10">
                          {d.network || d.method || 'USDT'}
                        </span>
                      </td>

                      {/* Wallet Column */}
                      <td className="p-4">
                        {d.walletAddress ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 font-mono">{d.walletAddress.substring(0, 6)}...{d.walletAddress.slice(-4)}</span>
                            <button
                              onClick={() => handleCopy(d.walletAddress || '', `wallet-${d.id}`)}
                              className="p-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 hover:text-white border border-white/5 cursor-pointer"
                              title="Copy Wallet Address"
                            >
                              {copyFeedback[`wallet-${d.id}`] ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic font-mono">-</span>
                        )}
                      </td>

                      {/* Hash Column */}
                      <td className="p-4">
                        {d.transactionHash ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 font-mono">{d.transactionHash.substring(0, 6)}...{d.transactionHash.slice(-4)}</span>
                            <button
                              onClick={() => handleCopy(d.transactionHash || '', `hash-${d.id}`)}
                              className="p-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 hover:text-white border border-white/5 cursor-pointer"
                              title="Copy Tx Hash"
                            >
                              {copyFeedback[`hash-${d.id}`] ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                            <a 
                              href={`https://tronscan.org/#/transaction/${d.transactionHash}`} 
                              target="_blank" 
                              rel="noreferrer"
                              className="p-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 hover:text-white border border-white/5 cursor-pointer"
                              title="Verify on TronScan/Explorer"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic font-mono">No Proof Uploaded</span>
                        )}
                      </td>

                      {/* Status Column */}
                      <td className="p-4">
                        {isPending && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] uppercase font-bold tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                            <Clock className="w-2.5 h-2.5" /> Pending
                          </span>
                        )}
                        {isConfirmed && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] uppercase font-bold tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle className="w-2.5 h-2.5" /> Confirmed
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] uppercase font-bold tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <XCircle className="w-2.5 h-2.5" /> Rejected
                          </span>
                        )}
                      </td>

                      {/* Time Column */}
                      <td className="p-4 text-slate-400 font-mono text-[10px]">
                        {new Date(d.timestamp || 0).toLocaleString()}
                      </td>

                      {/* Actions Column */}
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Details Button */}
                          <button
                            onClick={() => {
                              playSound('CLICK');
                              setSelectedDeposit(d);
                            }}
                            className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg border border-white/5 transition-all cursor-pointer"
                            title="Open Ledger Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Quick Confirm & Reject if Pending */}
                          {isPending && (
                            <>
                              <button
                                onClick={() => initiateSecureAction('confirm', d.id)}
                                className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/20 transition-all cursor-pointer"
                                title="Verify & Confirm Deposit"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => initiateSecureAction('reject', d.id)}
                                className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg border border-rose-500/20 transition-all cursor-pointer"
                                title="Reject Deposit"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Custom Table Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between border-t border-white/5 px-6 py-4 gap-4 bg-slate-900/30">
            <div className="text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-300">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
              <span className="font-semibold text-slate-300">
                {Math.min(currentPage * itemsPerPage, filteredDeposits.length)}
              </span>{' '}
              of <span className="font-semibold text-slate-300">{filteredDeposits.length}</span> records
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (currentPage > 1) {
                    setCurrentPage(prev => prev - 1);
                    playSound('CLICK');
                  }
                }}
                disabled={currentPage === 1}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold select-none transition-all ${
                  currentPage === 1
                    ? 'border-white/5 text-slate-600 cursor-not-allowed bg-transparent'
                    : 'border-white/10 text-slate-300 hover:bg-white/5 hover:border-white/20 cursor-pointer active:scale-95'
                }`}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>
              <span className="text-xs font-semibold text-slate-400 px-3 py-1 bg-slate-950/60 rounded-md border border-white/5 font-mono">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => {
                  if (currentPage < totalPages) {
                    setCurrentPage(prev => prev + 1);
                    playSound('CLICK');
                  }
                }}
                disabled={currentPage === totalPages}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold select-none transition-all ${
                  currentPage === totalPages
                    ? 'border-white/5 text-slate-600 cursor-not-allowed bg-transparent'
                    : 'border-white/10 text-slate-300 hover:bg-white/5 hover:border-white/20 cursor-pointer active:scale-95'
                }`}
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* MODAL 1: DETAILED DEPOSIT & USER AUDIT DRAWER / MODAL */}
      <AnimatePresence>
        {selectedDeposit && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            
            {/* Background Backdrop Overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDeposit(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="relative w-full max-w-4xl bg-slate-950 border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col z-10"
            >
              
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/5 bg-slate-900/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-md font-display font-black text-white">Deposit Audit Ledger Card</h3>
                    <p className="text-[9px] font-mono text-slate-400 uppercase tracking-widest mt-0.5">#{selectedDeposit.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    playSound('CLICK');
                    setSelectedDeposit(null);
                  }}
                  className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable details view */}
              <div className="p-8 overflow-y-auto max-h-[70vh] grid grid-cols-1 md:grid-cols-2 gap-8 font-sans">
                
                {/* Column A: Financial & Transaction Information */}
                <div className="space-y-6">
                  
                  {/* Status & Amount Card */}
                  <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Transaction Amount</span>
                      <div>
                        {selectedDeposit.status === 'pending' && (
                          <span className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/10">Pending</span>
                        )}
                        {selectedDeposit.status === 'confirmed' && (
                          <span className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/10">Confirmed</span>
                        )}
                        {selectedDeposit.status === 'rejected' && (
                          <span className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase bg-rose-500/15 text-rose-400 border border-rose-500/10">Rejected</span>
                        )}
                      </div>
                    </div>
                    <div className="text-3xl font-display font-black text-emerald-400">
                      {Number(selectedDeposit.amount).toFixed(2)} <span className="text-sm font-sans text-white/70 font-semibold">USDT</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5 font-mono text-[10px]">
                      <div>
                        <span className="text-slate-500 block mb-0.5">Method Network:</span>
                        <span className="text-slate-200 uppercase font-bold">{selectedDeposit.network || selectedDeposit.method || 'USDT'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block mb-0.5">Reported At:</span>
                        <span className="text-slate-200">{new Date(selectedDeposit.timestamp || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Blockchain & Wallets Data */}
                  <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-5 space-y-4">
                    <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Blockchain Metadata</h4>
                    
                    <div className="space-y-3 font-mono text-xs">
                      
                      {/* Destination Address */}
                      <div className="bg-slate-950 p-3 rounded-xl border border-white/5 flex items-center justify-between gap-4">
                        <div className="truncate">
                          <span className="text-[9px] text-slate-500 uppercase block mb-0.5">Admin Vault Address</span>
                          <span className="text-slate-300 text-[11px] select-all truncate block">{selectedDeposit.walletAddress || 'No Address Logged'}</span>
                        </div>
                        {selectedDeposit.walletAddress && (
                          <button
                            onClick={() => handleCopy(selectedDeposit.walletAddress || '', 'det-wallet')}
                            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white border border-white/5 shrink-0 cursor-pointer"
                          >
                            {copyFeedback['det-wallet'] ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>

                      {/* Transaction Hash */}
                      <div className="bg-slate-950 p-3 rounded-xl border border-white/5 flex items-center justify-between gap-4">
                        <div className="truncate">
                          <span className="text-[9px] text-slate-500 uppercase block mb-0.5">Customer Tx Hash</span>
                          <span className="text-slate-300 text-[11px] select-all truncate block">{selectedDeposit.transactionHash || 'No transaction proof hash provided'}</span>
                        </div>
                        {selectedDeposit.transactionHash && (
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => handleCopy(selectedDeposit.transactionHash || '', 'det-hash')}
                              className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white border border-white/5 cursor-pointer"
                            >
                              {copyFeedback['det-hash'] ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <a 
                              href={`https://tronscan.org/#/transaction/${selectedDeposit.transactionHash}`} 
                              target="_blank" 
                              rel="noreferrer"
                              className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white border border-white/5 cursor-pointer"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* Ledger Balance State Snapshot */}
                  {(selectedDeposit.status === 'confirmed' || selectedDeposit.status === 'completed') && (
                    <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                        <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Ledger Balance Reconciliation</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-4 font-mono pt-2">
                        <div className="bg-slate-950 p-3 rounded-xl border border-white/5 text-center">
                          <span className="text-[9px] text-slate-500 block mb-1 uppercase">Balance Before</span>
                          <span className="text-slate-300 font-bold text-sm">USDT {(selectedDeposit.balanceBefore ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="bg-slate-950 p-3 rounded-xl border border-white/5 text-center">
                          <span className="text-[9px] text-slate-500 block mb-1 uppercase">Balance After</span>
                          <span className="text-emerald-400 font-bold text-sm">USDT {(selectedDeposit.balanceAfter ?? 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rejection Detail */}
                  {selectedDeposit.status === 'rejected' && selectedDeposit.rejectionReason && (
                    <div className="bg-rose-950/30 border border-rose-500/20 rounded-2xl p-5 space-y-2">
                      <div className="flex items-center gap-1.5 text-rose-400 text-xs font-semibold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Rejection Logged</span>
                      </div>
                      <p className="text-xs text-rose-200 bg-black/30 p-3 rounded-xl font-mono leading-relaxed">{selectedDeposit.rejectionReason}</p>
                    </div>
                  )}

                </div>

                {/* Column B: Customer Information & Internal Admin Notes */}
                <div className="space-y-6">
                  
                  {/* Customer Card */}
                  <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Customer Profile Data</h4>
                    </div>

                    {(() => {
                      const player = getPlayerDetails(selectedDeposit.playerId);
                      return (
                        <div className="space-y-3 font-sans text-xs">
                          <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="text-slate-500">Username / Name:</span>
                            <span className="text-white font-bold">{player.name}</span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="text-slate-500">Registered Email:</span>
                            <span className="text-slate-300 font-mono">{player.email || 'No email registered'}</span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="text-slate-500">Current Vault Balance:</span>
                            <span className="text-emerald-400 font-bold font-mono">{(player.balance ?? 0).toFixed(2)} USDT</span>
                          </div>
                          <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="text-slate-500">Referral Code:</span>
                            <span className="text-slate-300 font-mono font-bold uppercase">{player.referralCode || 'NONE'}</span>
                          </div>
                          <div className="flex justify-between items-center py-2">
                            <span className="text-slate-500">Total Referrals:</span>
                            <span className="text-slate-300 font-mono font-bold">{player.referralCount || 0}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Screenshot Verification */}
                  {selectedDeposit.screenshotUrl && (
                    <div className="bg-slate-900/30 border border-white/5 rounded-2xl p-5 space-y-3">
                      <h4 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Customer Deposit Receipt Screenshot</h4>
                      <div className="relative rounded-xl overflow-hidden border border-white/5 bg-black">
                        <img 
                          src={selectedDeposit.screenshotUrl} 
                          alt="Customer deposit slip receipt proof" 
                          className="w-full max-h-56 object-contain hover:scale-105 transition-all cursor-zoom-in"
                          onClick={() => window.open(selectedDeposit.screenshotUrl, '_blank')}
                        />
                      </div>
                      <p className="text-[9px] text-center text-slate-500 italic mt-1">Click image to inspect receipt in full high-resolution</p>
                    </div>
                  )}

                  {/* Internal Administrator Notes System */}
                  <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                        <h4 className="text-[10px] font-bold uppercase tracking-wider">Administrative Memo Ledger Notes</h4>
                      </div>
                      {!editingNotes ? (
                        <button
                          onClick={() => {
                            playSound('CLICK');
                            setEditingNotes(true);
                          }}
                          className="text-[10px] text-emerald-400 hover:underline bg-transparent border-0 cursor-pointer"
                        >
                          Edit notes
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveNotes}
                            disabled={savingNotes}
                            className="text-[10px] text-emerald-400 hover:underline bg-transparent border-0 cursor-pointer font-bold disabled:opacity-50"
                          >
                            {savingNotes ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => {
                              playSound('CLICK');
                              setEditingNotes(false);
                              setNotesText(selectedDeposit.adminNotes || selectedDeposit.details || '');
                            }}
                            className="text-[10px] text-rose-400 hover:underline bg-transparent border-0 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    {!editingNotes ? (
                      <p className="text-xs text-slate-400 bg-slate-950 p-4 rounded-xl border border-white/5 italic whitespace-pre-wrap leading-relaxed">
                        {selectedDeposit.adminNotes || selectedDeposit.details || 'No administrative internal notes added.'}
                      </p>
                    ) : (
                      <textarea
                        value={notesText}
                        onChange={(e) => setNotesText(e.target.value)}
                        placeholder="Write secret admin notes, verification comments, or processing updates..."
                        rows={4}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500/50 font-sans"
                      />
                    )}
                  </div>

                </div>

              </div>

              {/* Modal Footer (with action buttons if pending) */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 border-t border-white/5 bg-slate-900/60">
                <div className="text-[10px] text-slate-500 font-mono">
                  {selectedDeposit.confirmedBy && `Settle: Verified by ${selectedDeposit.confirmedBy}`}
                  {selectedDeposit.rejectedBy && `Settle: Blocked by ${selectedDeposit.rejectedBy}`}
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  {selectedDeposit.status === 'pending' && (
                    <>
                      <button
                        onClick={() => initiateSecureAction('reject', selectedDeposit.id)}
                        className="flex-1 sm:flex-none px-5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl font-bold uppercase tracking-wider text-[10px] border border-rose-500/20 active:scale-95 transition-all cursor-pointer"
                      >
                        Reject Request
                      </button>
                      <button
                        onClick={() => initiateSecureAction('confirm', selectedDeposit.id)}
                        className="flex-1 sm:flex-none px-6 py-2.5 bg-emerald-500 text-black rounded-xl font-black uppercase tracking-wider text-[10px] hover:scale-[1.02] active:scale-95 transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
                      >
                        Approve & Confirm
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      playSound('CLICK');
                      setSelectedDeposit(null);
                    }}
                    className="w-full sm:w-auto px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold uppercase tracking-wider text-[10px] text-slate-300 transition-colors cursor-pointer"
                  >
                    Close Ledger Card
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: REJECTION REASON DIALOG */}
      <AnimatePresence>
        {showRejectModal && depositToReject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
              onClick={() => { playSound('CLICK'); setShowRejectModal(false); }}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-950 border border-white/10 rounded-3xl w-full max-w-md p-6 shadow-2xl relative z-10 space-y-4 text-left"
            >
              <div className="flex items-center gap-2 text-rose-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="font-display font-black text-white text-md">Set Rejection Reason</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                You are rejecting the deposit of <span className="font-bold text-slate-200">{depositToReject.amount} USDT</span> for user <span className="font-bold text-slate-200">{getPlayerDetails(depositToReject.playerId).name}</span>. Provide an audit reason below. This will be visible to the customer.
              </p>

              <textarea
                value={rejectionReasonText}
                onChange={(e) => setRejectionReasonText(e.target.value)}
                placeholder="E.g., Transaction hash could not be verified on explorer, invalid screenshot, or incorrect chain network selected."
                rows={4}
                className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-rose-500/50 font-sans"
              />

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    playSound('CLICK');
                    setShowRejectModal(false);
                    setDepositToReject(null);
                  }}
                  className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold uppercase tracking-wider text-[10px] text-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRejectDeposit(depositToReject.id, rejectionReasonText)}
                  disabled={rejectingLoading}
                  className="flex-1 py-2.5 bg-rose-500 text-black rounded-xl font-black uppercase tracking-wider text-[10px] hover:bg-rose-400 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {rejectingLoading ? 'Rejecting...' : 'Reject Transaction'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: PASSWORD CONFIRMATION MODAL */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              onClick={() => { playSound('CLICK'); setShowConfirmModal(false); }}
            />

            {/* Dialog Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-slate-950 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4 text-left z-10"
            >
              <div className="flex items-center gap-2.5 text-amber-400">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                <h3 className="font-display font-black text-white text-md">Security Validation Required</h3>
              </div>
              <p className="text-xs text-slate-400 font-sans leading-relaxed">
                This transaction involves modifying user balances and financial ledger logs. Please verify your administrative authority by entering your validation password.
              </p>

              <div className="space-y-1.5">
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Enter administrator password..."
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-3 text-xs text-white focus:outline-none focus:border-amber-500/50 font-mono"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleVerifyPassword();
                  }}
                  autoFocus
                />
                {confirmError && (
                  <p className="text-[10px] text-rose-400 font-sans font-bold flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> {confirmError}
                  </p>
                )}
                <p className="text-[9px] text-slate-500 font-mono">Hint: Enter 'admin123' to authenticate.</p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    playSound('CLICK');
                    setShowConfirmModal(false);
                    setActionToConfirm(null);
                  }}
                  className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold uppercase tracking-wider text-[10px] text-slate-300 transition-colors cursor-pointer"
                >
                  Abort Action
                </button>
                <button
                  onClick={handleVerifyPassword}
                  disabled={confirmLoading}
                  className="flex-1 py-2.5 bg-amber-500 text-black rounded-xl font-black uppercase tracking-wider text-[10px] hover:bg-amber-400 transition-colors cursor-pointer"
                >
                  Verify Authority
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
