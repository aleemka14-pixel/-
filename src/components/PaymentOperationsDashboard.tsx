import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Filter, Activity, ArrowUpRight, ArrowDownLeft, ShieldAlert, 
  CheckCircle, XCircle, AlertTriangle, RefreshCw, Copy, Check, Download, 
  Settings2, Bell, Users, Coins, Shield, Clock, Eye, AlertCircle, FileText,
  TrendingUp, Wallet, CheckCircle2, ChevronRight, Ban, Info, PlayCircle, ExternalLink
} from 'lucide-react';
import { doc, updateDoc, setDoc, getFirestore, collection, onSnapshot, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { DepositRequest, WithdrawalRequest, Player, Transaction } from '../types.ts';
import { logActivity } from '../lib/audit.ts';
import { getCurrencySymbol } from '../lib/currency.ts';

interface PaymentOperationsDashboardProps {
  withdrawals: WithdrawalRequest[];
  deposits: DepositRequest[];
  players: Player[];
  playSound: (sound: 'CLICK' | 'WIN' | 'LOSE' | 'BET' | 'SPIN') => void;
  adminRole?: 'Super Admin' | 'Admin' | 'Support';
  transactions?: Transaction[];
}

interface UnifiedTransaction {
  id: string;
  type: 'deposit' | 'withdrawal';
  playerId: string;
  playerName: string;
  playerEmail: string;
  amount: number;
  provider: string;
  network: string;
  paymentId: string;
  transactionHash: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  screenshotUrl?: string;
  adminNotes?: string;
  rejectionReason?: string;
  riskScore: number;
  riskReasons: string[];
}

export function PaymentOperationsDashboard({
  withdrawals = [],
  deposits = [],
  players = [],
  playSound,
  adminRole = 'Super Admin',
  transactions = []
}: PaymentOperationsDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'monitor' | 'ledger' | 'risk' | 'notifications' | 'reliability'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'deposit' | 'withdrawal'>('all');
  const [providerFilter, setProviderFilter] = useState<'all' | 'crypto' | 'upi'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processing' | 'completed' | 'failed'>('all');

  // Dedicated states for system ledger
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<'all' | 'deposit' | 'withdrawal' | 'game_win' | 'game_loss' | 'bonus' | 'admin_adjustment'>('all');
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [ledgerSearch, setLedgerSearch] = useState('');
  
  // Real-time System Reliability states
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [systemAlerts, setSystemAlerts] = useState<any[]>([]);
  const [runningJobName, setRunningJobName] = useState<string | null>(null);
  const [jobFeedbackMessage, setJobFeedbackMessage] = useState<string | null>(null);

  // Firestore Real-time subscriptions for Reliability Layer
  useEffect(() => {
    // 1. Subscribe to system health document
    const healthRef = doc(db, 'config', 'system_health');
    const unsubHealth = onSnapshot(healthRef, (docSnap) => {
      if (docSnap.exists()) {
        setSystemHealth(docSnap.data());
      }
    }, (err) => console.error("Error subscribing to system health:", err));

    // 2. Subscribe to active system alarms/alerts
    const alertsRef = collection(db, 'system_alerts');
    const unsubAlerts = onSnapshot(alertsRef, (snap) => {
      const list: any[] = [];
      snap.forEach(docSnap => {
        list.push({ ...docSnap.data(), docId: docSnap.id });
      });
      // Sort: active/unresolved first, then by timestamp descending
      setSystemAlerts(list.sort((a, b) => {
        if (a.resolved !== b.resolved) {
          return a.resolved ? 1 : -1; // unresolved first
        }
        return b.timestamp - a.timestamp; // newest first
      }));
    }, (err) => console.error("Error subscribing to system alerts:", err));

    return () => {
      unsubHealth();
      unsubAlerts();
    };
  }, []);

  const [selectedTx, setSelectedTx] = useState<UnifiedTransaction | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  
  const [copyFeedback, setCopyFeedback] = useState<Record<string, boolean>>({});
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);
  const [adminNotesInput, setAdminNotesInput] = useState('');

  // Player Map for O(1) Lookups
  const playerMap = useMemo(() => {
    const map: Record<string, Player> = {};
    players.forEach(p => {
      map[p.id] = p;
    });
    return map;
  }, [players]);

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopyFeedback(prev => ({ ...prev, [key]: true }));
    playSound('CLICK');
    setTimeout(() => {
      setCopyFeedback(prev => ({ ...prev, [key]: false }));
    }, 2000);
  };

  // Manual Trigger for Scheduled Background Jobs
  const handleTriggerJob = async (jobName: string) => {
    if (adminRole === 'Support') {
      alert("Access Denied: Support role is restricted from triggering backend reliability tasks.");
      playSound('LOSE');
      return;
    }

    playSound('CLICK');
    setRunningJobName(jobName);
    setJobFeedbackMessage(null);

    try {
      const response = await fetch('/api/admin/trigger-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jobName,
          adminRole
        })
      });

      const data = await response.json();
      if (data.success) {
        setJobFeedbackMessage(`Successfully executed "${jobName}" background job on-demand.`);
        playSound('WIN');
      } else {
        setJobFeedbackMessage(`Execution Failed: ${data.error || 'Server error'}`);
        playSound('LOSE');
      }
    } catch (err: any) {
      console.error("Error triggering job:", err);
      setJobFeedbackMessage(`Connection Failure: ${err.message}`);
      playSound('LOSE');
    } finally {
      setRunningJobName(null);
      setTimeout(() => {
        setJobFeedbackMessage(null);
      }, 5000);
    }
  };

  // Resolve Active Alarms / Alerts
  const handleResolveAlert = async (alertId: string) => {
    playSound('CLICK');
    try {
      const alertRef = doc(db, 'system_alerts', alertId);
      await updateDoc(alertRef, {
        resolved: true,
        resolvedAt: Date.now()
      });
      
      // Log resolve action to security log
      await logActivity({
        action: 'resolve_system_alarm',
        module: 'system_health',
        oldValue: 'Active',
        newValue: 'Resolved',
        ipAddress: '127.0.0.1'
      });
    } catch (err) {
      console.error("Failed to resolve alert:", err);
    }
  };

  // Convert Indian Rupees Exchange Rate (USD / INR fallback)
  const inrRate = 83.50;

  // 1. Map Deposits & Withdrawals into Unified Transactions with Risk Analysis
  const unifiedTransactions = useMemo<UnifiedTransaction[]>(() => {
    const list: UnifiedTransaction[] = [];

    // Map Deposits
    deposits.forEach(d => {
      const player = playerMap[d.playerId];
      const pName = player?.name || 'Unknown Player';
      const pEmail = player?.email || 'N/A';
      
      const provider = d.method?.toLowerCase().includes('upi') ? 'UPI' : 
                       d.method?.toLowerCase().includes('nowpayments') ? 'NOWPayments' : 'CryptoDirect';
      
      const network = d.network || d.method || 'USDT';
      
      // Calculate Risk Score for Deposit
      const riskReasons: string[] = [];
      let riskScore = 0;

      // Duplicate detection (same player, same amount within 15 mins)
      const duplicate = deposits.some(other => 
        other.id !== d.id && 
        other.playerId === d.playerId && 
        other.amount === d.amount && 
        Math.abs((other.timestamp || 0) - (d.timestamp || 0)) < 15 * 60 * 1000
      );
      if (duplicate) {
        riskScore += 40;
        riskReasons.push('Potential Duplicate Request Alert (Same amount & user < 15m)');
      }

      // Check consecutive failures
      const playerFailures = deposits.filter(other => 
        other.playerId === d.playerId && 
        other.status === 'rejected' && 
        other.timestamp > Date.now() - 24 * 60 * 60 * 1000
      ).length;
      if (playerFailures >= 3) {
        riskScore += 30;
        riskReasons.push(`High failure frequency (${playerFailures} rejections in 24h)`);
      }

      if (d.amount > 5000) {
        riskScore += 25;
        riskReasons.push('Large Deposit Request Volume (> $5,000 USD)');
      }

      list.push({
        id: d.id,
        type: 'deposit',
        playerId: d.playerId,
        playerName: pName,
        playerEmail: pEmail,
        amount: d.amount,
        provider,
        network,
        paymentId: d.depositId || d.id,
        transactionHash: d.transactionHash || '',
        status: d.status === 'pending' ? 'pending' : (d.status === 'confirmed' || d.status === 'completed' ? 'completed' : 'failed'),
        createdAt: d.timestamp || Date.now(),
        updatedAt: d.updatedAt || d.confirmedAt || d.timestamp || Date.now(),
        screenshotUrl: d.screenshotUrl,
        adminNotes: d.adminNotes || '',
        rejectionReason: d.rejectionReason || '',
        riskScore: Math.min(riskScore, 100),
        riskReasons
      });
    });

    // Map Withdrawals
    withdrawals.forEach(w => {
      const player = playerMap[w.playerId];
      const pName = w.playerName || player?.name || 'Unknown Player';
      const pEmail = player?.email || 'N/A';

      const provider = w.method || 'Hot Wallet';
      const network = w.blockchain || 'TRC20';

      // Calculate Risk Score for Withdrawal
      const riskReasons: string[] = [];
      let riskScore = 0;

      // Suspicious ratio check (Total withdrawals > 200% of deposits)
      const userDepositsSum = deposits.filter(d => d.playerId === w.playerId && (d.status === 'confirmed' || d.status === 'completed')).reduce((sum, d) => sum + d.amount, 0);
      const userWithdrawalsSum = withdrawals.filter(other => other.playerId === w.playerId && other.status === 'completed').reduce((sum, other) => sum + other.amount, 0) + w.amount;
      
      if (userDepositsSum > 0 && userWithdrawalsSum > userDepositsSum * 2) {
        riskScore += 50;
        riskReasons.push(`Suspicious payout ratio (Total payout is ${(userWithdrawalsSum / userDepositsSum * 100).toFixed(0)}% of deposits)`);
      } else if (userDepositsSum === 0) {
        riskScore += 60;
        riskReasons.push('Withdrawal attempted with ZERO successful deposits');
      }

      if (w.amount > 1000) {
        riskScore += 30;
        riskReasons.push('Large Payout Volume (> $1,000 USDT)');
      }

      // Quick repeated payouts
      const recentPayoutsCount = withdrawals.filter(other => 
        other.id !== w.id &&
        other.playerId === w.playerId &&
        Math.abs(other.timestamp - w.timestamp) < 30 * 60 * 1000
      ).length;
      if (recentPayoutsCount > 0) {
        riskScore += 40;
        riskReasons.push(`Rapid consecutive payout attempts (${recentPayoutsCount + 1} requests < 30m)`);
      }

      list.push({
        id: w.id,
        type: 'withdrawal',
        playerId: w.playerId,
        playerName: pName,
        playerEmail: pEmail,
        amount: w.amount,
        provider,
        network,
        paymentId: w.id,
        transactionHash: w.transactionHash || '',
        status: w.status === 'pending' ? 'pending' : 
                (['processing', 'reviewing', 'approved', 'broadcasted'].includes(w.status) ? 'processing' : 
                (w.status === 'completed' ? 'completed' : 'failed')),
        createdAt: w.timestamp || Date.now(),
        updatedAt: w.completedDate || w.timestamp || Date.now(),
        adminNotes: w.adminNotes || '',
        riskScore: Math.min(riskScore, 100),
        riskReasons
      });
    });

    // Sort by most recent
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, [deposits, withdrawals, playerMap]);

  // Sync selected transaction with refreshed props
  useEffect(() => {
    if (selectedTx) {
      const updated = unifiedTransactions.find(t => t.id === selectedTx.id && t.type === selectedTx.type);
      if (updated) {
        setSelectedTx(updated);
      }
    }
  }, [unifiedTransactions]);

  // 2. Real-time Live Stats Counters
  const stats = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);
    const startOfTodayTime = startOfToday.getTime();

    let totalDepositsToday = 0;
    let totalWithdrawalsToday = 0;
    let pendingDeposits = 0;
    let pendingWithdrawals = 0;
    let successfulTransactions = 0;
    let failedTransactions = 0;
    let totalVolume = 0;

    unifiedTransactions.forEach(tx => {
      const isToday = tx.createdAt >= startOfTodayTime;
      const isPending = tx.status === 'pending';
      const isCompleted = tx.status === 'completed';
      const isFailed = tx.status === 'failed';

      if (tx.type === 'deposit') {
        if (isToday && isCompleted) totalDepositsToday += tx.amount;
        if (isPending) pendingDeposits++;
      } else {
        if (isToday && isCompleted) totalWithdrawalsToday += tx.amount;
        if (isPending) pendingWithdrawals++;
      }

      if (isCompleted) {
        successfulTransactions++;
        totalVolume += tx.amount;
      }
      if (isFailed) {
        failedTransactions++;
      }
    });

    const activeUsers = players.filter(p => p.balance > 0 || (p.totalWagered && p.totalWagered > 0)).length;
    // Real-time online simulated from registered count
    const onlineUsers = Math.max(1, Math.round(players.length * 0.18 + Math.sin(Date.now() / 10000) * 2));

    return {
      totalDepositsToday,
      totalWithdrawalsToday,
      pendingDeposits,
      pendingWithdrawals,
      successfulTransactions,
      failedTransactions,
      totalVolume,
      activeUsers,
      onlineUsers
    };
  }, [unifiedTransactions, players]);

  // 3. Dynamic Interactive Notifications System
  const alerts = useMemo(() => {
    const list: { id: string; type: string; title: string; message: string; timestamp: number; severity: 'info' | 'warning' | 'error'; read: boolean }[] = [];

    // Wallet low balance alert
    const walletLimit = 5000;
    const hotWalletTrc20Balance = 4850; // Mock balance matching admin panel balance fallbacks
    if (hotWalletTrc20Balance < walletLimit) {
      list.push({
        id: 'low-wallet-trc20',
        type: 'Wallet',
        title: 'Low Hot Wallet Balance',
        message: `TRC20 Wallet balance is low: ${hotWalletTrc20Balance.toLocaleString()} USDT (Threshold: ${walletLimit} USDT)`,
        timestamp: Date.now() - 10 * 60 * 1000,
        severity: 'warning',
        read: false
      });
    }

    // System Webhook alerts
    const failedWebhooksCount = deposits.filter(d => d.status === 'rejected' && d.adminNotes?.toLowerCase().includes('webhook')).length;
    if (failedWebhooksCount > 0) {
      list.push({
        id: 'failed-webhooks',
        type: 'System',
        title: 'Recent Webhook Failures Detected',
        message: `${failedWebhooksCount} payment callbacks failed authorization checks. Monitor API gateway parameters.`,
        timestamp: Date.now() - 35 * 60 * 1000,
        severity: 'error',
        read: false
      });
    }

    // Large withdrawal pending alert
    const largePendingCount = withdrawals.filter(w => w.status === 'pending' && w.amount > 1000).length;
    if (largePendingCount > 0) {
      list.push({
        id: 'large-withdrawals',
        type: 'Payout Risk',
        title: 'Large Pending Withdrawals',
        message: `There are ${largePendingCount} pending withdrawals exceeding 1,000 USDT. Admin review mandated.`,
        timestamp: Date.now() - 2 * 60 * 1000,
        severity: 'warning',
        read: false
      });
    }

    // Failed payments
    const failedTodayCount = unifiedTransactions.filter(t => t.type === 'deposit' && t.status === 'failed' && t.createdAt > Date.now() - 24 * 60 * 60 * 1000).length;
    if (failedTodayCount >= 5) {
      list.push({
        id: 'payment-failures-spike',
        type: 'Gateway',
        title: 'High Deposit Rejection Rate',
        message: `${failedTodayCount} deposits rejected in the last 24h. Verify merchant QR / API routing logs.`,
        timestamp: Date.now() - 15 * 60 * 1000,
        severity: 'warning',
        read: false
      });
    }

    // Successful transactions notices (most recent)
    const recentDeposits = deposits.filter(d => (d.status === 'confirmed' || d.status === 'completed')).slice(0, 2);
    recentDeposits.forEach((d, idx) => {
      const player = playerMap[d.playerId];
      list.push({
        id: `deposit-success-${d.id}`,
        type: 'Deposit',
        title: 'Deposit Reconciled Successfully',
        message: `Credited ${d.amount} USDT to player "${player?.name || 'User'}". Reference reference: #${d.id.slice(0, 8)}`,
        timestamp: d.confirmedAt || d.timestamp || Date.now(),
        severity: 'info',
        read: true
      });
    });

    const recentWithdrawals = withdrawals.filter(w => w.status === 'completed').slice(0, 2);
    recentWithdrawals.forEach((w, idx) => {
      const player = playerMap[w.playerId];
      list.push({
        id: `withdraw-success-${w.id}`,
        type: 'Withdrawal',
        title: 'Withdrawal Payout Broadcasted',
        message: `Successfully transferred ${w.amount} USDT via ${w.blockchain || 'TRC20'} to "${player?.name || 'User'}".`,
        timestamp: w.completedDate || w.timestamp || Date.now(),
        severity: 'info',
        read: true
      });
    });

    return list.sort((a,b) => b.timestamp - a.timestamp);
  }, [deposits, withdrawals, playerMap, unifiedTransactions]);

  // 4. Filtered Transactions list for Monitor tab
  const filteredTxList = useMemo(() => {
    return unifiedTransactions.filter(tx => {
      // 1. Search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const match = 
          tx.id.toLowerCase().includes(term) ||
          tx.playerId.toLowerCase().includes(term) ||
          tx.paymentId.toLowerCase().includes(term) ||
          tx.transactionHash.toLowerCase().includes(term) ||
          tx.playerName.toLowerCase().includes(term) ||
          tx.playerEmail.toLowerCase().includes(term);
        
        if (!match) return false;
      }

      // 2. Type filter
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;

      // 3. Provider/Channel Filter
      if (providerFilter !== 'all') {
        const isUpi = tx.provider === 'UPI';
        if (providerFilter === 'upi' && !isUpi) return false;
        if (providerFilter === 'crypto' && isUpi) return false;
      }

      // 4. Status Filter
      if (statusFilter !== 'all' && tx.status !== statusFilter) return false;

      return true;
    });
  }, [unifiedTransactions, searchTerm, typeFilter, providerFilter, statusFilter]);

  // 5. Risk Flagged transactions
  const flaggedTransactions = useMemo(() => {
    return unifiedTransactions.filter(tx => tx.riskScore > 0).sort((a,b) => b.riskScore - a.riskScore);
  }, [unifiedTransactions]);

  // 6. Analytics Charts Data Construction (Last 7 Days)
  const chartsData = useMemo(() => {
    const days = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const startMs = d.getTime();
      const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
      
      const dayDeposits = deposits.filter(dep => (dep.status === 'confirmed' || dep.status === 'completed') && dep.timestamp >= startMs && dep.timestamp <= endMs);
      const dayWithdrawals = withdrawals.filter(w => w.status === 'completed' && w.timestamp >= startMs && w.timestamp <= endMs);
      
      const depVolume = dayDeposits.reduce((sum, dep) => sum + dep.amount, 0);
      const withVolume = dayWithdrawals.reduce((sum, w) => sum + w.amount, 0);
      
      // Platform Revenue (House profit margin from fees & betting outcomes or simple dummy margin)
      const mockRevenue = depVolume * 0.025 + withVolume * 0.015; // 2.5% deposit margin, 1.5% payout fee margin

      const successDepositsCount = dayDeposits.length;
      const failedDepositsCount = deposits.filter(dep => dep.status === 'rejected' && dep.timestamp >= startMs && dep.timestamp <= endMs).length;
      const successWithdrawalsCount = dayWithdrawals.length;
      const failedWithdrawalsCount = withdrawals.filter(w => (w.status === 'rejected' || w.status === 'failed') && w.timestamp >= startMs && w.timestamp <= endMs).length;

      const totalAttempts = successDepositsCount + failedDepositsCount + successWithdrawalsCount + failedWithdrawalsCount;
      const successRate = totalAttempts > 0 
        ? Math.round(((successDepositsCount + successWithdrawalsCount) / totalAttempts) * 100) 
        : 100;

      days.push({
        label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        deposits: depVolume,
        withdrawals: withVolume,
        revenue: mockRevenue,
        successRate,
        failedCount: failedDepositsCount + failedWithdrawalsCount,
        successCount: successDepositsCount + successWithdrawalsCount
      });
    }
    return days;
  }, [deposits, withdrawals]);

  // 7. CSV History Export
  const handleExportCSV = () => {
    playSound('CLICK');
    
    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Transaction ID,Type,User ID,User Name,User Email,Amount (USDT),Amount (INR),Provider,Network,Payment/Reference ID,TX Hash,Status,Created Time,Updated/Settled Time\n';
    
    filteredTxList.forEach(tx => {
      const row = [
        tx.id,
        tx.type.toUpperCase(),
        tx.playerId,
        `"${tx.playerName.replace(/"/g, '""')}"`,
        `"${tx.playerEmail.replace(/"/g, '""')}"`,
        tx.amount,
        (tx.amount * inrRate).toFixed(2),
        tx.provider,
        tx.network,
        tx.paymentId,
        tx.transactionHash || 'N/A',
        tx.status.toUpperCase(),
        new Date(tx.createdAt).toISOString(),
        new Date(tx.updatedAt).toISOString()
      ].join(',');
      csvContent += row + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `payment_operations_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setActionMessage('CSV Transaction history successfully exported for download!');
    setTimeout(() => setActionMessage(null), 4000);
  };

  // 8. Admin Database Actions
  // Retry / Settle Deposit
  const handleRetryPayment = async (tx: UnifiedTransaction) => {
    if (adminRole === 'Support') {
      alert('Permission Denied: Support accounts cannot write or retry deposits.');
      return;
    }
    if (!window.confirm(`Are you sure you want to RE-VERIFY & RETRY Deposit Request #${tx.id}? This will set it back to "pending" for normal reconciliation.`)) {
      return;
    }
    
    playSound('CLICK');
    setIsProcessingAction(true);
    try {
      const depositRef = doc(db, 'deposits', tx.id);
      await updateDoc(depositRef, {
        status: 'pending',
        updatedAt: Date.now(),
        adminNotes: `${tx.adminNotes ? tx.adminNotes + ' | ' : ''}Re-queued for processing by Global_Admin at ${new Date().toISOString()}`
      });
      
      await logActivity({
        userId: tx.playerId,
        adminId: 'Global_Admin',
        action: 'payment_retry_requeued',
        module: 'payment_ops_dashboard',
        oldValue: tx.status,
        newValue: 'pending',
        ipAddress: '127.0.0.1'
      });
      
      playSound('WIN');
      setActionMessage(`Payment Request #${tx.id.slice(0, 8)} successfully reset to PENDING status.`);
      setTimeout(() => setActionMessage(null), 4000);
    } catch (e: any) {
      playSound('LOSE');
      alert(`Failed to retry deposit: ${e.message}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Retry / Reactivate Withdrawal
  const handleRetryWithdrawal = async (tx: UnifiedTransaction) => {
    if (adminRole === 'Support') {
      alert('Permission Denied: Support accounts cannot write or retry withdrawals.');
      return;
    }
    if (!window.confirm(`Are you sure you want to RE-ACTIVATE Failed Withdrawal #${tx.id}? This will set its status to "pending" for payout queue retry.`)) {
      return;
    }

    playSound('CLICK');
    setIsProcessingAction(true);
    try {
      const withdrawalRef = doc(db, 'withdrawals', tx.id);
      await updateDoc(withdrawalRef, {
        status: 'pending',
        completedDate: null,
        adminNotes: `${tx.adminNotes ? tx.adminNotes + ' | ' : ''}Re-activated by Global_Admin at ${new Date().toISOString()}`
      });

      await logActivity({
        userId: tx.playerId,
        adminId: 'Global_Admin',
        action: 'withdrawal_retry_requeued',
        module: 'payment_ops_dashboard',
        oldValue: tx.status,
        newValue: 'pending',
        ipAddress: '127.0.0.1'
      });

      playSound('WIN');
      setActionMessage(`Withdrawal #${tx.id.slice(0, 8)} successfully re-queued as PENDING.`);
      setTimeout(() => setActionMessage(null), 4000);
    } catch (e: any) {
      playSound('LOSE');
      alert(`Failed to retry withdrawal: ${e.message}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Cancel Withdrawal (which automatically triggers player refund)
  const handleCancelWithdrawal = async (tx: UnifiedTransaction) => {
    if (adminRole === 'Support') {
      alert('Permission Denied: Support accounts cannot reject or cancel withdrawals.');
      return;
    }
    if (!window.confirm(`Are you sure you want to CANCEL & REFUND Withdrawal #${tx.id}? This will transition status to "cancelled" and instantly credit ${tx.amount} USDT back to player balance.`)) {
      return;
    }

    playSound('CLICK');
    setIsProcessingAction(true);
    try {
      const playerObj = playerMap[tx.playerId];
      if (!playerObj) {
        throw new Error('Associated player account could not be found to issue refund.');
      }

      // Perform updates
      const playerRef = doc(db, 'players', tx.playerId);
      const newBalance = (playerObj.balance || 0) + tx.amount;
      
      // Update Firestore balance
      await updateDoc(playerRef, {
        balance: newBalance
      });
      await setDoc(doc(db, 'users', tx.playerId), {
        walletBalance: newBalance,
        balance: newBalance,
        updatedAt: Date.now()
      }, { merge: true });

      // Update withdrawal record
      const withdrawalRef = doc(db, 'withdrawals', tx.id);
      await updateDoc(withdrawalRef, {
        status: 'cancelled',
        completedDate: Date.now(),
        adminNotes: `${tx.adminNotes ? tx.adminNotes + ' | ' : ''}Cancelled & Refunded by Global_Admin at ${new Date().toISOString()}`
      });

      await logActivity({
        userId: tx.playerId,
        adminId: 'Global_Admin',
        action: 'withdrawal_cancelled_refunded',
        module: 'payment_ops_dashboard',
        oldValue: tx.status,
        newValue: 'cancelled',
        ipAddress: '127.0.0.1'
      });

      playSound('WIN');
      setActionMessage(`Withdrawal #${tx.id.slice(0, 8)} successfully cancelled. ${tx.amount} USDT credited back to player balance.`);
      setTimeout(() => setActionMessage(null), 4000);
    } catch (e: any) {
      playSound('LOSE');
      alert(`Failed to cancel withdrawal: ${e.message}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Add Admin Notes
  const handleSaveAdminNotes = async () => {
    if (!selectedTx) return;
    playSound('CLICK');
    setIsProcessingAction(true);
    try {
      const collectionName = selectedTx.type === 'deposit' ? 'deposits' : 'withdrawals';
      const ref = doc(db, collectionName, selectedTx.id);
      await updateDoc(ref, {
        adminNotes: adminNotesInput
      });

      setSelectedTx(prev => prev ? { ...prev, adminNotes: adminNotesInput } : null);
      setActionMessage('Admin commentary logged successfully.');
      setTimeout(() => setActionMessage(null), 4000);
    } catch (e: any) {
      alert(`Failed to save admin notes: ${e.message}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // 9. Compute Custom SVG Chart Metrics
  const chartHeight = 120;
  const chartWidth = 500;
  
  // Tab index for chart toggles
  const [activeChartTab, setActiveChartTab] = useState<'deposits' | 'withdrawals' | 'revenue' | 'success'>('deposits');

  const maxVal = useMemo(() => {
    const vals = chartsData.map(d => {
      if (activeChartTab === 'deposits') return d.deposits;
      if (activeChartTab === 'withdrawals') return d.withdrawals;
      if (activeChartTab === 'revenue') return d.revenue;
      return d.successRate;
    });
    return Math.max(...vals, 10);
  }, [chartsData, activeChartTab]);

  return (
    <div className="space-y-6 text-left text-slate-100 font-sans">
      
      {/* Toast Alert Banner */}
      <AnimatePresence>
        {actionMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-emerald-950 border border-emerald-500/30 text-emerald-200 px-5 py-4 rounded-2xl shadow-2xl text-xs font-semibold"
          >
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{actionMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header operations controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/20 border border-white/5 p-6 rounded-3xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <h2 className="text-xl font-display font-black tracking-tight text-white uppercase">
              Payment Operations Suite
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Real-time transaction control console, automated liquidity routing logs, and risk controls.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => { playSound('CLICK'); setShowNotificationsDrawer(true); }}
            className="relative p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-slate-400 hover:text-white transition-all cursor-pointer"
            title="Notification Center"
          >
            <Bell className="w-5 h-5" />
            {alerts.filter(a => !a.read).length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#09090b]">
                {alerts.filter(a => !a.read).length}
              </span>
            )}
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5 text-xs font-bold transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Logs (CSV)</span>
          </button>
        </div>
      </div>

      {/* Secondary Sub-Tabs selection bar */}
      <div className="flex border-b border-white/5 overflow-x-auto pb-1 gap-1">
        {[
          { id: 'overview', label: 'Dashboard & Charts', icon: Activity },
          { id: 'monitor', label: 'Live Transaction Monitor', icon: Settings2, count: filteredTxList.length },
          { id: 'ledger', label: 'System Ledger', icon: FileText, count: transactions.length },
          { id: 'risk', label: 'Risk & Fraud Center', icon: Shield, count: flaggedTransactions.length },
          { id: 'notifications', label: 'Active Alerts', icon: Bell, count: alerts.length },
          { id: 'reliability', label: 'System Health & Jobs', icon: ShieldAlert, count: systemAlerts.filter(a => !a.resolved).length }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { playSound('CLICK'); setActiveTab(tab.id as any); }}
              className={`px-4 py-2.5 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all border shrink-0 flex items-center gap-2 ${
                isActive 
                  ? 'bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-500/10' 
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isActive ? 'bg-black/20 text-black' : 'bg-white/10 text-slate-300'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* RENDER ACTIVE TAB COMPONENT */}
      <AnimatePresence mode="wait">
        
        {/* TAB 1: OVERVIEW & ANALYTICS */}
        {activeTab === 'overview' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Live Stats Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              
              <div className="bg-[#111] border border-white/5 p-6 rounded-3xl space-y-2 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors" />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">Today's Deposits</p>
                <div className="flex items-baseline justify-between pt-1">
                  <h3 className="text-2xl font-black text-white">₹{(stats.totalDepositsToday * inrRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}</h3>
                  <span className="text-[9px] text-emerald-400 font-mono font-bold bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded">{stats.totalDepositsToday.toFixed(0)} USDT</span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium">Accumulated verified deposit credits</p>
              </div>

              <div className="bg-[#111] border border-white/5 p-6 rounded-3xl space-y-2 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors" />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">Today's Payouts</p>
                <div className="flex items-baseline justify-between pt-1">
                  <h3 className="text-2xl font-black text-white">₹{(stats.totalWithdrawalsToday * inrRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}</h3>
                  <span className="text-[9px] text-blue-400 font-mono font-bold bg-blue-500/5 border border-blue-500/10 px-1.5 py-0.5 rounded">{stats.totalWithdrawalsToday.toFixed(0)} USDT</span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium">Aggregated hot wallet withdrawals today</p>
              </div>

              <div className="bg-[#111] border border-white/5 p-6 rounded-3xl space-y-2 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-colors" />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">Pending Channels</p>
                <div className="flex items-center gap-4 pt-1">
                  <div>
                    <h4 className="text-2xl font-black text-amber-400">{stats.pendingDeposits}</h4>
                    <span className="text-[8px] uppercase tracking-wider font-mono text-slate-500">Deposits</span>
                  </div>
                  <div className="h-8 w-px bg-white/5" />
                  <div>
                    <h4 className="text-2xl font-black text-blue-400">{stats.pendingWithdrawals}</h4>
                    <span className="text-[8px] uppercase tracking-wider font-mono text-slate-500">Withdrawals</span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 font-medium">Awaiting manual approval or broadcast</p>
              </div>

              <div className="bg-[#111] border border-white/5 p-6 rounded-3xl space-y-2 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-colors" />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">All-Time volume</p>
                <div className="flex items-baseline justify-between pt-1">
                  <h3 className="text-2xl font-black text-white">₹{(stats.totalVolume * inrRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                  <span className="text-[9px] text-purple-400 font-mono font-bold bg-purple-500/5 border border-purple-500/10 px-1.5 py-0.5 rounded">{stats.totalVolume.toLocaleString()} USDT</span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium">Aggregated successfully processed value</p>
              </div>

              <div className="bg-[#111] border border-white/5 p-6 rounded-3xl space-y-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">Operations Health</p>
                <div className="flex items-baseline justify-between pt-1">
                  <h3 className="text-2xl font-black text-emerald-400">98.4%</h3>
                  <span className="text-[9px] text-emerald-400 font-mono font-bold bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded">OPTIMAL</span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium">Transaction settlement success rate</p>
              </div>

              <div className="bg-[#111] border border-white/5 p-6 rounded-3xl space-y-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">Completed tx count</p>
                <div className="flex items-baseline justify-between pt-1">
                  <h3 className="text-2xl font-black text-white">{stats.successfulTransactions}</h3>
                  <span className="text-[9px] text-slate-400 font-mono font-bold bg-white/5 px-1.5 py-0.5 rounded">{stats.failedTransactions} failed</span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium">Combined success log elements</p>
              </div>

              <div className="bg-[#111] border border-white/5 p-6 rounded-3xl space-y-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">Wagered / Active Users</p>
                <div className="flex items-baseline justify-between pt-1">
                  <h3 className="text-2xl font-black text-white">{stats.activeUsers}</h3>
                  <span className="text-[9px] text-emerald-400 font-mono font-bold bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded">ONLINE: {stats.onlineUsers}</span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium">Unique active account registrations</p>
              </div>

              <div className="bg-[#111] border border-white/5 p-6 rounded-3xl space-y-2">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">Platform Revenue (Est)</p>
                <div className="flex items-baseline justify-between pt-1">
                  <h3 className="text-2xl font-black text-emerald-400">₹{((stats.totalDepositsToday * 0.02 + stats.totalWithdrawalsToday * 0.01) * inrRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}</h3>
                  <span className="text-[9px] text-emerald-400 font-mono font-bold bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded">Fee-Based</span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium">Mock revenue (2% dep, 1% payouts)</p>
              </div>

            </div>

            {/* Analytics Dashboard Charts (SVG Rendered) */}
            <div className="bg-[#111] border border-white/5 rounded-3xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
                <div>
                  <h4 className="text-md font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Interactive Financial & Success Indicators
                  </h4>
                  <p className="text-[10px] text-slate-500 font-mono">LOG HISTORICAL TRENDS OVER THE PAST 7 CALENDAR DAYS</p>
                </div>

                <div className="flex p-1 bg-black/50 rounded-2xl border border-white/5">
                  {[
                    { id: 'deposits', label: 'Deposits', color: 'bg-emerald-500 text-emerald-950 font-bold' },
                    { id: 'withdrawals', label: 'Withdrawals', color: 'bg-blue-500 text-blue-950 font-bold' },
                    { id: 'revenue', label: 'Revenue', color: 'bg-purple-500 text-purple-950 font-bold' },
                    { id: 'success', label: 'Success Rate', color: 'bg-amber-500 text-amber-950 font-bold' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => { playSound('CLICK'); setActiveChartTab(tab.id as any); }}
                      className={`px-4 py-2 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all cursor-pointer border-0 ${
                        activeChartTab === tab.id ? tab.color : 'text-slate-400 hover:text-white bg-transparent'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Draw Custom Chart */}
              <div className="h-64 relative flex items-end">
                {/* Y-Axis Label */}
                <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[9px] font-mono text-slate-500">
                  <span>
                    {activeChartTab === 'success' ? '100%' : `₹${(maxVal * inrRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  </span>
                  <span>
                    {activeChartTab === 'success' ? '50%' : `₹${((maxVal / 2) * inrRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  </span>
                  <span>0</span>
                </div>

                {/* Main Graph Grid Lines */}
                <div className="absolute left-16 right-0 top-0 bottom-0 flex flex-col justify-between pointer-events-none">
                  <div className="border-b border-white/5 w-full" />
                  <div className="border-b border-white/5 w-full" />
                  <div className="border-b border-white/5 w-full" />
                </div>

                {/* SVG Visualizations Area */}
                <div className="absolute left-16 right-0 top-0 bottom-0">
                  <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop 
                          offset="0%" 
                          stopColor={
                            activeChartTab === 'deposits' ? '#10b981' : 
                            activeChartTab === 'withdrawals' ? '#3b82f6' : 
                            activeChartTab === 'revenue' ? '#a855f7' : '#f59e0b'
                          } 
                          stopOpacity={0.25} 
                        />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>

                    {/* Generate Points path */}
                    {(() => {
                      const points = chartsData.map((d, index) => {
                        const val = activeChartTab === 'deposits' ? d.deposits : 
                                    activeChartTab === 'withdrawals' ? d.withdrawals : 
                                    activeChartTab === 'revenue' ? d.revenue : d.successRate;
                        
                        const x = (index / (chartsData.length - 1)) * 100; // percent
                        const y = 100 - (val / maxVal) * 100; // percent
                        return { x, y, value: val, label: d.label };
                      });

                      const pathStr = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x}% ${p.y}%`).join(' ');
                      const areaStr = `${pathStr} L 100% 100% L 0% 100% Z`;

                      const color = 
                        activeChartTab === 'deposits' ? '#10b981' : 
                        activeChartTab === 'withdrawals' ? '#3b82f6' : 
                        activeChartTab === 'revenue' ? '#a855f7' : '#f59e0b';

                      return (
                        <>
                          {/* Fill Gradient Area */}
                          <path d={areaStr} fill="url(#chartGrad)" className="transition-all duration-500" style={{ vectorEffect: 'non-scaling-stroke' }} />
                          {/* Top stroke line */}
                          <path d={pathStr} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" className="transition-all duration-500" style={{ vectorEffect: 'non-scaling-stroke' }} />
                          
                          {/* Dots */}
                          {points.map((p, i) => (
                            <g key={i}>
                              <circle 
                                cx={`${p.x}%`} 
                                cy={`${p.y}%`} 
                                r={4} 
                                fill="#fff" 
                                stroke={color} 
                                strokeWidth={2}
                                className="cursor-pointer hover:r-6 transition-all"
                              />
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>

                {/* X-Axis labels */}
                <div className="absolute left-16 right-0 -bottom-6 flex justify-between text-[8px] font-mono text-slate-500 uppercase">
                  {chartsData.map((d, idx) => (
                    <span key={idx} className="w-16 text-center">{d.label}</span>
                  ))}
                </div>

              </div>

              {/* Extra Summary below charts */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-white/5 pt-10 text-slate-400 text-xs">
                <div>
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Average volume</span>
                  <strong className="text-sm text-white pt-1 block">
                    ₹{((chartsData.reduce((sum, d) => sum + d.deposits, 0) / 7) * inrRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </strong>
                </div>
                <div>
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Failed Attempts Logged</span>
                  <strong className="text-sm text-rose-400 pt-1 block">
                    {chartsData.reduce((sum, d) => sum + d.failedCount, 0)} transaction issues
                  </strong>
                </div>
                <div>
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Weekly Success Rate</span>
                  <strong className="text-sm text-emerald-400 pt-1 block">
                    {Math.round(chartsData.reduce((sum, d) => sum + d.successRate, 0) / 7)}% average
                  </strong>
                </div>
                <div>
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Est Profit Yield</span>
                  <strong className="text-sm text-white pt-1 block">
                    ₹{(chartsData.reduce((sum, d) => sum + d.revenue, 0) * inrRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>
            </div>

            {/* Quick alert bar if suspicious payouts found */}
            {flaggedTransactions.filter(f => f.riskScore >= 60 && f.status === 'pending').length > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-200 p-5 rounded-3xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 animate-bounce" />
                  <div>
                    <h5 className="font-bold text-sm text-white">Critical Payout Fraud Risk Alerts Detected</h5>
                    <p className="text-xs text-slate-400">
                      There are {flaggedTransactions.filter(f => f.riskScore >= 60 && f.status === 'pending').length} pending payouts flagged with suspicious risk scores &gt;= 60.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { playSound('CLICK'); setActiveTab('risk'); }}
                  className="px-4 py-2 rounded-xl bg-rose-500 text-black text-xs font-bold uppercase transition-all hover:bg-rose-400 cursor-pointer"
                >
                  Inspect Risk Board
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 2: TRANSACTION MONITOR */}
        {activeTab === 'monitor' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Filter and search control board */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-slate-900/40 p-4 border border-white/5 rounded-3xl">
              
              {/* Search bar */}
              <div className="lg:col-span-4 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search User, ID, Address or Hash..."
                  className="w-full bg-slate-950 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/30 font-mono"
                />
              </div>

              {/* Type filter */}
              <div className="lg:col-span-2">
                <select
                  value={typeFilter}
                  onChange={(e) => { playSound('CLICK'); setTypeFilter(e.target.value as any); }}
                  className="w-full bg-slate-950 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/30 cursor-pointer font-bold uppercase tracking-wider"
                >
                  <option value="all">Types: All</option>
                  <option value="deposit">Deposits</option>
                  <option value="withdrawal">Withdrawals</option>
                </select>
              </div>

              {/* Channel Filter */}
              <div className="lg:col-span-2">
                <select
                  value={providerFilter}
                  onChange={(e) => { playSound('CLICK'); setProviderFilter(e.target.value as any); }}
                  className="w-full bg-slate-950 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/30 cursor-pointer font-bold uppercase tracking-wider"
                >
                  <option value="all">Channels: All</option>
                  <option value="crypto">Crypto Direct</option>
                  <option value="upi">UPI Transfers</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="lg:col-span-2">
                <select
                  value={statusFilter}
                  onChange={(e) => { playSound('CLICK'); setStatusFilter(e.target.value as any); }}
                  className="w-full bg-slate-950 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/30 cursor-pointer font-bold uppercase tracking-wider"
                >
                  <option value="all">Statuses: All</option>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              {/* Quick statistics count */}
              <div className="lg:col-span-2 flex items-center justify-center bg-[#111] border border-white/5 rounded-xl text-[10px] font-mono text-slate-400 font-bold uppercase">
                Showing {filteredTxList.length} of {unifiedTransactions.length}
              </div>

            </div>

            {/* Main transaction ledger table */}
            {filteredTxList.length === 0 ? (
              <div className="bg-[#111] border border-white/5 rounded-3xl py-24 text-center text-slate-500 font-mono space-y-3">
                <AlertCircle className="w-10 h-10 text-emerald-400 opacity-20 mx-auto animate-pulse" />
                <p className="text-xs font-black uppercase text-slate-400">No Transaction Records matched search criteria</p>
                <p className="text-[10px] opacity-60">Verify filters and reset keyword strings.</p>
              </div>
            ) : (
              <div className="bg-[#111] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse font-mono text-xs">
                    <thead>
                      <tr className="bg-white/[0.01] border-b border-white/5 text-[9px] uppercase tracking-widest text-slate-500 font-bold">
                        <th className="p-4">Type</th>
                        <th className="p-4">User Details</th>
                        <th className="p-4 text-right">Amount</th>
                        <th className="p-4">Provider / Chain</th>
                        <th className="p-4">Reference Reference ID</th>
                        <th className="p-4">Risk Evaluation</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-[11px]">
                      {filteredTxList.map(tx => {
                        const isDeposit = tx.type === 'deposit';
                        
                        let badgeColor = 'text-slate-400 bg-slate-500/5 border-slate-500/10';
                        if (tx.status === 'completed') badgeColor = 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10';
                        if (tx.status === 'pending') badgeColor = 'text-amber-400 bg-amber-500/5 border-amber-500/10 animate-pulse';
                        if (tx.status === 'processing') badgeColor = 'text-blue-400 bg-blue-500/5 border-blue-500/10';
                        if (tx.status === 'failed') badgeColor = 'text-rose-400 bg-rose-500/5 border-rose-500/10';

                        let riskBadge = 'text-emerald-400 bg-emerald-500/5';
                        if (tx.riskScore >= 60) riskBadge = 'text-rose-400 bg-rose-500/10 border border-rose-500/20';
                        else if (tx.riskScore >= 30) riskBadge = 'text-amber-400 bg-amber-500/10 border border-amber-500/20';

                        return (
                          <tr key={`${tx.type}-${tx.id}`} className="hover:bg-white/[0.01] transition-colors">
                            {/* Type */}
                            <td className="p-4 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-sans text-[10px] font-black uppercase ${
                                isDeposit 
                                  ? 'bg-emerald-500/10 text-emerald-400' 
                                  : 'bg-blue-500/10 text-blue-400'
                              }`}>
                                {isDeposit ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                                {tx.type}
                              </span>
                            </td>

                            {/* User details */}
                            <td className="p-4 font-sans">
                              <p className="font-bold text-white text-xs">{tx.playerName}</p>
                              <p className="text-[10px] text-slate-500 font-mono pt-0.5 max-w-[150px] truncate" title={tx.playerEmail}>{tx.playerEmail}</p>
                            </td>

                            {/* Amount */}
                            <td className="p-4 text-right">
                              <p className="font-bold text-white text-xs">₹{(tx.amount * inrRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                              <p className="text-[10px] text-slate-400">{tx.amount.toFixed(2)} USDT</p>
                            </td>

                            {/* Provider / Network */}
                            <td className="p-4 font-sans">
                              <p className="font-bold text-white text-[11px]">{tx.provider}</p>
                              <p className="text-[10px] font-mono text-slate-500 pt-0.5 uppercase">{tx.network}</p>
                            </td>

                            {/* Reference Reference ID */}
                            <td className="p-4">
                              <span className="text-[10px] text-slate-400">#{tx.paymentId.slice(0, 10)}...</span>
                              {tx.transactionHash && (
                                <p className="text-[9px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <span>Hash:</span>
                                  <span className="max-w-[80px] truncate">{tx.transactionHash}</span>
                                  <button onClick={() => handleCopy(tx.transactionHash, tx.id)} className="text-slate-500 hover:text-white bg-transparent border-0 cursor-pointer">
                                    {copyFeedback[tx.id] ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                                  </button>
                                </p>
                              )}
                            </td>

                            {/* Risk Evaluation */}
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black ${riskBadge}`}>
                                {tx.riskScore === 0 ? 'NOMINAL' : `RISK SCORE: ${tx.riskScore}`}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="p-4 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${badgeColor}`}>
                                {tx.status.toUpperCase()}
                              </span>
                            </td>

                            {/* Action Buttons */}
                            <td className="p-4 text-right whitespace-nowrap font-sans">
                              <button
                                onClick={() => { playSound('CLICK'); setSelectedTx(tx); setAdminNotesInput(tx.adminNotes || ''); }}
                                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-bold text-[10px] uppercase transition-all inline-flex items-center gap-1 cursor-pointer border-0"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Inspect</span>
                              </button>
                            </td>

                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 3: RISK & FRAUD CONTROL PANEL */}
        {activeTab === 'risk' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Risk Indicators Header Banners */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              <div className="bg-rose-500/5 border border-rose-500/10 p-6 rounded-3xl space-y-2">
                <div className="flex justify-between items-start">
                  <span className="p-2.5 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
                    <ShieldAlert className="w-5 h-5 animate-pulse" />
                  </span>
                  <span className="text-[8px] bg-rose-500/10 text-rose-400 font-bold font-mono uppercase tracking-widest px-2 py-0.5 rounded">Active Blockers</span>
                </div>
                <h4 className="text-xl font-bold text-white pt-1">
                  {flaggedTransactions.filter(t => t.riskScore >= 60).length} High-Risk
                </h4>
                <p className="text-xs text-slate-400">Transactions failing security heuristics</p>
              </div>

              <div className="bg-amber-500/5 border border-amber-500/10 p-6 rounded-3xl space-y-2">
                <div className="flex justify-between items-start">
                  <span className="p-2.5 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/20">
                    <AlertTriangle className="w-5 h-5" />
                  </span>
                  <span className="text-[8px] bg-amber-500/10 text-amber-400 font-bold font-mono uppercase tracking-widest px-2 py-0.5 rounded">Warn List</span>
                </div>
                <h4 className="text-xl font-bold text-white pt-1">
                  {flaggedTransactions.filter(t => t.riskScore >= 30 && t.riskScore < 60).length} Elevated
                </h4>
                <p className="text-xs text-slate-400">Pending reviews for duplicate/repeated codes</p>
              </div>

              <div className="bg-[#111] border border-white/5 p-6 rounded-3xl space-y-2">
                <div className="flex justify-between items-start">
                  <span className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
                    <CheckCircle className="w-5 h-5" />
                  </span>
                  <span className="text-[8px] bg-emerald-500/10 text-emerald-400 font-bold font-mono uppercase tracking-widest px-2 py-0.5 rounded">Safe Settle</span>
                </div>
                <h4 className="text-xl font-bold text-white pt-1">
                  {unifiedTransactions.length - flaggedTransactions.length} Nominal
                </h4>
                <p className="text-xs text-slate-400">Verified transactions with 0 risk scores</p>
              </div>

            </div>

            {/* List of Risk Flagged Transactions */}
            <div className="bg-[#111] border border-white/5 rounded-3xl p-6 space-y-4">
              <div>
                <h4 className="text-md font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                  Real-time Fraud & Risk Assessment Board
                </h4>
                <p className="text-[10px] text-slate-500 font-mono">SYSTEM LOG OF DETECTED FRAUD INDICATORS & CONFLICT ALERTS</p>
              </div>

              {flaggedTransactions.length === 0 ? (
                <div className="text-center py-16 text-slate-500 font-mono space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto opacity-30" />
                  <p className="text-xs font-black uppercase text-slate-400">All security conditions clear</p>
                  <p className="text-[10px] opacity-60">No payment anomalies flagged across active ledger.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {flaggedTransactions.map(tx => {
                    const isHigh = tx.riskScore >= 60;
                    return (
                      <div 
                        key={`${tx.type}-${tx.id}`} 
                        className={`p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          isHigh 
                            ? 'bg-rose-500/[0.02] border-rose-500/15' 
                            : 'bg-amber-500/[0.01] border-amber-500/10'
                        }`}
                      >
                        <div className="space-y-2 flex-1 text-left">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className={`px-2.5 py-0.5 rounded text-[9px] font-black ${
                              isHigh ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'
                            }`}>
                              RISK SCORE: {tx.riskScore} / 100
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono font-black uppercase">
                              {tx.type.toUpperCase()} REQUEST
                            </span>
                            <span className="text-slate-600 font-mono">|</span>
                            <span className="text-white text-xs font-bold">{tx.playerName}</span>
                            <span className="text-slate-500 text-[10px]">({tx.playerEmail})</span>
                          </div>

                          <p className="text-xs text-white">
                            Transaction involving <strong className="text-emerald-400">₹{(tx.amount * inrRate).toLocaleString(undefined, { maximumFractionDigits: 2 })} ({tx.amount.toFixed(2)} USDT)</strong> via <span className="font-bold text-slate-200">{tx.provider} ({tx.network})</span>
                          </p>

                          {/* Risk Reasons Checklist */}
                          <div className="space-y-1.5 pt-1">
                            {tx.riskReasons.map((reason, index) => (
                              <p key={index} className="text-[10px] text-rose-400 flex items-start gap-1.5 leading-normal">
                                <span className="shrink-0 text-amber-500">⚠</span>
                                <span>{reason}</span>
                              </p>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 md:self-center">
                          {tx.status === 'pending' && (
                            <>
                              {tx.type === 'withdrawal' && (
                                <button
                                  disabled={isProcessingAction}
                                  onClick={() => handleCancelWithdrawal(tx)}
                                  className="px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 text-rose-400 font-bold text-[10px] uppercase transition-all cursor-pointer"
                                >
                                  Cancel & Refund
                                </button>
                              )}
                              {tx.type === 'deposit' && (
                                <button
                                  disabled={isProcessingAction}
                                  onClick={() => handleRetryPayment(tx)}
                                  className="px-3 py-2 rounded-xl bg-slate-800 border border-white/5 text-slate-300 font-bold text-[10px] uppercase transition-all cursor-pointer"
                                >
                                  Reset to Retry
                                </button>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => { playSound('CLICK'); setSelectedTx(tx); setAdminNotesInput(tx.adminNotes || ''); }}
                            className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-[10px] uppercase transition-all cursor-pointer border-0"
                          >
                            Inspect details
                          </button>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 4: ACTIVE ALERTS / NOTIFICATION CENTER */}
        {activeTab === 'notifications' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="bg-[#111] border border-white/5 rounded-3xl p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <div>
                  <h4 className="text-md font-bold text-white flex items-center gap-2">
                    <Bell className="w-4 h-4 text-emerald-400" />
                    Security Alerts & Event Streams
                  </h4>
                  <p className="text-[10px] text-slate-500 font-mono">REAL-TIME INCOMING CHANNELS, CRITICAL CIRCUIT BREAKERS & HEALTH LOGS</p>
                </div>
              </div>

              {alerts.length === 0 ? (
                <div className="text-center py-20 text-slate-500 font-mono space-y-2">
                  <Bell className="w-8 h-8 opacity-25 text-slate-500 mx-auto" />
                  <p className="text-xs">No notifications or logs broadcast yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5 font-sans">
                  {alerts.map(alert => {
                    let iconBg = 'bg-slate-500/10 text-slate-400 border-slate-500/10';
                    let alertIcon = '🔔';
                    if (alert.severity === 'error') {
                      iconBg = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                      alertIcon = '🚨';
                    } else if (alert.severity === 'warning') {
                      iconBg = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                      alertIcon = '⚠️';
                    } else {
                      iconBg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                      alertIcon = '✓';
                    }

                    return (
                      <div key={alert.id} className="py-4 flex gap-4 text-left items-start">
                        <span className={`w-10 h-10 rounded-xl shrink-0 border flex items-center justify-center text-lg ${iconBg}`}>
                          {alertIcon}
                        </span>
                        <div className="space-y-1 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h5 className="font-bold text-sm text-white">{alert.title}</h5>
                            <span className="text-[8px] font-mono text-slate-500">
                              {new Date(alert.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 leading-normal">{alert.message}</p>
                          <div className="flex items-center gap-2 pt-1 font-mono text-[9px]">
                            <span className="text-slate-500">CHANNEL:</span>
                            <span className="text-slate-400 uppercase font-black">{alert.type}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 5: CENTRALIZED SYSTEM HEALTH & BACKGROUND JOBS MANAGER */}
        {activeTab === 'reliability' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* System Status Summary Banner */}
            <div className={`p-6 rounded-3xl border text-left flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
              systemHealth?.status === 'degraded' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
              systemHealth?.status === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
              'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}>
              <div className="flex gap-4 items-center">
                <span className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border ${
                  systemHealth?.status === 'degraded' ? 'bg-rose-500/10 border-rose-500/20' :
                  systemHealth?.status === 'warning' ? 'bg-amber-500/10 border-amber-500/20' :
                  'bg-emerald-500/10 border-emerald-500/20'
                }`}>
                  {systemHealth?.status === 'degraded' ? '🚨' : systemHealth?.status === 'warning' ? '⚠️' : '🛡️'}
                </span>
                <div>
                  <h4 className="text-md font-bold text-white flex items-center gap-2">
                    Overall System Reliability status: 
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase ${
                      systemHealth?.status === 'degraded' ? 'bg-rose-500 text-black' :
                      systemHealth?.status === 'warning' ? 'bg-amber-500 text-black' :
                      'bg-emerald-500 text-black'
                    }`}>
                      {systemHealth?.status || 'HEALTHY'}
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed mt-1">
                    Continuous monitoring of blockchain hot wallets, database latency, merchant APIs, and automated cron task queues.
                  </p>
                </div>
              </div>

              <div className="text-right text-[10px] font-mono text-slate-500">
                <p>LAST HEURISTIC REFRESH:</p>
                <p className="text-white font-bold">{systemHealth?.timestamp ? new Date(systemHealth.timestamp).toLocaleString() : 'Just Now'}</p>
              </div>
            </div>

            {/* Core Service Diagnostics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
              {/* 1. Firebase Service */}
              <div className="bg-[#111] border border-white/5 rounded-3xl p-6 text-left space-y-4">
                <div className="flex justify-between items-start">
                  <h5 className="text-xs font-bold font-mono text-slate-500 uppercase tracking-wider">Firebase Cloud Database</h5>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                    systemHealth?.services?.firebase?.status === 'healthy' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    {systemHealth?.services?.firebase?.status || 'Online'}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Ping Latency:</span>
                    <span className="text-white font-bold">{systemHealth?.services?.firebase?.latencyMs || '12'} ms</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Connection State:</span>
                    <span className="text-emerald-400 font-bold">Stable</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Datastore Target:</span>
                    <span className="text-slate-300 font-bold truncate max-w-[100px]" title="applet-primary">applet-primary</span>
                  </div>
                </div>
              </div>

              {/* 2. Wallet Infrastructure */}
              <div className="bg-[#111] border border-white/5 rounded-3xl p-6 text-left space-y-4">
                <div className="flex justify-between items-start">
                  <h5 className="text-xs font-bold font-mono text-slate-500 uppercase tracking-wider">Wallet Infrastructure</h5>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                    systemHealth?.services?.walletProvider?.status === 'healthy' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {systemHealth?.services?.walletProvider?.status || 'Healthy'}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Active Provider:</span>
                    <span className="text-white font-bold uppercase">{systemHealth?.services?.walletProvider?.activeProvider || 'MockAdapter'}</span>
                  </div>
                  <div className="space-y-1 mt-1 border-t border-white/5 pt-2">
                    <span className="text-[10px] text-slate-500 font-mono block uppercase">Liquidity Assets:</span>
                    {Object.entries(systemHealth?.services?.walletProvider?.balances || {
                      'USDT TRC20': 4850,
                      'USDT BEP20': 2500,
                      'USDT ERC20': 8900
                    }).map(([net, bal]: [string, any]) => (
                      <div key={net} className="flex justify-between text-[10px] font-mono">
                        <span className="text-slate-400">{net}:</span>
                        <span className={`font-black ${bal < 1000 ? 'text-rose-400 animate-pulse' : 'text-slate-200'}`}>
                          {bal.toLocaleString()} USDT
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3. Payment Provider Gateways */}
              <div className="bg-[#111] border border-white/5 rounded-3xl p-6 text-left space-y-4">
                <div className="flex justify-between items-start">
                  <h5 className="text-xs font-bold font-mono text-slate-500 uppercase tracking-wider">Payment Gateways</h5>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20`}>
                    Stable
                  </span>
                </div>
                <div className="space-y-1.5 pt-1">
                  {(systemHealth?.services?.paymentGateway?.activeProviders || [
                    { id: 'cryptodirect', name: 'CryptoDirect', status: 'Online', failures: 0 },
                    { id: 'nowpayments', name: 'NOWPayments', status: 'Online', failures: 0 },
                    { id: 'upi', name: 'UPI Gateway', status: 'Online', failures: 0 }
                  ]).map((p: any) => (
                    <div key={p.id} className="flex justify-between items-center text-[10px] font-mono">
                      <span className="text-slate-400">{p.name}:</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${p.status === 'Offline' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                        <span className={`font-bold ${p.status === 'Offline' ? 'text-rose-400 font-black' : 'text-white'}`}>{p.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. API & Resource Monitors */}
              <div className="bg-[#111] border border-white/5 rounded-3xl p-6 text-left space-y-4">
                <div className="flex justify-between items-start">
                  <h5 className="text-xs font-bold font-mono text-slate-500 uppercase tracking-wider">API Resources</h5>
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Normal
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Process Uptime:</span>
                    <span className="text-white font-bold">{Math.round(systemHealth?.services?.systemResources?.uptimeSec || 320)}s</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Memory Heap:</span>
                    <span className="text-white font-bold">{systemHealth?.services?.systemResources?.memoryUsageMb || '48'} MB</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Webhook Receiver:</span>
                    <span className="text-emerald-400 font-bold uppercase">Active</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Background Job Manager Scheduler Console */}
            <div className="bg-[#111] border border-white/5 rounded-3xl p-6 space-y-4 text-left">
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <div>
                  <h4 className="text-md font-bold text-white flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-emerald-400" />
                    Automated Background Job Manager (Cron Engine)
                  </h4>
                  <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                    Scheduled tasks executing continuous deposit verification, webhook recovery, and ledger archiving
                  </p>
                </div>
              </div>

              {/* Feedback toast */}
              {jobFeedbackMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-slate-800 text-slate-200 border border-white/10 text-xs font-mono"
                >
                  {jobFeedbackMessage}
                </motion.div>
              )}

              {/* Job Manager Grid */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-sans">
                  <thead>
                    <tr className="border-b border-white/5 text-slate-500 font-mono uppercase text-[9px] tracking-wider">
                      <th className="py-3 px-4">Job / Scheduled Thread Name</th>
                      <th className="py-3 px-4">Interval</th>
                      <th className="py-3 px-4">Last Executed</th>
                      <th className="py-3 px-4">Latency</th>
                      <th className="py-3 px-4">Runs</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Operations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                    {[
                      { key: 'verifyPendingDeposits', title: 'Verify Pending Deposits', desc: 'Queries pending blockchain hashes or payment requests to reconcile balance credit.', freq: 'Every 60s' },
                      { key: 'retryFailedWebhooks', title: 'Retry Missed Webhooks', desc: 'Identifies uncredited deposits that failed signatures and runs auto-recovery.', freq: 'Every 60s' },
                      { key: 'retryFailedWithdrawals', title: 'Retry Stalled Withdrawals', desc: 'Scans for processing withdrawals stuck in broadcast queues to re-submit.', freq: 'Every 60s' },
                      { key: 'verifyCompletedBlockchainTx', title: 'Verify On-Chain Tx Finalization', desc: 'Validates txn hashes against mainnets (TRON, BSC) to confirm complete safety.', freq: 'Every 60s' },
                      { key: 'cleanExpiredSessions', title: 'Clean Expired Payment Sessions', desc: 'Cancels pending deposit requests older than 24 hours to keep collections clean.', freq: 'Every 60s' },
                      { key: 'removeStaleRecords', title: 'Remove Stale Pending Records', desc: 'Safely removes legacy temporary test records and debug documents.', freq: 'Every 60s' },
                      { key: 'archiveOldLogs', title: 'Archive Legacy Activity Logs', desc: 'Summarizes and rolls up auditLogs older than 30 days to free storage index.', freq: 'Every 60s' }
                    ].map((job) => {
                      const stats = systemHealth?.jobs?.[job.key] || { lastRun: null, durationMs: 0, status: 'Idle', error: null, runCount: 0 };
                      const isRunning = runningJobName === job.key || stats.status === 'Running';
                      const isSuccess = stats.status === 'Success';
                      const isFailed = stats.status === 'Failed';

                      return (
                        <tr key={job.key} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="py-4 px-4 text-left">
                            <span className="text-white font-bold block text-xs group-hover:text-emerald-400 transition-colors">{job.title}</span>
                            <span className="text-[9px] text-slate-500 font-sans block mt-0.5">{job.desc}</span>
                          </td>
                          <td className="py-4 px-4 text-slate-400">{job.freq}</td>
                          <td className="py-4 px-4 text-slate-300">
                            {stats.lastRun ? new Date(stats.lastRun).toLocaleTimeString() : 'Never'}
                          </td>
                          <td className="py-4 px-4 text-slate-400">
                            {stats.durationMs ? `${stats.durationMs}ms` : '0ms'}
                          </td>
                          <td className="py-4 px-4 text-slate-300">{stats.runCount || 0}</td>
                          <td className="py-4 px-4">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                              isRunning ? 'bg-blue-500/10 text-blue-400 border border-blue-500/15 animate-pulse' :
                              isSuccess ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' :
                              isFailed ? 'bg-rose-500/10 text-rose-400 border border-rose-500/15' :
                              'bg-slate-800 text-slate-400 border border-white/5'
                            }`}>
                              {stats.status}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-right">
                            <button
                              disabled={isRunning || adminRole === 'Support'}
                              onClick={() => handleTriggerJob(job.key)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black font-bold uppercase transition-all flex items-center gap-1 inline-flex cursor-pointer disabled:opacity-40 disabled:hover:bg-emerald-500/10 disabled:hover:text-emerald-400 disabled:cursor-not-allowed border-0 text-[10px]"
                            >
                              {isRunning ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <PlayCircle className="w-3 h-3" />
                              )}
                              <span>Run Now</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Centralized Alarm Registry & Security alerts */}
            <div className="bg-[#111] border border-white/5 rounded-3xl p-6 space-y-4 text-left">
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <div>
                  <h4 className="text-md font-bold text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-500 animate-pulse" />
                    Central System Alarms & Security alerts Feed
                  </h4>
                  <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                    Incidents and anomaly records requiring administrative authorization & resolution
                  </p>
                </div>
              </div>

              {systemAlerts.length === 0 ? (
                <div className="text-center py-16 text-slate-500 font-mono space-y-2">
                  <span className="text-2xl block text-emerald-400 font-bold">✓</span>
                  <p className="text-xs">All channels reporting nominal metrics. No active alarm logs.</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {systemAlerts.map((alert: any) => {
                    let sevColor = 'text-slate-400 border-white/5 bg-white/5';
                    if (alert.severity === 'error') sevColor = 'text-rose-400 border-rose-500/15 bg-rose-500/5';
                    if (alert.severity === 'warning') sevColor = 'text-amber-400 border-amber-500/15 bg-amber-500/5';

                    return (
                      <div key={alert.id} className="py-4 flex gap-4 items-start text-left justify-between">
                        <div className="flex gap-4 items-start">
                          <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm border font-bold ${sevColor}`}>
                            {alert.severity === 'error' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️'}
                          </span>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h5 className="font-bold text-sm text-white">{alert.title}</h5>
                              {alert.resolved ? (
                                <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-[8px] font-black uppercase px-1.5 py-0.5 rounded font-mono">
                                  Resolved
                                </span>
                              ) : (
                                <span className="bg-rose-500/15 text-rose-400 border border-rose-500/20 text-[8px] font-black uppercase px-1.5 py-0.5 rounded font-mono animate-pulse">
                                  Active Alert
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 max-w-2xl">{alert.message}</p>
                            <div className="flex gap-4 text-[9px] font-mono text-slate-500 pt-1">
                              <span>CATEGORY: <strong className="text-slate-300 uppercase">{alert.type}</strong></span>
                              <span>BROADCAST TIME: <strong className="text-slate-300">{new Date(alert.timestamp).toLocaleString()}</strong></span>
                              {alert.resolvedAt && (
                                <span className="text-emerald-500">RESOLVED AT: {new Date(alert.resolvedAt).toLocaleTimeString()}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {!alert.resolved && (
                          <button
                            disabled={adminRole === 'Support'}
                            onClick={() => handleResolveAlert(alert.docId)}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-500 text-slate-300 hover:text-black font-bold uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed text-[10px] border-0 shrink-0 cursor-pointer"
                          >
                            Resolve Alert
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 6: CENTRAL SYSTEM LEDGER */}
        {activeTab === 'ledger' && (() => {
          // Inline filtering inside tab block
          const filteredLedgerTxns = transactions.filter(t => {
            if (ledgerSearch.trim()) {
              const term = ledgerSearch.toLowerCase();
              const player = players.find(p => p.id === t.playerId || p.id === t.userId);
              const name = (player?.name || 'Unknown').toLowerCase();
              const email = (player?.email || '').toLowerCase();
              const desc = (t.description || '').toLowerCase();
              const id = t.id.toLowerCase();
              const refId = (t.referenceId || '').toLowerCase();

              const match = 
                id.includes(term) ||
                refId.includes(term) ||
                name.includes(term) ||
                email.includes(term) ||
                desc.includes(term);

              if (!match) return false;
            }

            if (ledgerTypeFilter !== 'all') {
              if (t.type !== ledgerTypeFilter) return false;
            }

            if (ledgerStatusFilter !== 'all') {
              if (t.status !== ledgerStatusFilter) return false;
            }

            return true;
          });

          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Ledger Summary Stats Bento Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[#111] border border-white/5 rounded-3xl p-6 text-left">
                  <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest font-black block mb-1">Ledger Records</span>
                  <span className="text-3xl font-display font-bold text-white tracking-tight">{transactions.length}</span>
                  <span className="text-[10px] text-slate-400 block mt-1 font-mono">TOTAL TRANSACTIONS IN INDEX</span>
                </div>
                <div className="bg-[#111] border border-white/5 rounded-3xl p-6 text-left">
                  <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest font-black block mb-1">Filtered Results</span>
                  <span className="text-3xl font-display font-bold text-emerald-400 tracking-tight">{filteredLedgerTxns.length}</span>
                  <span className="text-[10px] text-slate-400 block mt-1 font-mono">MATCHING CURRENT FILTERS</span>
                </div>
                <div className="bg-[#111] border border-white/5 rounded-3xl p-6 text-left">
                  <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest font-black block mb-1">Total Volume</span>
                  <span className="text-3xl font-display font-bold text-blue-400 tracking-tight">
                    ₹{(filteredLedgerTxns.reduce((sum, t) => sum + (t.amount || 0), 0) * 83.50).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-1 font-mono">CONVERTED TO INR AT ₹83.50</span>
                </div>
                <div className="bg-[#111] border border-white/5 rounded-3xl p-6 text-left">
                  <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest font-black block mb-1">Pending Requests</span>
                  <span className="text-3xl font-display font-bold text-amber-500 tracking-tight">
                    {filteredLedgerTxns.filter(t => t.status === 'pending').length}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-1 font-mono">RECORDS REQUIRING ATTENTION</span>
                </div>
              </div>

              {/* Filtering Control Bar */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-slate-900/40 p-4 border border-white/5 rounded-3xl">
                {/* Search */}
                <div className="lg:col-span-5 relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Search ID, Player Name, Email or Description..."
                    className="w-full bg-slate-950 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/30 font-mono"
                  />
                </div>

                {/* Ledger Type selection */}
                <div className="lg:col-span-3">
                  <select
                    value={ledgerTypeFilter}
                    onChange={(e) => { playSound('CLICK'); setLedgerTypeFilter(e.target.value as any); }}
                    className="w-full bg-slate-950 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/30 cursor-pointer font-bold uppercase tracking-wider"
                  >
                    <option value="all">Types: All</option>
                    <option value="deposit">Deposits</option>
                    <option value="withdrawal">Withdrawals</option>
                    <option value="game_win">Game Wins</option>
                    <option value="game_loss">Game Losses</option>
                    <option value="bonus">Referral / Bonus</option>
                    <option value="admin_adjustment">Admin Adjustments</option>
                  </select>
                </div>

                {/* Status selection */}
                <div className="lg:col-span-2">
                  <select
                    value={ledgerStatusFilter}
                    onChange={(e) => { playSound('CLICK'); setLedgerStatusFilter(e.target.value as any); }}
                    className="w-full bg-slate-950 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500/30 cursor-pointer font-bold uppercase tracking-wider"
                  >
                    <option value="all">Statuses: All</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>

                {/* Count and clear */}
                <div className="lg:col-span-2 flex items-center justify-center bg-[#111] border border-white/5 rounded-xl text-[10px] font-mono text-slate-400 font-bold uppercase">
                  Count: {filteredLedgerTxns.length}
                </div>
              </div>

              {/* Transactions Ledger Table */}
              <div className="bg-[#111] border border-white/5 rounded-3xl p-6 text-left">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-sans">
                    <thead>
                      <tr className="border-b border-white/5 text-slate-500 font-mono uppercase text-[9px] tracking-wider">
                        <th className="py-3 px-4">Timestamp</th>
                        <th className="py-3 px-4">Transaction ID</th>
                        <th className="py-3 px-4">User</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4 text-right">Amount (USDT)</th>
                        <th className="py-3 px-4 text-right">Balance Before</th>
                        <th className="py-3 px-4 text-right">Balance After</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                      {filteredLedgerTxns.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-16 text-center text-slate-500 font-sans">
                            No matching transaction records found in the system ledger.
                          </td>
                        </tr>
                      ) : (
                        filteredLedgerTxns.map((t) => {
                          const player = players.find(p => p.id === t.playerId || p.id === t.userId);
                          const isPositive = t.type === 'deposit' || t.type === 'game_win' || t.type === 'bonus' || (t.type === 'admin_adjustment' && (t.balanceAfter ?? 0) >= (t.balanceBefore ?? 0));
                          
                          let typeLabel: string = t.type;
                          let typeColor = 'bg-slate-800 text-slate-400 border border-white/5';
                          if (t.type === 'deposit') {
                            typeLabel = 'DEPOSIT';
                            typeColor = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                          } else if (t.type === 'withdrawal') {
                            typeLabel = 'WITHDRAWAL';
                            typeColor = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
                          } else if (t.type === 'game_win' || t.type === 'win') {
                            typeLabel = 'GAME WIN';
                            typeColor = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                          } else if (t.type === 'game_loss' || t.type === 'bet') {
                            typeLabel = 'GAME LOSS';
                            typeColor = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
                          } else if (t.type === 'bonus') {
                            typeLabel = 'BONUS CREDITED';
                            typeColor = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                          } else if (t.type === 'admin_adjustment') {
                            typeLabel = 'ADMIN ADJUST';
                            typeColor = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
                          }

                          return (
                            <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                                {new Date(t.timestamp).toLocaleDateString()} {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="py-3 px-4 text-white font-bold max-w-[120px] truncate" title={t.id}>
                                {t.id}
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-white font-bold block">{player?.name || 'Unknown'}</span>
                                <span className="text-[9px] text-slate-500 block">{player?.email || t.playerId || 'No email'}</span>
                              </td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${typeColor}`}>
                                  {typeLabel}
                                </span>
                              </td>
                              <td className={`py-3 px-4 text-right font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isPositive ? '+' : '-'}{t.amount?.toFixed(2)} USDT
                              </td>
                              <td className="py-3 px-4 text-right text-slate-400">
                                {t.balanceBefore !== undefined ? `${t.balanceBefore.toFixed(2)} USDT` : '--'}
                              </td>
                              <td className="py-3 px-4 text-right text-slate-300 font-semibold">
                                {t.balanceAfter !== undefined ? `${t.balanceAfter.toFixed(2)} USDT` : '--'}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                  t.status === 'completed' || t.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400' :
                                  t.status === 'pending' || t.status === 'processing' ? 'bg-amber-500/10 text-amber-400 animate-pulse' :
                                  'bg-rose-500/10 text-rose-400'
                                }`}>
                                  {t.status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-slate-400 max-w-[180px] truncate" title={t.description || ''}>
                                {t.description || t.referenceId || '--'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          );
        })()}

      </AnimatePresence>

      {/* DETAILED TRANSACTION INSPECT MODAL */}
      <AnimatePresence>
        {selectedTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#0c0c0e] border border-white/10 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative text-left"
            >
              {/* Close Button */}
              <button
                onClick={() => { playSound('CLICK'); setSelectedTx(null); }}
                className="absolute top-6 right-6 text-slate-400 hover:text-white p-2 rounded-xl bg-white/5 hover:bg-white/10 border-0 cursor-pointer transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>

              {/* Modal Header */}
              <div className="border-b border-white/5 pb-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`px-3 py-1 rounded-full font-bold text-[10px] uppercase ${
                    selectedTx.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                  }`}>
                    {selectedTx.type.toUpperCase()} REQUEST
                  </span>
                  
                  <span className={`px-2.5 py-0.5 rounded font-mono text-[9px] font-black ${
                    selectedTx.riskScore >= 60 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/15' : 
                    selectedTx.riskScore >= 30 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/15' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                  }`}>
                    RISK SCORE: {selectedTx.riskScore}
                  </span>
                </div>
                <h3 className="text-lg font-display font-black text-white pt-2">
                  Transaction #{selectedTx.id.slice(0, 15)}...
                </h3>
              </div>

              {/* 2 Column Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300">
                <div className="space-y-4">
                  <div>
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Associated Player Account</span>
                    <strong className="text-white pt-0.5 block">{selectedTx.playerName}</strong>
                    <span className="text-[10px] text-slate-500 font-mono">{selectedTx.playerEmail}</span>
                    <p className="text-[9px] text-slate-500 font-mono pt-1">Player ID: {selectedTx.playerId}</p>
                  </div>

                  <div>
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Financial Volumes</span>
                    <strong className="text-white text-md pt-0.5 block">
                      ₹{(selectedTx.amount * inrRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                    <span className="text-[10px] text-emerald-400 font-mono">{selectedTx.amount.toFixed(2)} USDT</span>
                  </div>

                  <div>
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Provider Channel & Chain</span>
                    <strong className="text-white pt-0.5 block">{selectedTx.provider}</strong>
                    <span className="text-[10px] text-slate-500 font-mono uppercase">Network: {selectedTx.network}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Created Time</span>
                    <p className="text-white pt-0.5 font-mono">{new Date(selectedTx.createdAt).toLocaleString()}</p>
                  </div>

                  <div>
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Updated/Settled Time</span>
                    <p className="text-white pt-0.5 font-mono">{new Date(selectedTx.updatedAt).toLocaleString()}</p>
                  </div>

                  <div>
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Transaction Reference References</span>
                    <p className="text-white font-mono text-[10px] pt-0.5 select-all truncate">Ref: {selectedTx.paymentId}</p>
                    {selectedTx.transactionHash && (
                      <p className="text-slate-400 font-mono text-[10px] select-all truncate pt-1">
                        Hash: {selectedTx.transactionHash}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Upload screenshot display if applicable */}
              {selectedTx.screenshotUrl && (
                <div className="border-t border-white/5 pt-4 space-y-2">
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Submitted Verification Receipt</span>
                  <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/40 p-1 flex justify-center max-h-48">
                    <img 
                      src={selectedTx.screenshotUrl} 
                      alt="Payment Reference Verification Receipt" 
                      className="max-h-44 rounded-xl object-contain"
                      referrerPolicy="no-referrer"
                    />
                    <a
                      href={selectedTx.screenshotUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-3 right-3 p-2 bg-black/80 hover:bg-black text-white rounded-lg flex items-center gap-1.5 font-sans font-bold text-[9px] uppercase border border-white/10 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Full screen view</span>
                    </a>
                  </div>
                </div>
              )}

              {/* Security Heuristics */}
              {selectedTx.riskScore > 0 && (
                <div className="border-t border-white/5 pt-4 space-y-2 bg-rose-500/[0.01] p-4 rounded-2xl border border-rose-500/10 text-left">
                  <span className="text-[9px] font-mono text-rose-400 uppercase tracking-widest font-black block">
                    Security Risk Conflict Heuristics Detained
                  </span>
                  <div className="space-y-1">
                    {selectedTx.riskReasons.map((reason, index) => (
                      <p key={index} className="text-xs text-rose-400 leading-relaxed">
                        ⚠️ {reason}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin Commentary Box */}
              <div className="border-t border-white/5 pt-4 space-y-2">
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Admin Operations Commentary</span>
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    value={adminNotesInput}
                    onChange={(e) => setAdminNotesInput(e.target.value)}
                    placeholder="Enter security audit commentary, manual transaction hashes or approval notes..."
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/40 font-mono resize-none"
                  />
                  <button
                    disabled={isProcessingAction}
                    onClick={handleSaveAdminNotes}
                    className="px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer border-0 shrink-0 self-stretch flex items-center justify-center"
                  >
                    Log Notes
                  </button>
                </div>
              </div>

              {/* Action Buttons Panel */}
              <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row gap-3 justify-between items-center text-xs">
                <div>
                  <span className="text-[9px] font-mono text-slate-500 uppercase block">Active Request Status</span>
                  <span className="text-white font-bold uppercase pt-0.5 block text-xs">{selectedTx.status}</span>
                </div>

                <div className="flex flex-wrap gap-2.5 w-full sm:w-auto justify-end">
                  {selectedTx.status === 'failed' && (
                    <>
                      {selectedTx.type === 'deposit' ? (
                        <button
                          disabled={isProcessingAction}
                          onClick={() => handleRetryPayment(selectedTx)}
                          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-500 text-emerald-950 font-bold hover:bg-emerald-400 transition-colors flex items-center justify-center gap-1.5 cursor-pointer border-0"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry Deposit</span>
                        </button>
                      ) : (
                        <button
                          disabled={isProcessingAction}
                          onClick={() => handleRetryWithdrawal(selectedTx)}
                          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-500 text-emerald-950 font-bold hover:bg-emerald-400 transition-colors flex items-center justify-center gap-1.5 cursor-pointer border-0"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry Withdrawal</span>
                        </button>
                      )}
                    </>
                  )}

                  {selectedTx.status === 'pending' && selectedTx.type === 'withdrawal' && (
                    <button
                      disabled={isProcessingAction}
                      onClick={() => handleCancelWithdrawal(selectedTx)}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 font-bold border border-rose-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Cancel & Refund Payout</span>
                    </button>
                  )}

                  <button
                    onClick={() => { playSound('CLICK'); setSelectedTx(null); }}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-bold transition-colors cursor-pointer border-0 text-center"
                  >
                    Dismiss
                  </button>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DETAILED NOTIFICATIONS SIDEBAR DRAWER */}
      <AnimatePresence>
        {showNotificationsDrawer && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm">
            {/* Backdrop Close Click */}
            <div className="absolute inset-0 cursor-pointer" onClick={() => { playSound('CLICK'); setShowNotificationsDrawer(false); }} />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md h-full bg-[#0d0d0f] border-l border-white/10 p-6 flex flex-col shadow-2xl overflow-hidden text-left"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/5 pb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-emerald-400 animate-pulse" />
                  <div>
                    <h4 className="font-display font-black text-base text-white uppercase">Notification Center</h4>
                    <p className="text-[9px] text-slate-500 font-mono">REAL-TIME INCOMING TELEMETRY LOGS & NOTICES</p>
                  </div>
                </div>
                
                <button
                  onClick={() => { playSound('CLICK'); setShowNotificationsDrawer(false); }}
                  className="p-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl cursor-pointer border-0 transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Feed Stream */}
              <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
                {alerts.length === 0 ? (
                  <div className="text-center py-20 text-slate-500 font-mono text-xs">
                    No active notifications log broadcast yet.
                  </div>
                ) : (
                  alerts.map(alert => {
                    let alertColor = 'text-slate-400 bg-slate-500/5 border-slate-500/10';
                    let symbol = '🔔';
                    
                    if (alert.severity === 'error') {
                      alertColor = 'text-rose-400 bg-rose-500/10 border border-rose-500/15';
                      symbol = '🚨';
                    } else if (alert.severity === 'warning') {
                      alertColor = 'text-amber-400 bg-amber-500/10 border border-amber-500/15';
                      symbol = '⚠️';
                    } else {
                      alertColor = 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/15';
                      symbol = '✓';
                    }

                    return (
                      <div key={alert.id} className="p-4 rounded-2xl border bg-[#111114] border-white/5 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black font-mono uppercase tracking-widest ${alertColor}`}>
                            {symbol} {alert.type}
                          </span>
                          <span className="text-[8px] font-mono text-slate-500">
                            {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <h5 className="font-bold text-xs text-white leading-snug">{alert.title}</h5>
                        <p className="text-[11px] text-slate-400 leading-relaxed font-sans">{alert.message}</p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-white/5 pt-4 mt-auto shrink-0 font-mono text-[8px] text-slate-500 flex justify-between items-center">
                <span>CHANNELS ONLINE: 5 ACTIVE</span>
                <span>UTC TIME: {new Date().toUTCString().split(' ')[4]}</span>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
