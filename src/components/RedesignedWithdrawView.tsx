import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Coins, 
  Shield, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Wallet, 
  Info, 
  ExternalLink, 
  XCircle, 
  Sparkles,
  Search,
  Copy,
  Check,
  Trash2,
  Activity
} from 'lucide-react';
import { WithdrawalNetwork, WithdrawalSettings, Player, WithdrawalRequest } from '../types.ts';
import { DEFAULT_RATES } from '../lib/currency.ts';

// Helper to convert USD to target currency
const getCurrencySymbol = (code: string) => {
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', INR: '₹', AED: 'د.إ', 
    PKR: '₨', CAD: 'C$', CNY: '¥', JPY: '¥'
  };
  return symbols[code] || '$';
};

const formatCurrencyValue = (val: number, code: string, rates: Record<string, number>) => {
  const rate = rates[code] || 1;
  const converted = val * rate;
  return converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const validateAddress = (address: string, networkId: string): boolean => {
  const addr = address.trim();
  if (!addr) return false;
  switch (networkId) {
    case 'tron':
      return /^T[a-km-zA-HJ-NP-Z1-9]{33}$/.test(addr);
    case 'eth':
    case 'bsc':
    case 'polygon':
      return /^0x[a-fA-F0-9]{40}$/.test(addr);
    case 'btc':
      return /^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$|^(bc1)[a-zA-HJ-NP-Z0-9]{25,59}$/.test(addr);
    case 'sol':
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
    case 'ltc':
      return /^(L|M|3)[a-km-zA-HJ-NP-Z1-9]{26,33}$|^(ltc1)[a-zA-HJ-NP-Z0-9]{25,59}$/.test(addr);
    default:
      return addr.length >= 10;
  }
};

interface RedesignedWithdrawViewProps {
  withdrawalNetworks: WithdrawalNetwork[];
  withdrawalSettings?: WithdrawalSettings;
  currentPlayer: Player;
  withdrawalsHistory: WithdrawalRequest[];
  onBack: () => void;
  onWithdraw: (amountUsd: number, networkId: string, walletAddress: string, feeUsd: number, prefCurrency?: string, exRate?: number, prefAmount?: number) => Promise<void>;
  preferredCurrency: string;
  rates: Record<string, number>;
  playSound: (sound: 'CLICK' | 'WIN' | 'LOSE' | 'BET' | 'SPIN') => void;
}

interface SavedWallet {
  id: string;
  label: string;
  address: string;
  networkId: string;
}

export function RedesignedWithdrawView({
  withdrawalNetworks,
  withdrawalSettings,
  currentPlayer,
  withdrawalsHistory,
  onBack,
  onWithdraw,
  preferredCurrency,
  rates,
  playSound
}: RedesignedWithdrawViewProps) {
  // Local storage for saved wallets
  const [savedWallets, setSavedWallets] = useState<SavedWallet[]>(() => {
    const raw = localStorage.getItem('saved_crypto_wallets');
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    const defaultSaved = [
      { id: '1', label: 'My Metamask EVM', address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', networkId: 'eth' },
      { id: '2', label: 'My Wallet TRC20', address: 'TY77v827vGNSda88njas99jBshDja9JkaN', networkId: 'tron' }
    ];
    localStorage.setItem('saved_crypto_wallets', JSON.stringify(defaultSaved));
    return defaultSaved;
  });

  const activeNetworks = useMemo(() => {
    return withdrawalNetworks.filter(n => n.enabled);
  }, [withdrawalNetworks]);

  const [selectedNetworkId, setSelectedNetworkId] = useState<string>(
    activeNetworks.length > 0 ? activeNetworks[0].id : 'tron'
  );

  const selectedNetwork = useMemo(() => {
    return activeNetworks.find(n => n.id === selectedNetworkId) || activeNetworks[0];
  }, [activeNetworks, selectedNetworkId]);

  const [withdrawAmountUsd, setWithdrawAmountUsd] = useState<string>('');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [withdrawalNotes, setWithdrawalNotes] = useState<string>('');
  const [saveWalletLabel, setSaveWalletLabel] = useState<string>('');
  const [isSavingWallet, setIsSavingWallet] = useState<boolean>(false);
  
  // Search / filter / sort recent list
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyFilterStatus, setHistoryFilterStatus] = useState<string>('all');
  const [historyFilterNetwork, setHistoryFilterNetwork] = useState<string>('all');
  const [historySort, setHistorySort] = useState<string>('newest');
  const [copiedTxId, setCopiedTxId] = useState<string | null>(null);

  // Steps flow: 'network' | 'details' | 'review' | 'status'
  const [currentStep, setCurrentStep] = useState<'network' | 'details' | 'review' | 'status'>('network');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Address validation live check
  const isAddressValid = useMemo(() => {
    if (!walletAddress) return null;
    return validateAddress(walletAddress, selectedNetworkId);
  }, [walletAddress, selectedNetworkId]);

  // Calculations
  const exchangeRate = rates[preferredCurrency] || DEFAULT_RATES[preferredCurrency] || 1;
  const amountPreferredNum = parseFloat(withdrawAmountUsd) || 0;
  const amountUsdNum = amountPreferredNum / exchangeRate; // High precision USDT equivalent
  const currentNetworkFeeUsd = selectedNetwork ? selectedNetwork.averageFee : (withdrawalSettings?.defaultFee || 1.0);
  const currentNetworkFeePref = currentNetworkFeeUsd * exchangeRate;
  const userReceivesUsd = Math.max(0, amountUsdNum - currentNetworkFeeUsd);
  const userReceivesPref = Math.max(0, amountPreferredNum - currentNetworkFeePref);

  // Currency Helpers
  const symbol = getCurrencySymbol(preferredCurrency);
  const formatVal = (val: number) => formatCurrencyValue(val, preferredCurrency, rates);

  const availableBalanceFiat = currentPlayer?.balance ?? 0; // Keeping raw USD/USDT balance for formatVal conversion
  const availableBalancePref = (currentPlayer?.balance ?? 0) * exchangeRate; // Balance converted to preferred currency
  const minWithdrawLimitUsd = selectedNetwork ? selectedNetwork.minWithdraw : (withdrawalSettings?.minWithdraw || 10);
  const minWithdrawLimitPref = minWithdrawLimitUsd * exchangeRate;
  const maxWithdrawLimitUsd = selectedNetwork ? selectedNetwork.maxWithdraw : (withdrawalSettings?.maxWithdraw || 50000);
  const maxWithdrawLimitPref = maxWithdrawLimitUsd * exchangeRate;
  const dailyWithdrawLimitUsd = withdrawalSettings?.dailyWithdrawLimit || 100000;
  const dailyWithdrawLimitPref = dailyWithdrawLimitUsd * exchangeRate;

  const pendingRequests = useMemo(() => {
    return withdrawalsHistory.filter(w => 
      w.playerId === currentPlayer.id && 
      ['pending', 'reviewing', 'approved', 'processing', 'broadcasted'].includes(w.status)
    );
  }, [withdrawalsHistory, currentPlayer.id]);

  const pendingWithdrawalsUsd = useMemo(() => {
    return pendingRequests.reduce((sum, w) => sum + w.amount, 0);
  }, [pendingRequests]);

  const withdrawnLast24hUsd = useMemo(() => {
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    return withdrawalsHistory
      .filter(w => 
        w.playerId === currentPlayer.id && 
        w.timestamp >= twentyFourHoursAgo && 
        w.status === 'completed'
      )
      .reduce((sum, w) => sum + w.amount, 0);
  }, [withdrawalsHistory, currentPlayer.id]);

  const remainingDailyLimitUsd = Math.max(0, dailyWithdrawLimitUsd - withdrawnLast24hUsd);
  const remainingDailyLimitPref = remainingDailyLimitUsd * exchangeRate;

  // 24h frequency check
  const isLocked24h = useMemo(() => {
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentRequest = withdrawalsHistory.find(w => 
      w.playerId === currentPlayer.id && 
      w.timestamp >= twentyFourHoursAgo && 
      ['pending', 'reviewing', 'approved', 'processing', 'broadcasted', 'completed'].includes(w.status)
    );
    return !!recentRequest && (withdrawalSettings?.maintenanceMode === false);
  }, [withdrawalsHistory, currentPlayer?.id, withdrawalSettings]);

  // Wallet list handlers
  const handleSaveWallet = () => {
    if (!walletAddress || !saveWalletLabel.trim()) return;
    const newWallet: SavedWallet = {
      id: Math.random().toString(36).substr(2, 9),
      label: saveWalletLabel.trim(),
      address: walletAddress.trim(),
      networkId: selectedNetworkId
    };
    const updated = [...savedWallets, newWallet];
    setSavedWallets(updated);
    localStorage.setItem('saved_crypto_wallets', JSON.stringify(updated));
    setSaveWalletLabel('');
    setIsSavingWallet(false);
    playSound('WIN');
  };

  const handleDeleteSavedWallet = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedWallets.filter(w => w.id !== id);
    setSavedWallets(updated);
    localStorage.setItem('saved_crypto_wallets', JSON.stringify(updated));
    playSound('CLICK');
  };

  const handleReviewWithdraw = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedNetwork) {
      setErrorMessage('Please select a blockchain network.');
      return;
    }
    if (selectedNetwork.status === 'Maintenance') {
      setErrorMessage('This network is currently undergoing maintenance. Please select a different network.');
      return;
    }
    if (!walletAddress.trim()) {
      setErrorMessage('Please enter your receiving wallet address.');
      return;
    }
    if (!validateAddress(walletAddress, selectedNetworkId)) {
      setErrorMessage(`Invalid address format for ${selectedNetwork.name}.`);
      return;
    }
    if (amountPreferredNum <= 0) {
      setErrorMessage('Please enter a valid withdrawal amount.');
      return;
    }
    if (amountPreferredNum < minWithdrawLimitPref) {
      setErrorMessage(`Minimum withdrawal for this network is ${symbol}${formatVal(minWithdrawLimitUsd)}.`);
      return;
    }
    if (amountPreferredNum > maxWithdrawLimitPref) {
      setErrorMessage(`Maximum withdrawal limit is ${symbol}${formatVal(maxWithdrawLimitUsd)}.`);
      return;
    }
    if (amountPreferredNum > availableBalancePref) {
      setErrorMessage('Insufficient balance.');
      return;
    }
    if (amountPreferredNum > remainingDailyLimitPref) {
      setErrorMessage(`Amount exceeds remaining daily limit of ${symbol}${formatVal(remainingDailyLimitUsd)}.`);
      return;
    }

    playSound('CLICK');
    setCurrentStep('review');
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      if (amountPreferredNum > availableBalancePref) {
        throw new Error('Insufficient balance to perform this withdrawal.');
      }
      await onWithdraw(
        amountUsdNum,
        selectedNetworkId,
        walletAddress.trim(),
        currentNetworkFeeUsd,
        preferredCurrency,
        exchangeRate,
        amountPreferredNum
      );
      setWithdrawAmountUsd('');
      setWalletAddress('');
      setWithdrawalNotes('');
      playSound('WIN');
      setCurrentStep('status');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to submit withdrawal request.');
      playSound('LOSE');
      setCurrentStep('details');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'completed':
        return { bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', label: 'Completed' };
      case 'processing':
        return { bg: 'bg-blue-500/10 border-blue-500/20 text-blue-400 animate-pulse', label: 'Processing' };
      case 'reviewing':
        return { bg: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400', label: 'Reviewing' };
      case 'approved':
        return { bg: 'bg-purple-500/10 border-purple-500/20 text-purple-400', label: 'Approved' };
      case 'broadcasted':
        return { bg: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400', label: 'Broadcasted' };
      case 'rejected':
        return { bg: 'bg-rose-500/10 border-rose-500/20 text-rose-400', label: 'Rejected' };
      case 'cancelled':
        return { bg: 'bg-slate-500/10 border-slate-500/20 text-slate-400', label: 'Cancelled' };
      case 'failed':
        return { bg: 'bg-rose-600/10 border-rose-600/20 text-rose-500', label: 'Failed' };
      default:
        return { bg: 'bg-amber-500/10 border-amber-500/20 text-amber-400', label: 'Pending' };
    }
  };

  const processedHistory = useMemo(() => {
    let result = [...withdrawalsHistory];
    if (historySearch.trim()) {
      const term = historySearch.toLowerCase();
      result = result.filter(w => 
        w.id.toLowerCase().includes(term) ||
        (w.walletAddress || '').toLowerCase().includes(term) ||
        (w.transactionHash || '').toLowerCase().includes(term) ||
        (w.adminNotes || '').toLowerCase().includes(term)
      );
    }
    if (historyFilterStatus !== 'all') {
      result = result.filter(w => w.status === historyFilterStatus);
    }
    if (historyFilterNetwork !== 'all') {
      result = result.filter(w => w.blockchain === historyFilterNetwork);
    }
    result.sort((a, b) => {
      if (historySort === 'oldest') return a.timestamp - b.timestamp;
      if (historySort === 'amount_desc') return b.amount - a.amount;
      if (historySort === 'amount_asc') return a.amount - b.amount;
      return b.timestamp - a.timestamp;
    });
    return result;
  }, [withdrawalsHistory, historySearch, historyFilterStatus, historyFilterNetwork, historySort]);

  const activeTrackingWithdrawal = useMemo(() => {
    const sorted = [...withdrawalsHistory]
      .filter(w => w.playerId === currentPlayer.id)
      .sort((a, b) => b.timestamp - a.timestamp);
    return sorted[0];
  }, [withdrawalsHistory, currentPlayer.id]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTxId(id);
    playSound('CLICK');
    setTimeout(() => setCopiedTxId(null), 2000);
  };

  // Custom premium coin logos
  const renderNetworkLogo = (id: string) => {
    switch (id) {
      case 'tron':
        return (
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-rose-700 flex items-center justify-center text-white font-sans font-black tracking-tighter text-sm shadow-[0_0_15px_rgba(239,68,68,0.3)] relative overflow-hidden shrink-0">
            <span>TRX</span>
          </div>
        );
      case 'bsc':
        return (
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center text-black font-sans font-black tracking-tighter text-sm shadow-[0_0_15px_rgba(245,158,11,0.3)] relative overflow-hidden shrink-0">
            <span>BNB</span>
          </div>
        );
      case 'eth':
        return (
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-700 flex items-center justify-center text-white font-sans font-black tracking-tighter text-sm shadow-[0_0_15px_rgba(99,102,241,0.3)] relative overflow-hidden shrink-0">
            <span>ETH</span>
          </div>
        );
      case 'btc':
        return (
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center text-white font-sans font-black tracking-tighter text-sm shadow-[0_0_15px_rgba(234,179,8,0.3)] relative overflow-hidden shrink-0">
            <span>BTC</span>
          </div>
        );
      case 'sol':
        return (
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-400 to-purple-600 flex items-center justify-center text-white font-sans font-black tracking-tighter text-sm shadow-[0_0_15px_rgba(20,184,166,0.3)] relative overflow-hidden shrink-0">
            <span>SOL</span>
          </div>
        );
      case 'polygon':
        return (
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-800 flex items-center justify-center text-white font-sans font-black tracking-tighter text-sm shadow-[0_0_15px_rgba(168,85,247,0.3)] relative overflow-hidden shrink-0">
            <span>POL</span>
          </div>
        );
      case 'ltc':
        return (
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-400 to-zinc-600 flex items-center justify-center text-white font-sans font-black tracking-tighter text-sm shadow-[0_0_15px_rgba(148,163,184,0.3)] relative overflow-hidden shrink-0">
            <span>LTC</span>
          </div>
        );
      default:
        return (
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
            <Coins className="w-6 h-6" />
          </div>
        );
    }
  };

  const renderStatusTimeline = (status: string, timestamp: number, completedDate?: number) => {
    const stages = [
      { id: 'submitted', label: 'Submitted', desc: 'Placed in audit ledger' },
      { id: 'reviewing', label: 'Reviewing', desc: 'Compliance validation' },
      { id: 'approved', label: 'Approved', desc: 'Authorized for payout' },
      { id: 'processing', label: 'Processing', desc: 'Signing & broadcasting' },
      { id: 'broadcasted', label: 'Broadcasted', desc: 'Mempool confirmation' },
      { id: 'completed', label: 'Completed', desc: 'Settled on-chain' }
    ];

    let activeIdx = 0;
    if (status === 'reviewing') activeIdx = 1;
    if (status === 'approved') activeIdx = 2;
    if (status === 'processing') activeIdx = 3;
    if (status === 'broadcasted') activeIdx = 4;
    if (status === 'completed') activeIdx = 5;
    if (status === 'rejected' || status === 'cancelled' || status === 'failed') activeIdx = -1;

    return (
      <div className="pt-4 pb-2 px-4 bg-black/40 border border-white/5 rounded-2xl mt-4 space-y-4 font-sans">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            Blockchain Confirmation Progress
          </p>
          <span className="text-[9px] text-slate-500 font-mono">
            Updated: {completedDate ? new Date(completedDate).toLocaleTimeString() : new Date(timestamp).toLocaleTimeString()}
          </span>
        </div>

        {activeIdx === -1 ? (
          <div className="flex items-center gap-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
            <XCircle className="w-5 h-5 text-rose-400" />
            <div>
              <p className="text-xs font-bold text-rose-400 uppercase">Transaction Aborted</p>
              <p className="text-[10px] text-slate-400 leading-normal">This request has been cancelled or rejected. Funds are completely secure and returned to your balance.</p>
            </div>
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 border-l border-white/10 ml-2 py-1">
            {stages.map((stage, idx) => {
              const isPast = idx < activeIdx;
              const isCurrent = idx === activeIdx;
              return (
                <div key={stage.id} className="relative">
                  <span className={`absolute -left-[30px] top-1 w-4 h-4 rounded-full border-2 transition-all flex items-center justify-center ${
                    isPast 
                      ? 'bg-emerald-500 border-emerald-500 text-black' 
                      : isCurrent 
                      ? 'bg-black border-emerald-400 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]' 
                      : 'bg-slate-900 border-white/10 text-slate-600'
                  }`}>
                    {isPast && <span className="text-[9px] font-bold">✓</span>}
                    {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
                  </span>
                  <div>
                    <p className={`text-xs font-bold ${isPast ? 'text-slate-300' : isCurrent ? 'text-emerald-400' : 'text-slate-600'}`}>
                      {stage.label}
                    </p>
                    <p className="text-[9px] text-slate-500 font-medium">{stage.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12 text-white select-none font-sans">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-white/5">
        <div className="flex items-center gap-4">
          <button 
            id="withdraw_back_btn"
            onClick={() => { playSound('CLICK'); onBack(); }}
            className="p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </button>
          <div>
            <h1 className="text-3xl font-display font-black tracking-tight text-white uppercase">Withdraw Vault</h1>
            <p className="text-slate-400 text-xs mt-1 font-medium">Settle secure crypto withdrawals directly to your hardware or exchange wallet</p>
          </div>
        </div>
      </div>

      {/* Two Column Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: Main Progressive Flow */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* STEP INDICATOR BAR */}
          <div className="max-w-xl mx-auto mb-8">
            <div className="flex items-center justify-between relative">
              <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-[2px] bg-slate-900 z-0" />
              <div 
                className="absolute left-4 top-1/2 -translate-y-1/2 h-[2px] bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 ease-out z-0" 
                style={{ 
                  width: 
                    currentStep === 'network' ? '0%' :
                    currentStep === 'details' ? '33%' :
                    currentStep === 'review' ? '66%' : '100%'
                }}
              />

              {[
                { label: 'Blockchain', value: 'network' },
                { label: 'Form Info', value: 'details' },
                { label: 'Verification', value: 'review' },
                { label: 'Timeline', value: 'status' }
              ].map((s, idx) => {
                const isCompleted = 
                  (currentStep === 'details' && idx < 1) || 
                  (currentStep === 'review' && idx < 2) || 
                  (currentStep === 'status' && idx < 3);
                const isActive = currentStep === s.value;
                
                return (
                  <div key={s.value} className="relative z-10 flex flex-col items-center gap-1.5">
                    <button 
                      type="button"
                      onClick={() => { 
                        if (currentStep !== 'status') {
                          if (s.value === 'network' && (currentStep === 'details' || currentStep === 'review')) {
                            playSound('CLICK');
                            setCurrentStep('network');
                          } else if (s.value === 'details' && currentStep === 'review') {
                            playSound('CLICK');
                            setCurrentStep('details');
                          }
                        }
                      }}
                      disabled={currentStep === 'status' || (!isCompleted && !isActive)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-mono text-xs font-black transition-all duration-300 border cursor-pointer ${
                        isActive 
                          ? 'bg-emerald-500 text-black border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)] scale-105' 
                          : isCompleted 
                          ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40 hover:bg-emerald-900'
                          : 'bg-slate-950 text-slate-600 border-white/5'
                      }`}
                    >
                      {isCompleted ? '✓' : idx + 1}
                    </button>
                    <span className={`text-[9px] font-black uppercase tracking-widest transition-colors ${
                      isActive ? 'text-emerald-400' : isCompleted ? 'text-slate-300' : 'text-slate-600'
                    }`}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ACTIVE FLOW STEP */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              
              {/* STEP 1: CHOOSE NETWORK */}
              {currentStep === 'network' && (
                <div className="space-y-6">
                  <div className="text-center space-y-1.5 max-w-md mx-auto">
                    <h3 className="text-xl font-display font-black uppercase tracking-tight flex items-center justify-center gap-2">
                      <Sparkles className="w-5 h-5 text-emerald-400" />
                      Select Network
                    </h3>
                    <p className="text-slate-400 text-xs font-medium">
                      Select your destination on-chain ledger. Keep in mind fees depend on current congestion.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeNetworks.map((network) => {
                      const isSelected = selectedNetworkId === network.id;
                      return (
                        <button
                          key={network.id}
                          type="button"
                          onClick={() => { 
                            playSound('CLICK'); 
                            setSelectedNetworkId(network.id);
                            setCurrentStep('details');
                          }}
                          className={`p-5 rounded-[2rem] text-left border relative overflow-hidden transition-all duration-300 flex flex-col justify-between h-48 cursor-pointer outline-none bg-slate-950/40 hover:bg-slate-950/60 hover:scale-[1.01] group ${
                            isSelected 
                              ? 'border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
                              : 'border-white/5 hover:border-white/10'
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute top-4 right-4 w-5 h-5 rounded-full bg-emerald-500 text-black flex items-center justify-center font-bold text-xs shadow-[0_0_10px_rgba(16,185,129,0.4)] z-20">
                              ✓
                            </div>
                          )}
                          
                          <div className="flex justify-between items-start w-full relative z-10">
                            <div className="flex items-center gap-3">
                              {renderNetworkLogo(network.id)}
                              <div>
                                <p className="font-display font-black text-sm text-white group-hover:text-emerald-400 transition-colors uppercase">{network.name}</p>
                                <span className="text-[9px] text-slate-500 uppercase font-mono font-bold">Priority #{network.priority || 1}</span>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1 shrink-0 pr-6">
                              {network.popularityBadge && (
                                <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  {network.popularityBadge}
                                </span>
                              )}
                              <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                                network.status === 'Online'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              }`}>
                                {network.status === 'Online' && <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />}
                                {network.status}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 w-full border-t border-b border-white/5 py-3 my-2.5 relative z-10 font-mono">
                            <div>
                              <span className="text-[8px] text-slate-500 uppercase block font-black">Average Gas Fee</span>
                              <span className="text-xs text-emerald-400 font-extrabold">{network.networkFeeText || `${network.averageFee} USDT`}</span>
                            </div>
                            <div>
                              <span className="text-[8px] text-slate-500 uppercase block font-black">Settlement Time</span>
                              <span className="text-xs text-slate-200 font-extrabold">{network.estimatedTime || 'Instant'}</span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center w-full relative z-10">
                            <span className="text-[9px] text-slate-500">Security rating verified:</span>
                            <div className="flex gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <span 
                                  key={i} 
                                  className={`w-1.5 h-1.5 rounded-full ${i < (network.securityRating || 5) ? 'bg-emerald-400' : 'bg-white/10'}`} 
                                />
                              ))}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 2: DETAILS FORM */}
              {currentStep === 'details' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl gap-4">
                    <div className="flex items-center gap-3">
                      {renderNetworkLogo(selectedNetworkId)}
                      <div>
                        <span className="text-[8px] font-mono font-black uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          Selected Pipeline
                        </span>
                        <h4 className="text-base font-display font-black text-white mt-1 uppercase">{selectedNetwork?.name}</h4>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => { playSound('CLICK'); setCurrentStep('network'); }}
                      className="text-slate-400 hover:text-white transition-colors text-xs font-bold flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-white/5 border border-white/5 cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" /> Switch Network
                    </button>
                  </div>

                  {isLocked24h && (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-center space-y-1">
                      <p className="text-amber-400 font-black uppercase text-[9px] tracking-widest">24-Hour Security Cooldown</p>
                      <p className="text-xs text-slate-300 leading-normal">
                        To secure your funds, withdrawals are regulated to one process every 24 hours. A transaction was recently logged.
                      </p>
                    </div>
                  )}

                  <form onSubmit={handleReviewWithdraw} className="space-y-6">
                    
                    {/* SAVED WALLET SELECTOR */}
                    {savedWallets.filter(w => w.networkId === selectedNetworkId).length > 0 && (
                      <div className="space-y-2">
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Saved Wallets ({selectedNetwork?.name})</label>
                        <div className="grid grid-cols-1 gap-2">
                          {savedWallets
                            .filter(w => w.networkId === selectedNetworkId)
                            .map((wallet) => (
                              <div
                                key={wallet.id}
                                onClick={() => { playSound('CLICK'); setWalletAddress(wallet.address); }}
                                className={`p-3 bg-black/40 hover:bg-white/5 border rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                                  walletAddress === wallet.address ? 'border-emerald-500/40 bg-emerald-950/10' : 'border-white/5'
                                }`}
                              >
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  <div className="text-left overflow-hidden">
                                    <p className="text-xs font-bold text-white truncate">{wallet.label}</p>
                                    <p className="text-[10px] text-slate-500 font-mono truncate">{wallet.address}</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteSavedWallet(wallet.id, e)}
                                  className="p-1.5 bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 border border-white/5 rounded-lg text-slate-500 transition-colors cursor-pointer"
                                  title="Remove wallet"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* RECEIVING ADDRESS */}
                    <div className="space-y-2">
                      <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Destination Receiving Address</label>
                      <div className="relative">
                        <input 
                          type="text" 
                          disabled={isLocked24h || submitting}
                          value={walletAddress}
                          onChange={(e) => setWalletAddress(e.target.value)}
                          className={`w-full bg-black/40 border rounded-2xl px-5 py-4 focus:outline-none hover:border-white/20 transition-all text-white font-mono text-xs placeholder:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed ${
                            isAddressValid === null 
                              ? 'border-white/10 focus:border-emerald-500/40' 
                              : isAddressValid 
                              ? 'border-emerald-500/50 focus:border-emerald-500 bg-emerald-950/5' 
                              : 'border-rose-500/50 focus:border-rose-500 bg-rose-950/5'
                          }`}
                          placeholder={`Enter your native ${selectedNetwork?.name || 'USDT'} wallet address`}
                          required
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                          {isAddressValid === true && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                          {isAddressValid === false && <XCircle className="w-5 h-5 text-rose-400" />}
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[10px] px-1 text-slate-500 font-mono">
                        <span>Automatic structure check</span>
                        {isAddressValid === false && <span className="text-rose-400 font-semibold">Invalid address format</span>}
                        {isAddressValid === true && <span className="text-emerald-400 font-semibold">Correct format detected</span>}
                      </div>
                    </div>

                    {/* SAVE ADDRESS ALIAS */}
                    {walletAddress && isAddressValid === true && (
                      <div className="p-3.5 bg-white/[0.02] border border-white/5 rounded-2xl space-y-2 transition-all">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Save Address to Favorites?</span>
                          <button
                            type="button"
                            onClick={() => { playSound('CLICK'); setIsSavingWallet(!isSavingWallet); }}
                            className="text-[10px] text-emerald-400 font-black uppercase hover:underline cursor-pointer"
                          >
                            {isSavingWallet ? 'Close' : 'Save Address'}
                          </button>
                        </div>

                        {isSavingWallet && (
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              placeholder="Alias: e.g. Ledger cold"
                              value={saveWalletLabel}
                              onChange={(e) => setSaveWalletLabel(e.target.value)}
                              className="bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs font-sans text-white focus:outline-none focus:border-emerald-500/40 flex-1"
                            />
                            <button
                              type="button"
                              onClick={handleSaveWallet}
                              disabled={!saveWalletLabel.trim()}
                              className="bg-emerald-500 text-black px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider disabled:opacity-30 hover:scale-[1.02] active:scale-95 transition-all shrink-0 cursor-pointer border-0"
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* WITHDRAWAL AMOUNT */}
                    <div className="space-y-2">
                      <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Withdraw Amount ({preferredCurrency})</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono">{symbol}</span>
                        <input 
                          type="number" 
                          step="any"
                          disabled={isLocked24h || submitting}
                          value={withdrawAmountUsd} 
                          onChange={(e) => setWithdrawAmountUsd(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-2xl pl-10 pr-32 py-4 focus:outline-none focus:border-emerald-500/50 hover:border-white/20 transition-all font-mono text-xl text-white placeholder:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          placeholder="0.00"
                          required
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isLocked24h || submitting}
                            onClick={() => { playSound('CLICK'); setWithdrawAmountUsd(Math.floor(availableBalancePref).toString()); }}
                            className="bg-white/5 border border-white/10 text-slate-300 px-2.5 py-1.5 rounded-xl font-black uppercase text-[9px] hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                          >
                            MAX
                          </button>
                          <button
                            type="button"
                            disabled={isLocked24h || submitting}
                            onClick={() => { playSound('CLICK'); setWithdrawAmountUsd(availableBalancePref.toString()); }}
                            className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1.5 rounded-xl font-black uppercase text-[9px] hover:bg-emerald-500/20 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                          >
                            ALL
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center text-[10px] px-1 text-slate-500 font-mono">
                        <span>Limit constraints</span>
                        <span className="text-emerald-400 font-bold uppercase tracking-wider">Min: {symbol}{formatVal(minWithdrawLimitUsd)}</span>
                      </div>

                      {amountUsdNum > 0 && amountUsdNum < minWithdrawLimitUsd && (
                        <p className="text-[10px] text-rose-400 italic font-mono">Amount is below the minimum network checkout threshold ({symbol}{formatVal(minWithdrawLimitUsd)})</p>
                      )}
                      {amountUsdNum > maxWithdrawLimitUsd && (
                        <p className="text-[10px] text-rose-400 italic font-mono">Amount exceeds maximum network threshold ({symbol}{formatVal(maxWithdrawLimitUsd)})</p>
                      )}
                    </div>

                    {/* WITHDRAW NOTES */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest">Withdrawal Memo / Tag (Optional)</label>
                        <span className="text-[9px] text-slate-500 font-mono">{withdrawalNotes.length}/120</span>
                      </div>
                      <textarea 
                        disabled={isLocked24h || submitting}
                        value={withdrawalNotes}
                        maxLength={120}
                        onChange={(e) => setWithdrawalNotes(e.target.value)}
                        rows={2}
                        placeholder="Saved to database audit logs for compliance checks"
                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/40 hover:border-white/15 transition-all resize-none placeholder:text-slate-700"
                      />
                    </div>

                    {/* LIVE BREAKDOWN */}
                    <div className="p-5 bg-black/40 border border-white/5 rounded-3xl space-y-4 font-mono">
                      <h4 className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Live Asset Summary Breakdown</h4>
                      
                      <div className="space-y-3 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>Withdrawal Value:</span>
                          <span className="text-white font-bold">{symbol}{formatVal(amountUsdNum)}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Estimated Network Gas:</span>
                          <span className="text-rose-400 font-bold">-{symbol}{formatVal(currentNetworkFeeUsd)}</span>
                        </div>
                        <div className="border-t border-white/5 pt-3 flex justify-between text-sm">
                          <span className="text-slate-200 font-bold uppercase font-sans">Payout Disbursed:</span>
                          <span className="text-emerald-400 font-black text-lg">{symbol}{formatVal(userReceivesUsd)}</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-500">
                          <span className="font-sans">Expected Processing:</span>
                          <span>{selectedNetwork?.estimatedTime || '5-15 mins'}</span>
                        </div>
                      </div>
                    </div>

                    {/* FEEDBACK ERROR */}
                    {errorMessage && (
                      <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-2 text-rose-400 text-xs">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{errorMessage}</span>
                      </div>
                    )}

                    {/* REVIEW TRIGGER BTN */}
                    <button
                      type="submit"
                      disabled={
                        isLocked24h || 
                        submitting || 
                        !walletAddress.trim() || 
                        !isAddressValid || 
                        amountPreferredNum < minWithdrawLimitPref || 
                        amountPreferredNum > maxWithdrawLimitPref || 
                        amountPreferredNum > availableBalancePref
                      }
                      className="w-full py-4 bg-gradient-to-r from-emerald-400 to-teal-500 text-black rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-25 disabled:scale-100 disabled:cursor-not-allowed cursor-pointer border-0"
                    >
                      {submitting ? 'Authenticating request...' : 'Review Payout Details'}
                    </button>

                  </form>
                </div>
              )}

              {/* STEP 3: PRE-FLIGHT REVIEW CARD */}
              {currentStep === 'review' && (
                <div className="space-y-6">
                  <div className="bg-slate-950 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
                    <div className="bg-gradient-to-r from-emerald-500/15 via-[#0a1f16] to-slate-950 p-5 border-b border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {renderNetworkLogo(selectedNetworkId)}
                        <div>
                          <h3 className="font-display font-black text-white text-base">Pre-Flight Ledger Audit</h3>
                          <p className="text-emerald-400 text-[9px] uppercase tracking-wider font-mono font-bold">Network: {selectedNetwork?.name}</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 sm:p-8 space-y-6">
                      <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[9px] text-rose-400 uppercase font-black tracking-widest">Permanent Loss Advisory</p>
                          <p className="text-xs text-slate-300 mt-0.5 leading-normal">
                            Ensure the receiving address matches the <strong>{selectedNetwork?.name}</strong> network. Sending funds to an incorrect address or blockchain network cannot be recovered.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1">
                          <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest px-1">Destination Wallet</span>
                          <p className="font-mono text-xs text-white bg-black/40 border border-white/5 p-4 rounded-xl select-all break-all leading-normal">
                            {walletAddress}
                          </p>
                        </div>

                        {withdrawalNotes && (
                          <div className="space-y-1">
                            <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest px-1">Transaction Memo</span>
                            <p className="text-xs text-slate-300 italic bg-black/20 border border-white/5 p-3 rounded-xl leading-normal">
                              "{withdrawalNotes}"
                            </p>
                          </div>
                        )}

                        <div className="p-5 bg-black/40 border border-white/5 rounded-2xl space-y-3 font-mono text-xs">
                          <div className="flex justify-between items-center text-slate-400">
                            <span>Withdrawal Value:</span>
                            <div className="text-right">
                              <span className="text-white font-bold block text-sm">{symbol}{amountPreferredNum.toFixed(2)}</span>
                              <span className="text-[10px] text-slate-500 block">{amountUsdNum.toFixed(4)} USDT</span>
                            </div>
                          </div>
                          
                          <div className="flex justify-between items-center text-slate-400 border-t border-white/5 pt-3">
                            <span>Estimated Network Fee:</span>
                            <div className="text-right">
                              <span className="text-rose-400 font-bold block text-sm">-{symbol}{currentNetworkFeePref.toFixed(2)}</span>
                              <span className="text-[10px] text-slate-500 block">-{currentNetworkFeeUsd.toFixed(2)} USDT</span>
                            </div>
                          </div>

                          <div className="border-t border-white/5 pt-3 flex justify-between items-center text-sm">
                            <span className="text-slate-300 font-bold uppercase font-sans text-xs">Total Balance Deduction:</span>
                            <div className="text-right">
                              <span className="text-white font-bold block text-sm">{symbol}{amountPreferredNum.toFixed(2)}</span>
                              <span className="text-[10px] text-slate-500 block">{amountUsdNum.toFixed(4)} USDT</span>
                            </div>
                          </div>

                          <div className="border-t border-white/5 pt-3 flex justify-between items-center">
                            <span className="text-slate-200 font-bold uppercase font-sans text-xs">Final Received Amount:</span>
                            <div className="text-right">
                              <span className="text-emerald-400 font-black text-lg block">{symbol}{userReceivesPref.toFixed(2)}</span>
                              <span className="text-[11px] text-slate-400 font-bold block">{userReceivesUsd.toFixed(4)} USDT</span>
                            </div>
                          </div>

                          <div className="border-t border-white/5 pt-3 flex justify-between items-center text-[10px] text-slate-400">
                            <span>Exchange Rate:</span>
                            <span className="font-bold text-white">1 USDT = {symbol}{exchangeRate.toFixed(4)} {preferredCurrency}</span>
                          </div>

                          <div className="flex justify-between text-[9px] text-slate-500 font-sans pt-1">
                            <span>Estimated Arrival:</span>
                            <span>{selectedNetwork?.estimatedTime}</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <button
                          type="button"
                          onClick={() => { playSound('CLICK'); setCurrentStep('details'); }}
                          className="w-full py-4 bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmSubmit}
                          disabled={submitting}
                          className="w-full py-4 bg-gradient-to-r from-emerald-400 to-teal-500 text-black rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg hover:scale-[1.01] active:scale-95 cursor-pointer disabled:opacity-50 border-0"
                        >
                          {submitting ? 'Confirming...' : 'Confirm'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: TIMELINE SUCCESS TRACKER */}
              {currentStep === 'status' && (
                <div className="space-y-6">
                  <div className="bg-slate-950 border border-white/10 rounded-[2.5rem] p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                    
                    <div className="text-center space-y-2.5 pb-4 border-b border-white/5">
                      <div className="flex justify-center">
                        <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
                      </div>
                      <span className="inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                        Pending Admin Audit
                      </span>
                      <h3 className="text-xl font-display font-black text-white uppercase tracking-tight">Withdrawal Initiated</h3>
                      {activeTrackingWithdrawal && (
                        <p className="text-slate-500 text-[10px] uppercase tracking-wider font-mono">Reference ID: #{activeTrackingWithdrawal.id}</p>
                      )}
                    </div>

                    <div className="space-y-4">
                      {activeTrackingWithdrawal ? (
                        <>
                          <div className="bg-white/[0.01] border border-white/5 p-4 rounded-xl font-mono text-xs space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-[8px] text-slate-500 uppercase font-black">Asset Network</span>
                              <span className="text-white font-bold">{selectedNetwork?.name}</span>
                            </div>
                            <div className="flex justify-between items-center border-t border-white/5 pt-2">
                              <span className="text-[8px] text-slate-500 uppercase font-black">Disbursed Value</span>
                              <div className="text-right">
                                <span className="text-emerald-400 font-extrabold block text-sm">
                                  {getCurrencySymbol(activeTrackingWithdrawal.preferredCurrency || preferredCurrency)}
                                  {(activeTrackingWithdrawal.preferredAmount || (activeTrackingWithdrawal.amount * exchangeRate)).toFixed(2)}
                                </span>
                                <span className="text-[10px] text-slate-500 block">
                                  {(activeTrackingWithdrawal.finalAmount || (activeTrackingWithdrawal.amount - (activeTrackingWithdrawal.fee || 0))).toFixed(4)} USDT
                                </span>
                              </div>
                            </div>
                            <div className="flex justify-between items-center border-t border-white/5 pt-2">
                              <span className="text-[8px] text-slate-500 uppercase font-black">Network Fee</span>
                              <div className="text-right">
                                <span className="text-rose-400 font-bold block">
                                  -{getCurrencySymbol(activeTrackingWithdrawal.preferredCurrency || preferredCurrency)}
                                  {((activeTrackingWithdrawal.fee || currentNetworkFeeUsd) * (activeTrackingWithdrawal.exchangeRate || exchangeRate)).toFixed(2)}
                                </span>
                                <span className="text-[10px] text-slate-500 block">
                                  -{(activeTrackingWithdrawal.fee || currentNetworkFeeUsd).toFixed(2)} USDT
                                </span>
                              </div>
                            </div>
                            <div className="flex justify-between items-center border-t border-white/5 pt-2 text-[10px]">
                              <span className="text-[8px] text-slate-500 uppercase font-black">Exchange Rate Used</span>
                              <span className="text-slate-400 font-bold">
                                1 USDT = {getCurrencySymbol(activeTrackingWithdrawal.preferredCurrency || preferredCurrency)}
                                {(activeTrackingWithdrawal.exchangeRate || exchangeRate).toFixed(4)}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest px-1">Destination Address</span>
                            <p className="font-mono text-xs text-slate-300 bg-black/40 border border-white/5 p-3 rounded-xl break-all leading-normal">
                              {activeTrackingWithdrawal.walletAddress || activeTrackingWithdrawal.details}
                            </p>
                          </div>

                          {renderStatusTimeline(activeTrackingWithdrawal.status, activeTrackingWithdrawal.timestamp)}
                        </>
                      ) : (
                        <p className="text-xs text-slate-400 text-center font-mono">Searching blockchain audit log...</p>
                      )}
                    </div>

                    <div className="pt-4 flex justify-center">
                      <button
                        type="button"
                        onClick={() => { playSound('CLICK'); setCurrentStep('network'); }}
                        className="w-full py-4 bg-emerald-500 text-black hover:bg-emerald-400 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg hover:scale-[1.01] cursor-pointer border-0"
                      >
                        Create New Withdrawal
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>

        {/* RIGHT COLUMN: Sticky Summary Sidebar */}
        <div className="lg:col-span-4 lg:sticky lg:top-8">
          <div className="bg-slate-950/80 border border-white/5 rounded-[2rem] p-6 space-y-6 shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-3 pb-4 border-b border-white/5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/5 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-display font-black text-sm text-white uppercase tracking-tight">Vault Balance Summary</h4>
                <p className="text-[8px] uppercase font-mono tracking-widest text-slate-500 font-bold">Real-time status</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center bg-white/[0.01] border border-white/5 p-4 rounded-2xl hover:bg-white/[0.02] transition-colors">
                <div className="space-y-0.5">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Available Balance</span>
                  <span className="text-[10px] text-slate-400 block font-medium">Liquid unreserved wallet</span>
                </div>
                <span className="text-lg font-mono font-black text-white">{symbol}{formatVal(availableBalanceFiat)}</span>
              </div>

              <div className="flex justify-between items-center bg-white/[0.01] border border-white/5 p-4 rounded-2xl hover:bg-white/[0.02] transition-colors">
                <div className="space-y-0.5">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Withdrawable Balance</span>
                  <span className="text-[10px] text-slate-400 block font-medium">Fully unlocked ready cashout</span>
                </div>
                <span className="text-lg font-mono font-black text-blue-400">{symbol}{formatVal(availableBalanceFiat)}</span>
              </div>

              <div className="flex justify-between items-center bg-white/[0.01] border border-white/5 p-4 rounded-2xl hover:bg-white/[0.02] transition-colors">
                <div className="space-y-0.5">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Pending Withdrawals</span>
                  <span className="text-[10px] text-slate-400 block font-medium">{pendingRequests.length} queue items</span>
                </div>
                <span className="text-lg font-mono font-black text-amber-500">{symbol}{formatVal(pendingWithdrawalsUsd)}</span>
              </div>

              <div className="pt-4 border-t border-white/5 space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center text-slate-400">
                  <span className="font-sans text-xs text-slate-500">Selected Currency:</span>
                  <span className="font-bold text-white uppercase text-xs tracking-wider bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">{preferredCurrency}</span>
                </div>
                
                <div className="flex justify-between items-center text-slate-400">
                  <span className="font-sans text-xs text-slate-500">Estimated Gas Fee:</span>
                  <span className="font-bold text-rose-400">
                    {selectedNetwork ? `${symbol}${formatVal(currentNetworkFeeUsd)}` : 'Select network'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-400">
                  <span className="font-sans text-xs text-slate-500">Estimated Arrival:</span>
                  <span className="font-bold text-emerald-400">
                    {selectedNetwork ? selectedNetwork.estimatedTime : 'Select network'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Recent Withdrawals spreadsheet section */}
      <div className="pt-8 border-t border-white/5 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-xl font-display font-black tracking-tight flex items-center gap-2 uppercase">
              <Activity className="w-5 h-5 text-emerald-400" />
              Recent Withdrawals
            </h3>
            <p className="text-slate-400 text-xs mt-0.5 font-medium">Detailed tracking history and transaction statuses</p>
          </div>
          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-mono px-3 py-1.5 rounded-full border border-emerald-500/20 font-bold">
            Audit Records: {processedHistory.length}
          </span>
        </div>

        {/* SEARCH AND FILTERS */}
        <div className="p-4 bg-slate-950/60 border border-white/5 rounded-3xl grid grid-cols-1 md:grid-cols-4 gap-4 items-center font-sans">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
              <Search className="w-4 h-4" />
            </span>
            <input 
              type="text"
              placeholder="Search wallet, TX hash, ID..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-xs text-white focus:outline-none focus:border-emerald-500/50 placeholder:text-slate-600 font-mono"
            />
          </div>

          <div>
            <select
              value={historyFilterStatus}
              onChange={(e) => setHistoryFilterStatus(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50 font-sans cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="reviewing">Reviewing</option>
              <option value="approved">Approved</option>
              <option value="processing">Processing</option>
              <option value="broadcasted">Broadcasted</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div>
            <select
              value={historyFilterNetwork}
              onChange={(e) => setHistoryFilterNetwork(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50 font-sans cursor-pointer"
            >
              <option value="all">All Networks</option>
              {activeNetworks.map(n => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={historySort}
              onChange={(e) => setHistorySort(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50 font-sans cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="amount_desc">Amount: High to Low</option>
              <option value="amount_asc">Amount: Low to High</option>
            </select>
          </div>
        </div>

        {/* LEDGER CONTENT CONTAINER */}
        {processedHistory.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-white/5 rounded-[2rem] bg-slate-950/20 font-sans">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-500">
              <Clock className="w-6 h-6" />
            </div>
            <p className="text-slate-400 font-bold text-xs">No matching transactions found</p>
            <p className="text-[10px] text-slate-600 mt-1">Adjust search filter or make a cashout.</p>
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* DESKTOP TABLE VIEW */}
            <div className="hidden lg:block bg-slate-950/40 border border-white/5 rounded-[2rem] overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-[9px] uppercase tracking-widest text-slate-500 font-bold bg-white/[0.01]">
                    <th className="py-4 px-6">Date</th>
                    <th className="py-4 px-6">Coin</th>
                    <th className="py-4 px-6">Network</th>
                    <th className="py-4 px-6">Wallet Address</th>
                    <th className="py-4 px-6 text-right">Amount</th>
                    <th className="py-4 px-6 text-right">Fee</th>
                    <th className="py-4 px-6 text-center">Status</th>
                    <th className="py-4 px-6">Transaction Hash</th>
                    <th className="py-4 px-6 text-center">Explorer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {processedHistory.map((item) => {
                    const sStyle = getStatusStyle(item.status);
                    const net = activeNetworks.find(n => n.id === item.blockchain) || { name: item.blockchain || 'Crypto' };
                    
                    const getCoinTicker = (netId: string) => {
                      if (netId === 'btc') return 'BTC';
                      if (netId === 'eth') return 'ETH';
                      if (netId === 'sol') return 'SOL';
                      if (netId === 'ltc') return 'LTC';
                      return 'USDT';
                    };

                    return (
                      <tr key={item.id} className="hover:bg-white/[0.01] transition-colors">
                        <td className="py-4 px-6 text-slate-400 text-[11px]">
                          {new Date(item.timestamp).toLocaleString()}
                        </td>
                        <td className="py-4 px-6 font-bold text-white uppercase text-[11px]">
                          {getCoinTicker(item.blockchain)}
                        </td>
                        <td className="py-4 px-6 font-sans text-slate-300 font-medium">
                          <div>{net.name}</div>
                          <div className="text-[9px] text-slate-500 font-mono mt-0.5 uppercase">
                            Settle: {item.settlementCurrency || 'USDT'}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[120px] text-slate-400 text-[11px]" title={item.walletAddress || item.details}>
                              {item.walletAddress || item.details}
                            </span>
                            <button 
                              onClick={() => copyToClipboard(item.walletAddress || item.details, item.id)}
                              className="p-1 bg-white/5 border border-white/5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
                            >
                              {copiedTxId === item.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-right space-y-1">
                          <div className="font-bold text-white text-[12px]">
                            {item.preferredCurrency && item.preferredAmount !== undefined ? (
                              <span title="Preferred Currency Amount">
                                {getCurrencySymbol(item.preferredCurrency)}
                                {item.preferredAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span title="Dynamic Conversion">
                                {symbol}{formatVal(item.amount)}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {item.amount.toFixed(2)} USDT
                          </div>
                          <div className="text-[8px] text-slate-500 font-mono">
                            Rate: 1 USDT = {getCurrencySymbol(item.preferredCurrency || 'USD')}
                            {(item.exchangeRate || (rates[preferredCurrency] || DEFAULT_RATES[preferredCurrency] || 1)).toFixed(2)}
                          </div>
                        </td>
                        <td className="py-4 px-6 text-right space-y-1">
                          <div className="text-rose-400 text-[11px] font-bold">
                            {item.preferredCurrency && item.exchangeRate ? (
                              <span>-{getCurrencySymbol(item.preferredCurrency)}{(item.fee * item.exchangeRate).toFixed(2)}</span>
                            ) : (
                              <span>-{symbol}{formatVal(item.fee || 0)}</span>
                            )}
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono">
                            -{(item.fee || 0).toFixed(2)} USDT
                          </div>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${sStyle.bg}`}>
                            {sStyle.label}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-slate-500 text-[11px] font-mono">
                          {item.transactionHash ? (
                            <div className="flex items-center gap-1.5">
                              <span className="truncate max-w-[100px]" title={item.transactionHash}>{item.transactionHash}</span>
                              <button 
                                onClick={() => copyToClipboard(item.transactionHash!, item.id + '-hash')}
                                className="p-0.5 hover:text-white bg-transparent border-0 cursor-pointer text-slate-400"
                              >
                                {copiedTxId === (item.id + '-hash') ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          ) : (
                            <span className="italic opacity-50">Pending broadcast...</span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-center">
                          {item.transactionHash ? (
                            <a 
                              href={`https://tronscan.org/#/transaction/${item.transactionHash}`} 
                              target="_blank" 
                              referrerPolicy="no-referrer"
                              rel="noopener noreferrer" 
                              className="inline-flex p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-all border border-emerald-500/20"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            <span className="text-slate-600 font-bold">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARDS VIEW (No horizontal scroll!) */}
            <div className="block lg:hidden space-y-4 font-sans">
              {processedHistory.map((item) => {
                const sStyle = getStatusStyle(item.status);
                const net = activeNetworks.find(n => n.id === item.blockchain) || { name: item.blockchain || 'Crypto' };
                const getCoinTicker = (netId: string) => {
                  if (netId === 'btc') return 'BTC';
                  if (netId === 'eth') return 'ETH';
                  if (netId === 'sol') return 'SOL';
                  if (netId === 'ltc') return 'LTC';
                  return 'USDT';
                };

                return (
                  <div key={item.id} className="bg-slate-950/80 border border-white/5 rounded-2xl p-4 space-y-3 relative overflow-hidden">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <div>
                        <span className="text-[10px] text-slate-500 font-mono">#{item.id}</span>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">{new Date(item.timestamp).toLocaleString()}</p>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${sStyle.bg}`}>
                        {sStyle.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                      <div>
                        <span className="text-[8px] text-slate-500 uppercase block font-black mb-0.5 font-sans">Coin & Chain</span>
                        <span className="text-white font-bold">{getCoinTicker(item.blockchain)} ({net.name})</span>
                        <span className="block text-[8px] text-slate-500 mt-0.5">Settle: {item.settlementCurrency || 'USDT'}</span>
                      </div>
                      <div className="text-right space-y-0.5">
                        <span className="text-[8px] text-slate-500 uppercase block font-black font-sans font-bold">Payout</span>
                        <span className="text-emerald-400 font-black block">
                          {item.preferredCurrency && item.preferredAmount !== undefined ? (
                            <span>{getCurrencySymbol(item.preferredCurrency)}{item.preferredAmount.toFixed(2)}</span>
                          ) : (
                            <span>{symbol}{formatVal(item.amount)}</span>
                          )}
                        </span>
                        <span className="text-[9px] text-slate-400 block">{item.amount.toFixed(2)} USDT</span>
                        <span className="text-[8px] text-slate-500 block">
                          Rate: 1 USDT = {getCurrencySymbol(item.preferredCurrency || 'USD')}
                          {(item.exchangeRate || (rates[preferredCurrency] || DEFAULT_RATES[preferredCurrency] || 1)).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[8px] text-slate-500 uppercase block font-black font-sans">Receiving Wallet</span>
                      <div className="bg-black/40 border border-white/5 p-2 rounded-xl flex items-center justify-between gap-2 font-mono text-[10px]">
                        <span className="text-slate-300 truncate flex-1 break-all">{item.walletAddress || item.details}</span>
                        <button
                          onClick={() => copyToClipboard(item.walletAddress || item.details, item.id)}
                          className="p-1 bg-white/5 border border-white/10 rounded-lg text-slate-400 cursor-pointer"
                        >
                          {copiedTxId === item.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    {item.transactionHash && (
                      <div className="space-y-1">
                        <span className="text-[8px] text-slate-500 uppercase block font-black font-sans">TX Hash</span>
                        <div className="bg-black/40 border border-white/5 p-2 rounded-xl flex items-center justify-between gap-2 font-mono text-[10px]">
                          <span className="text-slate-400 truncate flex-1 break-all">{item.transactionHash}</span>
                          <div className="flex gap-1">
                            <button
                              onClick={() => copyToClipboard(item.transactionHash!, item.id + '-hash')}
                              className="p-1 bg-white/5 border border-white/10 rounded-lg text-slate-400 cursor-pointer"
                            >
                              {copiedTxId === (item.id + '-hash') ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                            <a 
                              href={`https://tronscan.org/#/transaction/${item.transactionHash}`} 
                              target="_blank" 
                              referrerPolicy="no-referrer"
                              rel="noopener noreferrer" 
                              className="p-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-all border border-emerald-500/20"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        )}
      </div>

    </div>
  );
}
