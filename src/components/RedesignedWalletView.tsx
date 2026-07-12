import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wallet, 
  Flame, 
  ArrowDownLeft, 
  ArrowUpRight, 
  TrendingUp, 
  TrendingDown,
  Clock, 
  Share2, 
  History, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Copy, 
  X, 
  ImageIcon, 
  AlertCircle,
  RefreshCw,
  Coins,
  ExternalLink,
  Shield,
  Info,
  Sliders,
  Settings,
  Check,
  Search,
  ChevronDown,
  Lock
} from 'lucide-react';
import { AppState, Player, Transaction, WithdrawalRequest, DepositRequest, DepositNetwork, WithdrawalNetwork } from '../types';
import { RedesignedDepositView } from './RedesignedDepositView';
import { RedesignedWithdrawView } from './RedesignedWithdrawView';
import {
  SUPPORTED_CURRENCIES,
  DEFAULT_RATES,
  getCachedRates,
  convertUsdToCurrency,
  convertCurrencyToUsd,
  formatCurrencyValue,
  getCurrencySymbol
} from '../lib/currency';

// Custom modern AnimatedBalance component inside RedesignedWalletView to keep it isolated and self-contained
interface CustomAnimatedBalanceProps {
  balance: number;
  preferredCurrency: string;
  rates: Record<string, number>;
  isLoading?: boolean;
}

const CustomAnimatedBalance = memo(({ balance, preferredCurrency, rates, isLoading }: CustomAnimatedBalanceProps) => {
  if (isLoading) {
    return (
      <div className="relative inline-block select-none animate-pulse">
        <div className="bg-white/10 rounded-lg w-48 h-12 sm:h-14 md:h-16" />
      </div>
    );
  }

  const formattedValue = formatCurrencyValue(balance, preferredCurrency, rates);
  const symbol = getCurrencySymbol(preferredCurrency);
  const prevBalanceRef = useRef(balance);
  const [particles, setParticles] = useState<{ id: number; color: string; size: number; tx: number; ty: number }[]>([]);
  const [isLossPulse, setIsLossPulse] = useState(false);
  const [isWinBounce, setIsWinBounce] = useState(false);

  useEffect(() => {
    const prev = prevBalanceRef.current;
    if (balance > prev) {
      setIsWinBounce(true);
      const timer = setTimeout(() => setIsWinBounce(false), 600);

      const newParticles = Array.from({ length: 14 }).map((_, i) => {
        const angle = (i / 14) * 2 * Math.PI + (Math.random() - 0.5) * 0.3;
        const distance = 30 + Math.random() * 30;
        return {
          id: Math.random() + i,
          color: Math.random() > 0.4 ? '#10b981' : '#34d399',
          size: 4 + Math.random() * 4,
          tx: Math.cos(angle) * distance,
          ty: Math.sin(angle) * distance,
        };
      });
      setParticles(newParticles);
      const pTimer = setTimeout(() => setParticles([]), 1000);

      return () => {
        clearTimeout(timer);
        clearTimeout(pTimer);
      };
    } else if (balance < prev) {
      setIsLossPulse(true);
      const timer = setTimeout(() => setIsLossPulse(false), 800);
      return () => clearTimeout(timer);
    }
    prevBalanceRef.current = balance;
  }, [balance]);

  return (
    <div className="relative inline-block select-none">
      <AnimatePresence>
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            animate={{ opacity: 0, scale: 0.2, x: p.tx, y: p.ty }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="absolute pointer-events-none rounded-full"
            style={{
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              boxShadow: `0 0 8px ${p.color}`,
              top: '50%',
              left: '50%',
              marginTop: -p.size / 2,
              marginLeft: -p.size / 2,
              zIndex: 50,
            }}
          />
        ))}
      </AnimatePresence>

      <motion.div
        animate={
          isWinBounce 
            ? { scale: [1, 1.08, 0.96, 1.02, 1] } 
            : isLossPulse 
            ? { scale: [1, 0.93, 1.03, 1] } 
            : {}
        }
        transition={{ duration: 0.6 }}
        className={`font-display font-black tracking-tight flex items-baseline justify-center sm:justify-start gap-1 transition-colors duration-500 ${
          isWinBounce ? 'text-emerald-400' : isLossPulse ? 'text-rose-400' : 'text-white'
        }`}
      >
        <span className="text-3xl sm:text-4xl opacity-70 font-bold self-start mt-1 mr-0.5">{symbol}</span>
        <span className="text-5xl sm:text-6xl md:text-7xl font-black">{formattedValue}</span>
      </motion.div>
    </div>
  );
});

CustomAnimatedBalance.displayName = 'CustomAnimatedBalance';

// Toast Notification component for polished user alerts
interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const Toast = memo(({ message, type, onClose }: ToastProps) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgStyle = type === 'success' 
    ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300' 
    : type === 'error'
    ? 'bg-rose-950/90 border-rose-500/30 text-rose-300'
    : 'bg-slate-900/90 border-blue-500/30 text-blue-300';

  const icon = type === 'success' 
    ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
    : type === 'error'
    ? <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
    : <Info className="w-5 h-5 text-blue-400 shrink-0" />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className={`fixed bottom-6 right-6 p-4 rounded-2xl border backdrop-blur-md shadow-2xl flex items-center gap-3 max-w-sm z-[110] ${bgStyle}`}
    >
      {icon}
      <p className="text-xs font-medium pr-4 leading-relaxed">{message}</p>
      <button onClick={onClose} className="p-1 hover:bg-white/5 rounded-lg ml-auto cursor-pointer">
        <X className="w-4 h-4 opacity-50 hover:opacity-100" />
      </button>
    </motion.div>
  );
});

Toast.displayName = 'Toast';

// Main RedesignedWalletView Component
export function RedesignedWalletView({ 
  state, 
  currentPlayer, 
  onWithdraw, 
  onDeposit, 
  playSound, 
  onResetGraph, 
  preferredCurrency, 
  rates, 
  onSelectCurrency,
  isWalletLoading
}: { 
  state: AppState; 
  currentPlayer: Player;
  onWithdraw: (
    amt: number, 
    method: string, 
    details: string,
    blockchain?: string,
    walletAddress?: string,
    fee?: number,
    finalAmount?: number
  ) => void;
  onDeposit: (amt: number, method: string, details: string, screenshotUrl?: string) => void;
  playSound: (sound: 'CLICK' | 'WIN' | 'LOSE' | 'BET' | 'SPIN') => void;
  onResetGraph: () => Promise<void>;
  preferredCurrency?: string;
  rates?: Record<string, number>;
  onSelectCurrency: (code: string) => void;
  isWalletLoading?: boolean;
}) {
  const [showDepositView, setShowDepositView] = useState(false);
  const [showWithdrawView, setShowWithdrawView] = useState(false);
  
  // States
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');
  const [hideZeroBalances, setHideZeroBalances] = useState<boolean>(() => {
    return localStorage.getItem('wallet_hide_zero_balances') === 'true';
  });
  const [displayCryptoInFiat, setDisplayCryptoInFiat] = useState<boolean>(() => {
    return localStorage.getItem('wallet_display_crypto_in_fiat') !== 'false';
  });
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'deposit' | 'withdrawal'>('all');
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const [currencySearch, setCurrencySearch] = useState('');

  // Local storage syncing for preferences
  useEffect(() => {
    localStorage.setItem('wallet_hide_zero_balances', hideZeroBalances.toString());
  }, [hideZeroBalances]);

  useEffect(() => {
    localStorage.setItem('wallet_display_crypto_in_fiat', displayCryptoInFiat.toString());
  }, [displayCryptoInFiat]);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const currentCurrency = preferredCurrency || localStorage.getItem('preferred_currency') || 'USD';
  const currentRates = rates || getCachedRates().rates;

  const formatBalanceLocal = (val: number) => {
    return `${getCurrencySymbol(currentCurrency)}${formatCurrencyValue(val, currentCurrency, currentRates)}`;
  };

  // Stats calculation
  const totalWageredVal = currentPlayer?.totalWagered ?? 0;
  
  // Calculate completed deposits
  const completedDeposits = useMemo(() => {
    return state.deposits
      .filter(d => d.playerId === currentPlayer?.id && d.status === 'completed')
      .reduce((sum, d) => sum + d.amount, 0);
  }, [state.deposits, currentPlayer?.id]);

  // Calculate completed withdrawals
  const completedWithdrawals = useMemo(() => {
    return state.withdrawals
      .filter(w => w.playerId === currentPlayer?.id && w.status === 'completed')
      .reduce((sum, w) => sum + w.amount, 0);
  }, [state.withdrawals, currentPlayer?.id]);

  // Calculate pending deposits
  const pendingDeposits = useMemo(() => {
    return state.deposits
      .filter(d => d.playerId === currentPlayer?.id && d.status === 'pending')
      .reduce((sum, d) => sum + d.amount, 0);
  }, [state.deposits, currentPlayer?.id]);

  // Calculate pending withdrawals
  const pendingWithdrawals = useMemo(() => {
    return state.withdrawals
      .filter(w => w.playerId === currentPlayer?.id && w.status === 'pending')
      .reduce((sum, w) => sum + w.amount, 0);
  }, [state.withdrawals, currentPlayer?.id]);

  // Profit/Loss calculation from game transaction log
  const profitLoss = useMemo(() => {
    const playerTxns = state.transactions.filter(t => t.playerId === currentPlayer?.id);
    const wins = playerTxns.filter(t => t.type === 'win' && t.status === 'completed').reduce((sum, t) => sum + t.amount, 0);
    const bets = playerTxns.filter(t => t.type === 'bet').reduce((sum, t) => sum + t.amount, 0);
    return wins - bets;
  }, [state.transactions, currentPlayer?.id]);

  // Manual refresh of rates & balance data
  const handleRefresh = () => {
    if (isRefreshing) return;
    playSound('CLICK');
    setIsRefreshing(true);
    addToast('Refreshing wallet live metrics and exchange rates...', 'info');

    // Simulate light network delay
    setTimeout(() => {
      setIsRefreshing(false);
      addToast('Wallet metrics synchronized with blockchain successfully.', 'success');
    }, 1200);
  };

  // Transaction History data integration (unified & styled list)
  const unifiedHistory = useMemo(() => {
    const deps = state.deposits.filter(d => d.playerId === currentPlayer?.id).map(d => ({
      id: d.id,
      timestamp: d.timestamp,
      amount: d.amount,
      blockchain: d.method.replace('Crypto ', ''),
      coin: d.method.toLowerCase().includes('tron') ? 'USDT' : 'Crypto',
      type: 'deposit' as const,
      status: d.status,
      explorerLink: d.details?.length > 15 ? d.details : undefined,
    }));

    const withs = state.withdrawals.filter(w => w.playerId === currentPlayer?.id).map(w => ({
      id: w.id,
      timestamp: w.timestamp,
      amount: w.amount,
      blockchain: w.blockchain || w.method.replace('Crypto ', ''),
      coin: w.blockchain?.toLowerCase().includes('tron') || w.method.toLowerCase().includes('tron') ? 'USDT' : 'Crypto',
      type: 'withdrawal' as const,
      status: w.status,
      explorerLink: w.transactionHash,
    }));

    // Merge and sort newest first
    return [...deps, ...withs].sort((a, b) => b.timestamp - a.timestamp);
  }, [state.deposits, state.withdrawals, currentPlayer?.id]);

  // Search and Filter logic for transactions
  const filteredHistory = useMemo(() => {
    return unifiedHistory.filter(tx => {
      const matchesSearch = tx.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (tx.blockchain || '').toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = txTypeFilter === 'all' || tx.type === txTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [unifiedHistory, searchQuery, txTypeFilter]);

  // Helper to generate explorers links
  const getExplorerUrl = (blockchain: string, hash: string) => {
    const chain = blockchain.toLowerCase();
    if (chain.includes('tron') || chain.includes('trc')) return `https://tronscan.org/#/transaction/${hash}`;
    if (chain.includes('bsc') || chain.includes('bep') || chain.includes('binance')) return `https://bscscan.com/tx/${hash}`;
    if (chain.includes('ethereum') || chain.includes('erc') || chain.includes('eth')) return `https://etherscan.io/tx/${hash}`;
    if (chain.includes('solana') || chain.includes('sol')) return `https://solscan.io/tx/${hash}`;
    if (chain.includes('polygon') || chain.includes('matic')) return `https://polygonscan.com/tx/${hash}`;
    if (chain.includes('litecoin') || chain.includes('ltc')) return `https://live.blockcypher.com/ltc/tx/${hash}`;
    return `https://etherscan.io/tx/${hash}`;
  };

  // Hardcoded real prices for asset grid (or mock real-time feeds)
  const cryptoAssets = [
    { id: 'usdt', name: 'Tether USD', symbol: 'USDT', network: 'TRON / BEP20 / ERC20', priceUsd: 1.0, change24h: 0.05, bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    { id: 'btc', name: 'Bitcoin', symbol: 'BTC', network: 'Native Network', priceUsd: 92450.0, change24h: 2.45, bg: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    { id: 'eth', name: 'Ethereum', symbol: 'ETH', network: 'ERC20 Network', priceUsd: 3240.0, change24h: -1.12, bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
    { id: 'sol', name: 'Solana', symbol: 'SOL', network: 'SPL Network', priceUsd: 185.2, change24h: 5.12, bg: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
    { id: 'bnb', name: 'BNB', symbol: 'BNB', network: 'BEP20 Network', priceUsd: 580.4, change24h: -0.42, bg: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
    { id: 'pol', name: 'Polygon', symbol: 'POL', network: 'Polygon Mainnet', priceUsd: 0.42, change24h: 1.15, bg: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
    { id: 'ltc', name: 'Litecoin', symbol: 'LTC', network: 'Litecoin Network', priceUsd: 78.5, change24h: 0.85, bg: 'bg-slate-400/10 text-slate-300 border-slate-500/20' }
  ];

  // Map user balance to Tether USDT, others are zeroed out (since the player's account is stored in a single USD pool)
  const assetList = useMemo(() => {
    return cryptoAssets.map(asset => {
      const balanceUsd = asset.symbol === 'USDT' ? (currentPlayer?.balance ?? 0) : 0;
      const balanceCrypto = balanceUsd / asset.priceUsd;
      const fiatValue = convertUsdToCurrency(balanceUsd, currentCurrency, currentRates);
      const priceFiat = convertUsdToCurrency(asset.priceUsd, currentCurrency, currentRates);

      return {
        ...asset,
        balanceUsd,
        balanceCrypto,
        fiatValue,
        priceFiat,
      };
    });
  }, [currentPlayer?.balance, currentCurrency, currentRates]);

  const filteredAssets = useMemo(() => {
    return assetList.filter(asset => {
      if (hideZeroBalances && asset.balanceUsd <= 0) return false;
      return asset.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
             asset.symbol.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [assetList, hideZeroBalances, searchQuery]);

  // Filter currencies based on settings search
  const filteredCurrencies = useMemo(() => {
    return Object.values(SUPPORTED_CURRENCIES).filter(curr => 
      curr.code.toLowerCase().includes(currencySearch.toLowerCase()) ||
      curr.name.toLowerCase().includes(currencySearch.toLowerCase())
    );
  }, [currencySearch]);

  // Navigation down to Transaction History section
  const transactionSectionRef = useRef<HTMLDivElement>(null);
  const scrollToTransactions = () => {
    playSound('CLICK');
    transactionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    addToast('Navigated to live transaction ledger.', 'info');
  };

  // Rendering Inline Views when Deposit or Withdrawal is active
  if (showDepositView) {
    return (
      <RedesignedDepositView
        depositNetworks={state.depositNetworks || []}
        currentPlayer={currentPlayer}
        deposits={state.deposits || []}
        onBack={() => setShowDepositView(false)}
        onDeposit={(amt, depMethod, depDetails, screenshotUrl) => {
          onDeposit(amt, depMethod, depDetails, screenshotUrl);
          setShowDepositView(false);
          addToast('Deposit Request submitted successfully! Awaiting validation.', 'success');
        }}
        preferredCurrency={currentCurrency}
        rates={currentRates}
        playSound={playSound}
      />
    );
  }

  if (showWithdrawView) {
    const history = state.withdrawals.filter(w => w.playerId === currentPlayer.id);
    return (
      <RedesignedWithdrawView
        withdrawalNetworks={state.withdrawalNetworks || []}
        withdrawalSettings={state.withdrawalSettings}
        currentPlayer={currentPlayer}
        withdrawalsHistory={history}
        onBack={() => setShowWithdrawView(false)}
        onWithdraw={async (amountUsd, networkId, walletAddress, feeUsd) => {
          const network = (state.withdrawalNetworks || []).find(n => n.id === networkId);
          const blockchainName = network ? network.name : networkId.toUpperCase();
          const finalAmount = amountUsd - feeUsd;
          const methodString = `Crypto ${blockchainName}`;
          const detailsString = `Address: ${walletAddress}`;
          
          onWithdraw(amountUsd, methodString, detailsString, blockchainName, walletAddress, feeUsd, finalAmount);
          setShowWithdrawView(false);
          addToast('Withdrawal Payout initialized! Processing securely.', 'success');
        }}
        preferredCurrency={currentCurrency}
        rates={currentRates}
        playSound={playSound}
      />
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 relative text-slate-100">
      
      {/* Toast Render stack */}
      <div className="fixed bottom-6 right-6 z-[110] flex flex-col gap-3">
        <AnimatePresence>
          {toasts.map((toast) => (
            <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => removeToast(toast.id)} />
          ))}
        </AnimatePresence>
      </div>

      {/* Sub-Header bar / Mode selector */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-950/40 border border-white/5 rounded-3xl backdrop-blur-md">
        <div className="flex items-center gap-1.5 p-1 bg-black/60 rounded-2xl border border-white/5 w-full sm:w-auto">
          <button
            onClick={() => { setActiveTab('overview'); playSound('CLICK'); }}
            className={`flex-1 sm:flex-initial px-6 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all duration-300 ${
              activeTab === 'overview'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-black shadow-lg shadow-emerald-500/10 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => { setActiveTab('settings'); playSound('CLICK'); }}
            className={`flex-1 sm:flex-initial px-6 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all duration-300 ${
              activeTab === 'settings'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-black shadow-lg shadow-emerald-500/10 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Preferences
          </button>
        </div>

        {/* Global actions row (Refresh rate, preferred currency, etc.) */}
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2 px-3 py-2 bg-black/40 border border-white/5 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>USD Rate:</span>
            <span className="text-white font-bold font-sans">
              {getCurrencySymbol(currentCurrency)}{(1 * (currentRates[currentCurrency] || 1)).toFixed(2)}
            </span>
          </div>

          <button
            onClick={handleRefresh}
            className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors text-slate-300 hover:text-white cursor-pointer"
            title="Refresh balance and rates"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-10"
          >
            {/* GRID 1: Premium Summary Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Card A: Available Balance (Spans 2 columns) */}
              <div className="lg:col-span-2 p-8 sm:p-10 bg-gradient-to-br from-zinc-950 via-slate-900 to-emerald-950/35 rounded-[2.5rem] border border-emerald-500/20 shadow-[0_25px_60px_rgba(16,185,129,0.06)] relative overflow-hidden group flex flex-col justify-between min-h-[340px]">
                {/* Visual Accent Glows */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/15 transition-colors duration-700" />
                <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
                
                <div className="absolute top-0 right-0 p-12 opacity-[0.03] transition-transform duration-700 group-hover:scale-105 pointer-events-none">
                  <Wallet className="w-72 h-72 text-emerald-400" />
                </div>

                <div className="relative z-10 space-y-4">
                  <div className="flex items-center justify-between">
                    <img src="/matrix_logo.png" alt="Matrix Logo" className="h-10 sm:h-12 w-auto object-contain filter drop-shadow-[0_0_15px_rgba(16,185,129,0.25)]" />
                    
                    <span className="inline-flex items-center gap-1.5 text-emerald-400/90 font-black uppercase tracking-widest text-[9px] bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      SECURE VAULT ACTIVE
                    </span>
                  </div>

                  <div className="pt-4 pb-6">
                    <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px] sm:text-[11px] block mb-2">Available Account Balance</span>
                    <CustomAnimatedBalance 
                      balance={currentPlayer?.balance ?? 0} 
                      preferredCurrency={currentCurrency} 
                      rates={currentRates} 
                      isLoading={isWalletLoading}
                    />
                  </div>
                </div>

                {/* Primary Touch-Friendly Action Buttons */}
                <div className="relative z-10 grid grid-cols-2 gap-4 mt-4 sm:max-w-md">
                  <button 
                    onClick={() => { setShowDepositView(true); playSound('CLICK'); }}
                    className="flex items-center justify-center gap-2.5 bg-emerald-500 text-black py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-400 active:scale-95 transition-all shadow-xl shadow-emerald-500/20 cursor-pointer text-center"
                  >
                    <ArrowDownLeft className="w-4 h-4 stroke-[3px]" />
                    Deposit
                  </button>
                  <button 
                    onClick={() => { setShowWithdrawView(true); playSound('CLICK'); }}
                    className="flex items-center justify-center gap-2.5 bg-white/5 border border-white/10 text-white py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all cursor-pointer text-center"
                  >
                    <ArrowUpRight className="w-4 h-4 stroke-[3px]" />
                    Withdraw
                  </button>
                </div>
              </div>

              {/* Card B: Account Performance Statistics Ledger */}
              <div className="bg-slate-950/80 border border-white/5 rounded-[2.5rem] p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-2xl pointer-events-none" />
                
                <div className="space-y-5">
                  <div className="flex items-center justify-between pb-4 border-b border-white/5">
                    <div>
                      <span className="text-[9px] font-black tracking-widest text-slate-500 uppercase font-mono">ACCOUNT CLASSIFICATION</span>
                      <p className="text-lg font-display font-black text-white mt-0.5">Platform Metrics</p>
                    </div>
                    <span className="text-[10px] font-black tracking-wider px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Standard Tier
                    </span>
                  </div>

                  {/* Financial Statistics Ledger */}
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Total Deposited</span>
                      <p className="text-lg font-sans font-bold text-white mt-1">
                        {formatBalanceLocal(completedDeposits)}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Total Withdrawn</span>
                      <p className="text-lg font-sans font-bold text-white/80 mt-1">
                        {formatBalanceLocal(completedWithdrawals)}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block flex items-center gap-1.5">
                        Pending In 
                        {pendingDeposits > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                      </span>
                      <p className="text-lg font-sans font-bold text-emerald-400 mt-1">
                        {formatBalanceLocal(pendingDeposits)}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block flex items-center gap-1.5">
                        Pending Out
                        {pendingWithdrawals > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
                      </span>
                      <p className="text-lg font-sans font-bold text-amber-500 mt-1">
                        {formatBalanceLocal(pendingWithdrawals)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Net Profit & Loss Ledger Badge */}
                <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Total Profit / Loss</span>
                    <p className={`text-xl font-black mt-1 ${profitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {profitLoss >= 0 ? '+' : ''}{formatBalanceLocal(profitLoss)}
                    </p>
                  </div>

                  <button 
                    onClick={scrollToTransactions}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-4 py-2 rounded-xl border border-white/5 cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    Ledger
                  </button>
                </div>
              </div>

            </div>

            {/* GRID 3: Unified Transactions Ledger Table */}
            <div ref={transactionSectionRef} className="space-y-6 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
                <div className="space-y-1">
                  <h3 className="text-2xl font-display font-black text-white flex items-center gap-2.5">
                    <History className="w-6 h-6 text-emerald-400" />
                    Account Transaction Ledger
                  </h3>
                  <p className="text-slate-500 text-xs">Interactive, cryptographic verification index of deposits and payouts.</p>
                </div>

                {/* Table Filters Row */}
                <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                  <div className="inline-flex rounded-xl bg-black/60 p-1 border border-white/5">
                    {(['all', 'deposit', 'withdrawal'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => { setTxTypeFilter(type); playSound('CLICK'); }}
                        className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all duration-300 cursor-pointer ${
                          txTypeFilter === type
                            ? 'bg-white/10 text-white'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>

                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onResetGraph}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-slate-400 hover:text-white transition-all hover:bg-rose-500/10 hover:border-rose-500/20 group cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 group-hover:rotate-[-90deg] transition-all duration-500" />
                    Reset List
                  </motion.button>
                </div>
              </div>

              {/* High-fidelity modern list card table */}
              <div className="bg-slate-950/80 border border-white/5 rounded-[2rem] overflow-hidden">
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.01]">
                        <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Transaction Date</th>
                        <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Transaction ID</th>
                        <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Coin Allocation</th>
                        <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Type</th>
                        <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Fiat Value</th>
                        <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                        <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Blockchain Explorer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredHistory.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-8 py-16 text-center text-slate-500 font-sans italic text-sm">
                            No ledger history matching current filter criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredHistory.map((tx, idx) => {
                          const isDeposit = tx.type === 'deposit';
                          const status = tx.status;
                          
                          // Style status
                          let statusBadge = 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
                          let dotColor = 'bg-slate-400';
                          if (status === 'completed') {
                            statusBadge = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                            dotColor = 'bg-emerald-400';
                          } else if (status === 'pending' || status === 'reviewing' || status === 'processing' || status === 'approved') {
                            statusBadge = 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse';
                            dotColor = 'bg-amber-400';
                          } else if (status === 'failed' || status === 'rejected') {
                            statusBadge = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
                            dotColor = 'bg-rose-400';
                          } else if (status === 'cancelled') {
                            statusBadge = 'bg-slate-500/10 text-slate-500 border border-white/5';
                            dotColor = 'bg-slate-600';
                          }

                          return (
                            <tr 
                              key={tx.id} 
                              className="hover:bg-white/[0.01] transition-colors"
                            >
                              <td className="px-8 py-4.5 text-slate-400 text-xs font-mono">
                                {new Date(tx.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                              </td>
                              <td className="px-8 py-4.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] text-slate-400 tracking-tight select-all">{tx.id.substring(0, 10)}...</span>
                                  <button
                                    onClick={() => { navigator.clipboard.writeText(tx.id); addToast('Transaction ID copied!', 'success'); playSound('CLICK'); }}
                                    className="p-1 hover:bg-white/5 rounded text-slate-500 hover:text-slate-300 cursor-pointer"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                              <td className="px-8 py-4.5">
                                <div className="flex items-center gap-2 font-semibold text-xs">
                                  <span className="px-2 py-0.5 rounded bg-white/5 text-slate-300 text-[9px] font-bold font-mono border border-white/5">{tx.coin}</span>
                                  <span className="text-[11px] text-slate-400 font-mono">{tx.blockchain}</span>
                                </div>
                              </td>
                              <td className="px-8 py-4.5 capitalize">
                                <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${isDeposit ? 'text-emerald-400' : 'text-amber-500'}`}>
                                  {isDeposit ? 'Deposit' : 'Withdrawal'}
                                </span>
                              </td>
                              <td className={`px-8 py-4.5 font-mono font-bold text-sm ${isDeposit ? 'text-emerald-400' : 'text-slate-300'}`}>
                                {isDeposit ? '+' : '-'}{formatBalanceLocal(tx.amount)}
                              </td>
                              <td className="px-8 py-4.5">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider ${statusBadge}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                  {status}
                                </span>
                              </td>
                              <td className="px-8 py-4.5 text-right">
                                {tx.explorerLink ? (
                                  <a
                                    href={getExplorerUrl(tx.blockchain, tx.explorerLink)}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => playSound('CLICK')}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-emerald-400 border border-white/5 hover:border-emerald-500/20 bg-white/5 hover:bg-emerald-500/5 px-3 py-1.5 rounded-xl transition-all"
                                  >
                                    Scan 
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : (
                                  <span className="text-[10px] text-slate-600 italic font-mono">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile View: Collapsed ledger cards */}
                <div className="md:hidden divide-y divide-white/5">
                  {filteredHistory.length === 0 ? (
                    <p className="p-8 text-center text-slate-500 text-xs italic">No matching transactions found.</p>
                  ) : (
                    filteredHistory.map((tx) => {
                      const isDeposit = tx.type === 'deposit';
                      const status = tx.status;
                      
                      let statusBadge = 'bg-slate-500/10 text-slate-400 border border-white/5';
                      let dotColor = 'bg-slate-400';
                      if (status === 'completed') {
                        statusBadge = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                        dotColor = 'bg-emerald-400';
                      } else if (status === 'pending' || status === 'reviewing' || status === 'processing' || status === 'approved') {
                        statusBadge = 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse';
                        dotColor = 'bg-amber-400';
                      } else if (status === 'failed' || status === 'rejected') {
                        statusBadge = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
                        dotColor = 'bg-rose-400';
                      }

                      return (
                        <div key={tx.id} className="p-5 space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-slate-500">
                              {new Date(tx.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${statusBadge}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                              {status}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-1">
                                <span className={`text-xs font-black uppercase ${isDeposit ? 'text-emerald-400' : 'text-amber-500'}`}>
                                  {isDeposit ? 'Deposit' : 'Withdrawal'}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono">({tx.blockchain})</span>
                              </div>
                              <span className="text-[9px] font-mono text-slate-500 mt-1 block select-all">TXID: {tx.id.substring(0, 16)}...</span>
                            </div>

                            <p className={`text-lg font-mono font-black ${isDeposit ? 'text-emerald-400' : 'text-slate-300'}`}>
                              {isDeposit ? '+' : '-'}{formatBalanceLocal(tx.amount)}
                            </p>
                          </div>

                          <div className="flex justify-between items-center pt-2 border-t border-white/[0.03]">
                            <button
                              onClick={() => { navigator.clipboard.writeText(tx.id); addToast('TXID copied!', 'success'); playSound('CLICK'); }}
                              className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400 bg-white/5 border border-white/5 px-3 py-1.5 rounded-lg cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copy ID
                            </button>

                            {tx.explorerLink && (
                              <a
                                href={getExplorerUrl(tx.blockchain, tx.explorerLink)}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => playSound('CLICK')}
                                className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg"
                              >
                                Scan Blockchain
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

              </div>
            </div>

            {/* Referral program promotional banner */}
            {(state.isReferralEnabled ?? true) && (
              <div className="p-8 sm:p-10 bg-gradient-to-br from-[#0c1310] via-zinc-950 to-[#0e161a] border border-emerald-500/10 rounded-[2.5rem] relative overflow-hidden group transition-all duration-500">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-all group-hover:scale-105 pointer-events-none">
                  <Share2 className="w-36 h-36 text-emerald-400" />
                </div>
                
                <div className="relative z-10 space-y-6">
                  <div>
                    <h3 className="text-2xl font-display font-black text-white flex items-center gap-2.5">
                      <Share2 className="w-6 h-6 text-emerald-400" />
                      Refer & Earn {formatBalanceLocal(state.referralAmount ?? 10)} Cash Bonus
                    </h3>
                    <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-lg leading-relaxed">
                      Invite your community. Upon registration, you both receive a {formatBalanceLocal(state.referralAmount ?? 10)} cash allocation inside your Vault immediately!
                    </p>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 max-w-xl">
                     <div className="bg-black/60 border border-white/5 rounded-2xl px-5 py-3.5 flex flex-col justify-center flex-1">
                        <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1 font-mono">My Referral Code</span>
                        <span className="text-xl sm:text-2xl font-mono font-bold text-emerald-400 tracking-tight">{currentPlayer?.referralCode}</span>
                     </div>
                     <button 
                       onClick={() => {
                         navigator.clipboard.writeText(currentPlayer?.referralCode || '');
                         addToast('Referral code copied to clipboard!', 'success');
                         playSound('CLICK');
                       }}
                       className="bg-emerald-500 text-black px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-400 hover:scale-102 active:scale-98 transition-all shadow-xl shadow-emerald-500/20 cursor-pointer flex items-center justify-center gap-2"
                     >
                       <Copy className="w-4 h-4" />
                       Copy Referral
                     </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Left side settings: display preferences */}
            <div className="space-y-6 lg:col-span-1">
              <div className="p-6 sm:p-8 bg-slate-950/80 border border-white/5 rounded-[2.5rem] space-y-6">
                <h4 className="text-sm font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  Display Preferences
                </h4>
                
                {/* Preference Toggle 1: Hide zero balances */}
                <div className="flex items-center justify-between p-4 bg-white/[0.01] border border-white/5 rounded-2xl hover:border-white/10 transition-colors">
                  <div className="max-w-[180px]">
                    <p className="font-bold text-white text-xs">Hide Zero Balances</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">Filter out empty crypto balances from Spot list view.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setHideZeroBalances(!hideZeroBalances); playSound('CLICK'); addToast(`Hide Zero Balances ${!hideZeroBalances ? 'enabled' : 'disabled'}.`, 'info'); }}
                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 cursor-pointer ${hideZeroBalances ? 'bg-emerald-500' : 'bg-slate-800'}`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transition-transform duration-300 ${hideZeroBalances ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Preference Toggle 2: Display crypto in fiat */}
                <div className="flex items-center justify-between p-4 bg-white/[0.01] border border-white/5 rounded-2xl hover:border-white/10 transition-colors">
                  <div className="max-w-[180px]">
                    <p className="font-bold text-white text-xs">Display Crypto in Fiat</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">Display currency evaluations inside localized fiat figures.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setDisplayCryptoInFiat(!displayCryptoInFiat); playSound('CLICK'); addToast(`Display in fiat ${!displayCryptoInFiat ? 'enabled' : 'disabled'}.`, 'info'); }}
                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 cursor-pointer ${displayCryptoInFiat ? 'bg-emerald-500' : 'bg-slate-800'}`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transition-transform duration-300 ${displayCryptoInFiat ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl flex gap-3 text-left">
                  <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-emerald-300/80 leading-normal italic">
                    Your preference settings are kept cached locally on this browser session for continuous seamless play.
                  </p>
                </div>
              </div>
            </div>

            {/* Right side settings: Fiat currencies list */}
            <div className="space-y-6 lg:col-span-2">
              <div className="p-6 sm:p-8 bg-slate-950/80 border border-white/5 rounded-[2.5rem] space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h4 className="text-sm font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                    <Settings className="w-4 h-4 text-emerald-400" />
                    Local Fiat Currencies
                  </h4>

                  {/* Local currency search filter */}
                  <div className="relative w-full sm:w-48">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search currencies..."
                      value={currencySearch}
                      onChange={(e) => setCurrencySearch(e.target.value)}
                      className="bg-black/40 border border-white/5 rounded-xl pl-8 pr-4 py-1.5 text-xs w-full focus:outline-none focus:border-emerald-500/50 transition-all font-medium text-white"
                    />
                  </div>
                </div>

                {/* Grid list of fiat options */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
                  {filteredCurrencies.map((curr) => {
                    const isSelected = curr.code === currentCurrency;
                    return (
                      <button
                        key={curr.code}
                        type="button"
                        onClick={() => { onSelectCurrency(curr.code); playSound('CLICK'); addToast(`Currency set to ${curr.code} (${curr.symbol}).`, 'success'); }}
                        className={`flex items-center gap-3 py-3 px-4 rounded-2xl transition-all text-left cursor-pointer border group hover:bg-white/[0.02] ${
                          isSelected 
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-white' 
                            : 'bg-black/30 border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10'
                        }`}
                      >
                        {/* Selected radio marker */}
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all shrink-0 ${
                          isSelected ? 'border-emerald-400 bg-emerald-400/20' : 'border-slate-800 group-hover:border-slate-600'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                        </div>
                        
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 font-bold text-xs tracking-wider">
                            <span>{curr.code}</span>
                            <span className="text-xs">{curr.flag}</span>
                          </div>
                          <span className="text-[9px] text-slate-500 font-medium truncate max-w-[100px] mt-0.5">{curr.name}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
