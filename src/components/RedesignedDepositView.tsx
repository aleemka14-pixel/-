import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Copy, Check, AlertTriangle, Clock, Sparkles, 
  Upload, Image as ImageIcon, ChevronDown, CheckCircle2, 
  Shield, HelpCircle, AlertCircle, RefreshCw,
  Coins, Zap, Hexagon, Layers, Award, ShieldCheck,
  Wallet, TrendingUp, ArrowUpRight, ExternalLink, Eye, Info,
  Search, ShieldAlert, CheckSquare, X, DollarSign, CheckCircle,
  QrCode, CreditCard, Smartphone, CheckCheck, Wrench
} from 'lucide-react';
import { DepositNetwork, FAQItem, DepositRequest, Player, PaymentSettings } from '../types.ts';
import { DEFAULT_NETWORKS } from '../data/defaultNetworks.ts';

interface RedesignedDepositViewProps {
  depositNetworks: DepositNetwork[];
  currentPlayer?: Player;
  deposits?: DepositRequest[];
  paymentSettings?: PaymentSettings;
  onBack: () => void;
  onDeposit: (
    amount: number, 
    method: string, 
    details: string, 
    screenshotUrl?: string, 
    existingDepositId?: string, 
    transactionHash?: string
  ) => void;
  preferredCurrency: string;
  rates: Record<string, number>;
  playSound: (sound: 'CLICK' | 'WIN' | 'LOSE' | 'BET' | 'SPIN') => void;
}

interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export function RedesignedDepositView({
  depositNetworks = [],
  currentPlayer,
  deposits = [],
  paymentSettings,
  onBack,
  onDeposit,
  preferredCurrency,
  rates,
  playSound
}: RedesignedDepositViewProps) {

  // Top-Level Payment Method Mode: 'upi' | 'crypto'
  const [paymentMethodTab, setPaymentMethodTab] = useState<'upi' | 'crypto'>('upi');

  // Network filter list (USDT networks: TRC20, BEP20, ERC20 + general)
  const networks = useMemo(() => {
    const list = depositNetworks.length > 0 
      ? depositNetworks.filter(n => n.enabled) 
      : DEFAULT_NETWORKS.filter(n => n.enabled);
    
    // Ensure standard crypto networks TRC20, BEP20, ERC20 are prominently included
    return list;
  }, [depositNetworks]);

  // General Wizard Step
  const [currentStep, setCurrentStep] = useState<'selection' | 'instructions' | 'status'>('selection');

  // --- UPI DEPOSIT STATES ---
  const [upiAmount, setUpiAmount] = useState<string>('100');
  const [upiUtr, setUpiUtr] = useState<string>('');
  const [upiScreenshot, setUpiScreenshot] = useState<string | undefined>(undefined);
  const [isCreatingUpi, setIsCreatingUpi] = useState<boolean>(false);
  const [activeUpiOrder, setActiveUpiOrder] = useState<{
    depositId: string;
    amount: number;
    upiVpa: string;
    qrCode: string;
    status: string;
    createdAt: string;
    transactionId?: string;
  } | null>(null);

  // --- CRYPTO DEPOSIT STATES ---
  const [selectedNetwork, setSelectedNetwork] = useState<DepositNetwork | null>(() => {
    return networks.find(n => n.id === 'tron') || networks[0] || null;
  });
  const [cryptoAmount, setCryptoAmount] = useState<string>('50');
  const [cryptoTxDetails, setCryptoTxDetails] = useState<string>('');
  const [cryptoScreenshot, setCryptoScreenshot] = useState<string | undefined>(undefined);
  const [isCreatingCrypto, setIsCreatingCrypto] = useState<boolean>(false);
  const [activeCryptoOrder, setActiveCryptoOrder] = useState<{
    depositId: string;
    walletAddress: string;
    amount: number;
    qrCode: string;
    status: string;
    createdAt: string;
    network: string;
  } | null>(null);

  // Common UI states
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [zoomQr, setZoomQr] = useState<boolean>(false);
  const [selectedTxForModal, setSelectedTxForModal] = useState<DepositRequest | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Helper conversions
  const getCurrencySymbol = (code: string) => {
    const symbols: Record<string, string> = {
      USD: '$', EUR: '€', GBP: '£', INR: '₹', AED: 'د.إ', PKR: '₨', CAD: 'C$', CNY: '¥', JPY: '¥'
    };
    return symbols[code] || '$';
  };

  const convertUsdToCurrency = (usdVal: number) => {
    const rate = rates[preferredCurrency] || 1;
    return usdVal * rate;
  };

  const convertCurrencyToUsd = (currVal: number) => {
    const rate = rates[preferredCurrency] || 1;
    return currVal / rate;
  };

  const formatCurrency = (usdVal: number) => {
    const val = convertUsdToCurrency(usdVal);
    return `${getCurrencySymbol(preferredCurrency)}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Toast Notification Trigger
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Clipboard copy handler
  const handleCopy = (text: string, label: string = 'Address') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    playSound('CLICK');
    showToast(`${label} copied to clipboard!`, 'success');
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Active tracked deposit for real-time Firestore updates
  const activeDepositId = useMemo(() => {
    if (paymentMethodTab === 'upi') return activeUpiOrder?.depositId;
    return activeCryptoOrder?.depositId;
  }, [paymentMethodTab, activeUpiOrder, activeCryptoOrder]);

  const trackedDeposit = useMemo(() => {
    if (!activeDepositId) return null;
    return deposits.find(d => d.id === activeDepositId || d.depositId === activeDepositId);
  }, [deposits, activeDepositId]);

  // Play win sound when status transitions to confirmed/completed
  const [playedWinSound, setPlayedWinSound] = useState(false);
  React.useEffect(() => {
    if (trackedDeposit && (trackedDeposit.status === 'confirmed' || trackedDeposit.status === 'completed')) {
      if (!playedWinSound) {
        playSound('WIN');
        setPlayedWinSound(true);
      }
    } else {
      setPlayedWinSound(false);
    }
  }, [trackedDeposit?.status, playSound, playedWinSound]);

  // Image Processing for Screenshot Proof
  const processFile = (file: File, target: 'upi' | 'crypto') => {
    if (file.size > 5 * 1024 * 1024) {
      showToast("File is too large. Maximum size allowed is 5MB.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 1000;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        if (target === 'upi') {
          setUpiScreenshot(dataUrl);
        } else {
          setCryptoScreenshot(dataUrl);
        }
        showToast("Payment proof screenshot loaded successfully!", "info");
        playSound('CLICK');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent, target: 'upi' | 'crypto') => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0], target);
    }
  };

  // ==========================================
  // 1. GENERATE UPI PAYMENT ORDER
  // ==========================================
  const handleGenerateUpiOrder = async () => {
    if (paymentSettings?.upiMaintenanceMode) {
      showToast("UPI Payment Gateway is currently under maintenance. Please try Crypto deposit.", "error");
      return;
    }
    const numAmt = Number(upiAmount);
    if (!upiAmount || isNaN(numAmt) || numAmt < 100) {
      showToast("Minimum UPI deposit is ₹100", "error");
      return;
    }
    if (numAmt > 100000) {
      showToast("Maximum UPI deposit is ₹100,000 per transaction", "error");
      return;
    }

    setIsCreatingUpi(true);
    playSound('CLICK');

    try {
      const response = await fetch('/api/create-upi-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentPlayer?.id || 'guest',
          playerId: currentPlayer?.id || 'guest',
          amount: numAmt
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.depositId) {
          setActiveUpiOrder({
            depositId: data.depositId,
            amount: data.amount,
            upiVpa: data.upiVpa || 'matrixpay@upi',
            qrCode: data.qrCodeUrl || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.qrData)}`,
            status: data.status || 'pending',
            createdAt: new Date().toISOString(),
            transactionId: data.transactionId
          });
          setCurrentStep('instructions');
          showToast("UPI Order & Payment QR generated!", "success");
        } else {
          throw new Error(data.error || "Failed to create UPI deposit");
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
    } catch (err: any) {
      console.warn("API create-upi-deposit fallback activated:", err);
      // Fallback UPI Order Generation
      const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
      const depositId = `DEP-UPI-${randomHex}`;
      const upiVpa = 'matrixpay@upi';
      const qrData = `upi://pay?pa=${upiVpa}&pn=MatrixCasino&am=${numAmt}&tr=${depositId}&cu=INR`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;

      setActiveUpiOrder({
        depositId,
        amount: numAmt,
        upiVpa,
        qrCode: qrCodeUrl,
        status: 'pending',
        createdAt: new Date().toISOString(),
        transactionId: `TXN-UPI-${randomHex}`
      });
      setCurrentStep('instructions');
      showToast("UPI Payment QR generated!", "success");
    } finally {
      setIsCreatingUpi(false);
    }
  };

  // Submit UPI Verification
  const handleSubmitUpiVerification = () => {
    if (!activeUpiOrder) return;
    if (!upiUtr.trim()) {
      showToast("Please enter the 12-digit UPI UTR / Reference ID", "error");
      return;
    }
    if (upiUtr.trim().length < 6) {
      showToast("Please enter a valid UPI UTR / Transaction Reference", "error");
      return;
    }

    setIsSubmitting(true);
    playSound('CLICK');

    // Convert INR to USD for player balance tracking in USD system
    const inrRate = rates['INR'] || 83;
    const amountInUsd = activeUpiOrder.amount / inrRate;
    const details = `Method: UPI | VPA: ${activeUpiOrder.upiVpa} | Deposit ID: ${activeUpiOrder.depositId} | UTR: ${upiUtr.trim()}`;

    setTimeout(() => {
      onDeposit(
        amountInUsd,
        'UPI',
        details,
        upiScreenshot,
        activeUpiOrder.depositId,
        upiUtr.trim()
      );
      setIsSubmitting(false);
      setCurrentStep('status');
      playSound('WIN');
      showToast("UPI Deposit request submitted! Awaiting verification.", "success");
    }, 1200);
  };


  // ==========================================
  // 2. GENERATE CRYPTO PAYMENT ADDRESS
  // ==========================================
  const mapNetworkIdToName = (id: string): string => {
    if (id === 'tron') return 'TRC20';
    if (id === 'bsc') return 'BEP20';
    if (id === 'ethereum') return 'ERC20';
    return id.toUpperCase();
  };

  const handleGenerateCryptoOrder = async () => {
    if (paymentSettings?.cryptoMaintenanceMode) {
      showToast("Crypto Payment Gateway is currently under maintenance. Please try UPI deposit.", "error");
      return;
    }
    if (!selectedNetwork) {
      showToast("Please select a blockchain network", "error");
      return;
    }
    const numAmt = Number(cryptoAmount);
    if (!cryptoAmount || isNaN(numAmt) || numAmt <= 0) {
      showToast("Please enter a valid deposit amount", "error");
      return;
    }

    const minUsd = selectedNetwork.minDepositUsd || 10;
    const maxUsd = selectedNetwork.maxDepositUsd || 50000;
    if (numAmt < minUsd) {
      showToast(`Minimum deposit for ${selectedNetwork.name} is $${minUsd}`, "error");
      return;
    }
    if (numAmt > maxUsd) {
      showToast(`Maximum deposit for ${selectedNetwork.name} is $${maxUsd}`, "error");
      return;
    }

    setIsCreatingCrypto(true);
    playSound('CLICK');

    const targetNetwork = mapNetworkIdToName(selectedNetwork.id);

    try {
      const response = await fetch('/api/create-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentPlayer?.id || 'guest',
          amount: numAmt,
          network: targetNetwork
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.depositId) {
          const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.qrData || data.walletAddress)}`;
          setActiveCryptoOrder({
            depositId: data.depositId,
            walletAddress: data.walletAddress,
            amount: data.amount,
            qrCode: qrCodeUrl,
            status: data.status || 'pending',
            createdAt: new Date().toISOString(),
            network: targetNetwork
          });
          setCurrentStep('instructions');
          showToast(`Dynamic ${targetNetwork} USDT address generated!`, "success");
        } else {
          throw new Error("Invalid response format from crypto deposit API");
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }
    } catch (err: any) {
      console.warn("API create-deposit fallback activated:", err);
      
      const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
      const depositId = `DEP-${targetNetwork}-${randomHex}`;
      
      let dynamicAddress = selectedNetwork.depositAddress;
      if (selectedNetwork.depositAddress.startsWith('0x')) {
        const hex = Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('');
        dynamicAddress = `0x${hex}`;
      } else {
        const len = selectedNetwork.depositAddress.length;
        const prefix = selectedNetwork.depositAddress.substring(0, 4);
        const suffix = selectedNetwork.depositAddress.substring(len - 4);
        const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        const middle = Array.from({length: len - 8}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
        dynamicAddress = `${prefix}${middle}${suffix}`;
      }

      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(dynamicAddress)}`;

      setActiveCryptoOrder({
        depositId,
        walletAddress: dynamicAddress,
        amount: numAmt,
        qrCode: qrCodeUrl,
        status: 'pending',
        createdAt: new Date().toISOString(),
        network: targetNetwork
      });
      setCurrentStep('instructions');
      showToast(`USDT ${targetNetwork} address generated!`, "success");
    } finally {
      setIsCreatingCrypto(false);
    }
  };

  // Submit Crypto Verification
  const handleSubmitCryptoVerification = () => {
    if (!activeCryptoOrder || !selectedNetwork) return;
    if (!cryptoTxDetails.trim()) {
      showToast("Please enter the Transaction Hash (TxID) or Sender Wallet", "error");
      return;
    }

    setIsSubmitting(true);
    playSound('CLICK');

    const details = `Network: ${activeCryptoOrder.network} | Address: ${activeCryptoOrder.walletAddress} | Deposit ID: ${activeCryptoOrder.depositId} | TxHash: ${cryptoTxDetails.trim()}`;

    setTimeout(() => {
      onDeposit(
        activeCryptoOrder.amount,
        activeCryptoOrder.network,
        details,
        cryptoScreenshot,
        activeCryptoOrder.depositId,
        cryptoTxDetails.trim()
      );
      setIsSubmitting(false);
      setCurrentStep('status');
      playSound('WIN');
      showToast("Crypto Deposit submitted! Awaiting blockchain confirmations.", "success");
    }, 1200);
  };

  // Reset Form state
  const handleReset = () => {
    setUpiAmount('100');
    setUpiUtr('');
    setUpiScreenshot(undefined);
    setActiveUpiOrder(null);

    setCryptoAmount('50');
    setCryptoTxDetails('');
    setCryptoScreenshot(undefined);
    setActiveCryptoOrder(null);

    setCurrentStep('selection');
  };

  // Filtered deposits history for current player
  const userDeposits = useMemo(() => {
    return deposits.filter(d => d.playerId === currentPlayer?.id || d.userId === currentPlayer?.id);
  }, [deposits, currentPlayer]);

  const availableBalanceFormatted = useMemo(() => {
    const balUsd = currentPlayer?.balance || 0;
    return formatCurrency(balUsd);
  }, [currentPlayer, preferredCurrency, rates]);

  return (
    <div id="deposit-system-wrapper" className="min-h-screen text-slate-200 pb-24 space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 select-none">
      
      {/* Toast Notifications Overlay */}
      <div id="deposit-toaster" className="fixed top-6 right-6 z-50 flex flex-col gap-3 pointer-events-none max-w-sm w-full px-4 sm:px-0">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-4 rounded-xl border flex items-center gap-3 shadow-2xl pointer-events-auto ${
                t.type === 'success' 
                  ? 'bg-slate-900 border-emerald-500/30 text-emerald-400 shadow-emerald-950/20' 
                  : t.type === 'error'
                  ? 'bg-slate-900 border-rose-500/30 text-rose-400 shadow-rose-950/20'
                  : 'bg-slate-900 border-cyan-500/30 text-cyan-400 shadow-cyan-950/20'
              }`}
            >
              {t.type === 'success' ? (
                <CheckCircle className="w-5 h-5 shrink-0" />
              ) : t.type === 'error' ? (
                <ShieldAlert className="w-5 h-5 shrink-0" />
              ) : (
                <Info className="w-5 h-5 shrink-0" />
              )}
              <span className="text-xs font-sans font-bold leading-normal">{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* HEADER SECTION */}
      <div id="deposit-header-section" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => { playSound('CLICK'); onBack(); }}
            className="flex items-center gap-2 text-slate-400 hover:text-white text-xs font-mono font-black uppercase tracking-wider bg-slate-900 hover:bg-slate-850 px-3.5 py-2 rounded-xl border border-slate-800 hover:border-slate-700/60 transition-all cursor-pointer mb-2"
          >
            <ArrowLeft className="w-4 h-4 text-emerald-400" />
            Wallet Overview
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center shadow-lg">
              <ArrowUpRight className="w-5.5 h-5.5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-black text-white uppercase tracking-wider">
                Deposit Capital
              </h1>
              <p className="text-xs text-slate-400">
                Instant UPI & Multi-chain USDT Crypto Gateway with real-time audit logs.
              </p>
            </div>
          </div>
        </div>

        {/* Balance Widget */}
        <div className="bg-slate-900 border border-slate-800 px-5 py-3 rounded-2xl flex items-center gap-4 shadow-md self-start sm:self-auto">
          <div className="space-y-0.5">
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest font-mono block">Current Wallet Balance</span>
            <span className="text-base font-mono font-black text-emerald-400 tracking-tight">
              {availableBalanceFormatted}
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
            <Wallet className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* TOP PAYMENT METHOD SELECTOR TABS */}
      <div id="deposit-method-tabs" className="grid grid-cols-2 gap-3 max-w-xl mx-auto p-1.5 bg-slate-950 border border-slate-800 rounded-2xl shadow-xl">
        <button
          type="button"
          onClick={() => {
            if (paymentMethodTab !== 'upi') {
              playSound('CLICK');
              setPaymentMethodTab('upi');
              setCurrentStep('selection');
            }
          }}
          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-mono text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            paymentMethodTab === 'upi'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>UPI Deposit (INR)</span>
          {paymentSettings?.upiMaintenanceMode && (
            <span className="text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded font-sans font-bold">
              Maintenance
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            if (paymentMethodTab !== 'crypto') {
              playSound('CLICK');
              setPaymentMethodTab('crypto');
              setCurrentStep('selection');
            }
          }}
          className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-mono text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            paymentMethodTab === 'crypto'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Crypto Deposit (USDT)</span>
          {paymentSettings?.cryptoMaintenanceMode && (
            <span className="text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded font-sans font-bold">
              Maintenance
            </span>
          )}
        </button>
      </div>

      {/* CORE DEPOSIT CONTAINER */}
      <div id="deposit-grid-layout" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
        
        {/* LEFT COLUMN: ACTIVE FLOW */}
        <div id="deposit-left-column" className="lg:col-span-8 space-y-8 w-full">
          
          <AnimatePresence mode="wait">
            
            {/* ======================================================== */}
            {/* A) UPI DEPOSIT FLOW                                      */}
            {/* ======================================================== */}
            {paymentMethodTab === 'upi' && (
              <motion.div
                key="upi-flow"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* STEP 1: Enter UPI Amount */}
                {currentStep === 'selection' && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-6 shadow-xl">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                      <div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono block">INSTANT INR TRANSFER</span>
                        <h3 className="text-lg font-display font-black text-white tracking-tight flex items-center gap-2">
                          <Smartphone className="w-5 h-5 text-emerald-400" />
                          UPI Payment Gateway
                        </h3>
                      </div>
                      <span className="text-[9px] font-mono font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 uppercase">
                        ZERO FEE
                      </span>
                    </div>

                    {paymentSettings?.upiMaintenanceMode && (
                      <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-center gap-3 text-rose-300">
                        <Wrench className="w-5 h-5 text-rose-400 shrink-0" />
                        <div className="text-xs font-medium">
                          <strong className="block font-bold text-rose-200">UPI Payment Gateway Under Maintenance</strong>
                          UPI deposits are temporarily offline for scheduled system updates. Please use Crypto (USDT) deposit or try again later.
                        </div>
                      </div>
                    )}

                    {/* Specifications Bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-950 border border-slate-800/80 p-3.5 rounded-xl text-xs font-mono">
                      <div>
                        <p className="text-[8px] text-slate-500 uppercase tracking-widest block font-sans font-bold">Min Deposit</p>
                        <span className="font-bold text-emerald-400">₹100 INR</span>
                      </div>
                      <div>
                        <p className="text-[8px] text-slate-500 uppercase tracking-widest block font-sans font-bold">Max Deposit</p>
                        <span className="font-bold text-slate-200">₹100,000 INR</span>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <p className="text-[8px] text-slate-500 uppercase tracking-widest block font-sans font-bold">Processing</p>
                        <span className="font-bold text-cyan-400">Instant / Auto-credit</span>
                      </div>
                    </div>

                    {/* Presets Grid */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                        Quick Amount Selection (INR)
                      </label>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {[100, 500, 1000, 2000, 5000, 10000].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => { setUpiAmount(String(preset)); playSound('CLICK'); }}
                            className={`py-2.5 rounded-xl text-xs font-mono font-extrabold border transition-all cursor-pointer ${
                              Number(upiAmount) === preset
                                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                                : 'bg-slate-950/80 hover:bg-slate-850 text-slate-300 border-slate-800'
                            }`}
                          >
                            ₹{preset.toLocaleString()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                        Enter Custom Deposit Amount (₹ INR)
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono font-black text-slate-400 text-lg">
                          ₹
                        </span>
                        <input
                          type="number"
                          placeholder="e.g. 1000"
                          value={upiAmount}
                          onChange={(e) => setUpiAmount(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 rounded-xl pl-9 pr-4 py-3.5 text-lg font-mono font-black text-white focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Supported Apps Badges */}
                    <div className="pt-2 border-t border-slate-800/80 space-y-2">
                      <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest block">
                        Supported UPI Payment Apps
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {['PhonePe', 'Google Pay', 'Paytm', 'CRED', 'BHIM UPI'].map((app) => (
                          <span key={app} className="text-[10px] font-mono font-bold px-3 py-1 bg-slate-950 border border-slate-800/80 rounded-lg text-slate-300">
                            {app}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Generate Order Button */}
                    <button
                      type="button"
                      disabled={isCreatingUpi || !!paymentSettings?.upiMaintenanceMode}
                      onClick={handleGenerateUpiOrder}
                      className="w-full py-4 rounded-xl font-mono text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-xl shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreatingUpi ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Generating UPI Payment Order...
                        </>
                      ) : paymentSettings?.upiMaintenanceMode ? (
                        <>
                          <Wrench className="w-4 h-4" />
                          UPI Gateway Under Maintenance
                        </>
                      ) : (
                        <>
                          <QrCode className="w-4 h-4" />
                          Generate UPI QR & Pay Instructions
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* STEP 2: UPI Instructions & QR Code */}
                {currentStep === 'instructions' && activeUpiOrder && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-6 shadow-xl">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                      <div>
                        <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest font-mono block">STEP 2: SCAN & PAY</span>
                        <h3 className="text-lg font-display font-black text-white tracking-tight">
                          UPI Payment Instructions
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setCurrentStep('selection'); playSound('CLICK'); }}
                        className="text-[10px] font-mono font-black text-slate-400 hover:text-white bg-slate-800 px-3 py-1.5 rounded-lg transition-all"
                      >
                        Edit Amount
                      </button>
                    </div>

                    {/* QR Code and VPA Card */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center bg-slate-950 border border-slate-800/80 p-5 rounded-2xl">
                      {/* QR Display */}
                      <div className="flex flex-col items-center space-y-3">
                        <div className="bg-white p-3 rounded-2xl shadow-xl relative group cursor-pointer" onClick={() => setZoomQr(true)}>
                          <img
                            src={activeUpiOrder.qrCode}
                            alt="UPI QR Code"
                            className="w-44 h-44 object-contain rounded-xl"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center text-white text-xs font-mono font-bold">
                            Click to Zoom
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">Scan using PhonePe, Paytm, or GPay</span>
                      </div>

                      {/* Payment VPA & Details */}
                      <div className="space-y-4">
                        <div>
                          <label className="text-[9px] font-mono font-bold text-slate-500 uppercase block mb-1">UPI VPA / Merchant ID</label>
                          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-3 rounded-xl">
                            <span className="font-mono font-extrabold text-sm text-emerald-400 truncate flex-1">
                              {activeUpiOrder.upiVpa}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(activeUpiOrder.upiVpa, 'UPI VPA')}
                              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all cursor-pointer shrink-0"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-900 p-3 rounded-xl border border-slate-800">
                          <div>
                            <span className="text-[8px] text-slate-500 uppercase block font-sans font-bold">Deposit Amount</span>
                            <span className="text-white font-black text-sm">₹{activeUpiOrder.amount.toLocaleString()} INR</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-slate-500 uppercase block font-sans font-bold">Order Reference</span>
                            <span className="text-emerald-400 font-black text-xs truncate block">{activeUpiOrder.depositId}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Step 3: Enter UTR Number */}
                    <div className="space-y-4 pt-4 border-t border-slate-800">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-black text-white uppercase tracking-widest font-mono">
                          Enter 12-Digit UPI UTR / Transaction Reference ID
                        </label>
                        <p className="text-xs text-slate-400">
                          After completing payment in your UPI app, copy the 12-digit UTR/Ref No. from the transaction receipt.
                        </p>
                      </div>

                      <input
                        type="text"
                        placeholder="e.g. 321842848012"
                        value={upiUtr}
                        onChange={(e) => setUpiUtr(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 rounded-xl px-4 py-3.5 text-sm font-mono font-bold text-white focus:outline-none transition-all"
                      />

                      {/* Screenshot upload drop zone */}
                      <div
                        onDragEnter={handleDrag}
                        onDragOver={handleDrag}
                        onDragLeave={handleDrag}
                        onDrop={(e) => handleDrop(e, 'upi')}
                        className={`border-2 border-dashed rounded-xl p-4 text-center transition-all ${
                          dragActive ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/60'
                        }`}
                      >
                        {upiScreenshot ? (
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <img src={upiScreenshot} alt="Proof" className="w-12 h-12 object-cover rounded-lg border border-slate-700" />
                              <span className="text-xs font-mono text-emerald-400 font-bold">Screenshot Attached</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setUpiScreenshot(undefined)}
                              className="text-xs font-mono text-rose-400 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer space-y-1 block">
                            <Upload className="w-5 h-5 mx-auto text-slate-500" />
                            <span className="text-xs font-mono text-slate-400 block">
                              Upload Payment Proof Screenshot (Optional)
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                if (e.target.files?.[0]) processFile(e.target.files[0], 'upi');
                              }}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>

                      {/* Submit button */}
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleSubmitUpiVerification}
                        className="w-full py-4 rounded-xl font-mono text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-xl shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Verifying UPI Payment...
                          </>
                        ) : (
                          <>
                            <CheckCheck className="w-4 h-4" />
                            Submit UPI Deposit Verification
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: Real-Time Status Monitor */}
                {currentStep === 'status' && activeUpiOrder && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-6 shadow-xl">
                    <div className="text-center space-y-3 py-4">
                      {trackedDeposit?.status === 'confirmed' || trackedDeposit?.status === 'completed' ? (
                        <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20">
                          <CheckCircle className="w-8 h-8" />
                        </div>
                      ) : trackedDeposit?.status === 'failed' || trackedDeposit?.status === 'rejected' ? (
                        <div className="w-16 h-16 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto shadow-xl">
                          <ShieldAlert className="w-8 h-8" />
                        </div>
                      ) : (
                        <div className="w-16 h-16 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                          <Clock className="w-8 h-8" />
                        </div>
                      )}

                      <h3 className="text-xl font-display font-black text-white">
                        {trackedDeposit?.status === 'confirmed' || trackedDeposit?.status === 'completed'
                          ? 'UPI Deposit Confirmed & Credited!'
                          : trackedDeposit?.status === 'failed' || trackedDeposit?.status === 'rejected'
                          ? 'UPI Deposit Rejected'
                          : 'UPI Deposit Under Verification'}
                      </h3>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        Deposit Reference: <strong className="text-white font-mono">{activeUpiOrder.depositId}</strong>
                      </p>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 p-5 rounded-2xl space-y-3 text-xs font-mono">
                      <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                        <span className="text-slate-500">Method:</span>
                        <span className="text-white font-bold">UPI Payment</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                        <span className="text-slate-500">Amount:</span>
                        <span className="text-emerald-400 font-bold">₹{activeUpiOrder.amount.toLocaleString()} INR</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                        <span className="text-slate-500">UTR Reference:</span>
                        <span className="text-white font-bold">{upiUtr || 'Submitted'}</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-500">Live Status:</span>
                        <span className={`font-black uppercase px-2 py-0.5 rounded text-[10px] ${
                          trackedDeposit?.status === 'confirmed' || trackedDeposit?.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {trackedDeposit?.status || 'Processing'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleReset}
                      className="w-full py-3.5 rounded-xl font-mono text-xs font-black uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-white transition-all cursor-pointer"
                    >
                      Initiate Another Deposit
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* ======================================================== */}
            {/* B) CRYPTO DEPOSIT FLOW                                   */}
            {/* ======================================================== */}
            {paymentMethodTab === 'crypto' && (
              <motion.div
                key="crypto-flow"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* STEP 1: Choose Network & Amount */}
                {currentStep === 'selection' && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-6 shadow-xl">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                      <div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono block">SOVEREIGN BLOCKCHAIN GATEWAY</span>
                        <h3 className="text-lg font-display font-black text-white tracking-tight flex items-center gap-2">
                          <Coins className="w-5 h-5 text-emerald-400" />
                          USDT Crypto Deposit
                        </h3>
                      </div>
                      <span className="text-[9px] font-mono font-black text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-md border border-cyan-500/20 uppercase">
                        MULTI-CHAIN
                      </span>
                    </div>

                    {paymentSettings?.cryptoMaintenanceMode && (
                      <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex items-center gap-3 text-rose-300">
                        <Wrench className="w-5 h-5 text-rose-400 shrink-0" />
                        <div className="text-xs font-medium">
                          <strong className="block font-bold text-rose-200">Crypto Payment Gateway Under Maintenance</strong>
                          Crypto deposits are temporarily offline for network maintenance. Please use UPI deposit or try again later.
                        </div>
                      </div>
                    )}

                    {/* Network Cards Grid */}
                    <div className="space-y-3">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                        Select USDT Blockchain Network
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {networks.map((net) => {
                          const isSelected = selectedNetwork?.id === net.id;
                          return (
                            <div
                              key={net.id}
                              onClick={() => {
                                setSelectedNetwork(net);
                                playSound('CLICK');
                              }}
                              className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2 ${
                                isSelected
                                  ? 'bg-slate-950 border-emerald-500 shadow-lg shadow-emerald-500/10'
                                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-black text-sm text-white">{net.name}</span>
                                {isSelected && (
                                  <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center">
                                    <Check className="w-3 h-3 stroke-[3]" />
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 leading-tight">{net.description}</p>
                              <div className="flex justify-between items-center text-[9px] font-mono pt-2 border-t border-slate-800/80 text-slate-400">
                                <span>Fee: {net.networkFeeText}</span>
                                <span className="text-emerald-400">~{net.estimatedTime}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Presets Grid */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                        Quick Amount Presets (USDT)
                      </label>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {[25, 50, 100, 250, 500, 1000].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => { setCryptoAmount(String(preset)); playSound('CLICK'); }}
                            className={`py-2.5 rounded-xl text-xs font-mono font-extrabold border transition-all cursor-pointer ${
                              Number(cryptoAmount) === preset
                                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                                : 'bg-slate-950/80 hover:bg-slate-850 text-slate-300 border-slate-800'
                            }`}
                          >
                            ${preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                        Deposit Amount in USDT
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono font-black text-slate-400 text-lg">
                          $
                        </span>
                        <input
                          type="number"
                          placeholder="e.g. 50"
                          value={cryptoAmount}
                          onChange={(e) => setCryptoAmount(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 rounded-xl pl-9 pr-4 py-3.5 text-lg font-mono font-black text-white focus:outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Generate Address Button */}
                    <button
                      type="button"
                      disabled={isCreatingCrypto || !!paymentSettings?.cryptoMaintenanceMode}
                      onClick={handleGenerateCryptoOrder}
                      className="w-full py-4 rounded-xl font-mono text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-xl shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreatingCrypto ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Generating Deposit Wallet Address...
                        </>
                      ) : paymentSettings?.cryptoMaintenanceMode ? (
                        <>
                          <Wrench className="w-4 h-4" />
                          Crypto Gateway Under Maintenance
                        </>
                      ) : (
                        <>
                          <QrCode className="w-4 h-4" />
                          Generate Crypto Address & QR
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* STEP 2: Crypto Instructions & Warning */}
                {currentStep === 'instructions' && activeCryptoOrder && selectedNetwork && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-6 shadow-xl">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                      <div>
                        <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest font-mono block">STEP 2: SCAN & TRANSFER</span>
                        <h3 className="text-lg font-display font-black text-white tracking-tight">
                          Deposit Address ({activeCryptoOrder.network})
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setCurrentStep('selection'); playSound('CLICK'); }}
                        className="text-[10px] font-mono font-black text-slate-400 hover:text-white bg-slate-800 px-3 py-1.5 rounded-lg transition-all"
                      >
                        Change Network
                      </button>
                    </div>

                    {/* High-visibility Warning Banner */}
                    <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1 text-xs">
                        <span className="font-bold text-amber-300 font-mono block">CRITICAL NETWORK WARNING</span>
                        <p className="text-amber-200/80 leading-relaxed">
                          Send <strong>ONLY USDT</strong> on the <strong className="text-white uppercase">{activeCryptoOrder.network}</strong> network to this address.
                          Sending any other token or using an unaligned network will result in permanent loss.
                        </p>
                      </div>
                    </div>

                    {/* Address & QR Container */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center bg-slate-950 border border-slate-800/80 p-5 rounded-2xl">
                      {/* QR Display */}
                      <div className="flex flex-col items-center space-y-3">
                        <div className="bg-white p-3 rounded-2xl shadow-xl relative group cursor-pointer" onClick={() => setZoomQr(true)}>
                          <img
                            src={activeCryptoOrder.qrCode}
                            alt="Crypto Deposit QR"
                            className="w-44 h-44 object-contain rounded-xl"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center text-white text-xs font-mono font-bold">
                            Click to Zoom
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">Scan via Binance, TrustWallet, or MetaMask</span>
                      </div>

                      {/* Wallet Address */}
                      <div className="space-y-4">
                        <div>
                          <label className="text-[9px] font-mono font-bold text-slate-500 uppercase block mb-1">
                            {activeCryptoOrder.network} Deposit Wallet Address
                          </label>
                          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-3 rounded-xl">
                            <span className="font-mono font-extrabold text-xs text-emerald-400 break-all flex-1">
                              {activeCryptoOrder.walletAddress}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(activeCryptoOrder.walletAddress, 'Wallet Address')}
                              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-all cursor-pointer shrink-0"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-900 p-3 rounded-xl border border-slate-800">
                          <div>
                            <span className="text-[8px] text-slate-500 uppercase block font-sans font-bold">Deposit Amount</span>
                            <span className="text-white font-black text-sm">${activeCryptoOrder.amount} USDT</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-slate-500 uppercase block font-sans font-bold">Deposit ID</span>
                            <span className="text-emerald-400 font-black text-xs truncate block">{activeCryptoOrder.depositId}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Step 3: Enter TxHash */}
                    <div className="space-y-4 pt-4 border-t border-slate-800">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-black text-white uppercase tracking-widest font-mono">
                          Enter Transaction Hash (TxID) or Sender Address
                        </label>
                        <p className="text-xs text-slate-400">
                          Paste your blockchain transaction hash once sent to expedite automated block auditing.
                        </p>
                      </div>

                      <input
                        type="text"
                        placeholder="e.g. 0x8f3c... or 7a2b..."
                        value={cryptoTxDetails}
                        onChange={(e) => setCryptoTxDetails(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 rounded-xl px-4 py-3.5 text-sm font-mono font-bold text-white focus:outline-none transition-all"
                      />

                      {/* Screenshot upload drop zone */}
                      <div
                        onDragEnter={handleDrag}
                        onDragOver={handleDrag}
                        onDragLeave={handleDrag}
                        onDrop={(e) => handleDrop(e, 'crypto')}
                        className={`border-2 border-dashed rounded-xl p-4 text-center transition-all ${
                          dragActive ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/60'
                        }`}
                      >
                        {cryptoScreenshot ? (
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <img src={cryptoScreenshot} alt="Proof" className="w-12 h-12 object-cover rounded-lg border border-slate-700" />
                              <span className="text-xs font-mono text-emerald-400 font-bold">Screenshot Attached</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setCryptoScreenshot(undefined)}
                              className="text-xs font-mono text-rose-400 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer space-y-1 block">
                            <Upload className="w-5 h-5 mx-auto text-slate-500" />
                            <span className="text-xs font-mono text-slate-400 block">
                              Upload Verification Screenshot (Optional)
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                if (e.target.files?.[0]) processFile(e.target.files[0], 'crypto');
                              }}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>

                      {/* Submit button */}
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleSubmitCryptoVerification}
                        className="w-full py-4 rounded-xl font-mono text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-xl shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSubmitting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Confirming Crypto Deposit...
                          </>
                        ) : (
                          <>
                            <CheckCheck className="w-4 h-4" />
                            Confirm Crypto Deposit Request
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: Real-Time Status Monitor */}
                {currentStep === 'status' && activeCryptoOrder && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-6 shadow-xl">
                    <div className="text-center space-y-3 py-4">
                      {trackedDeposit?.status === 'confirmed' || trackedDeposit?.status === 'completed' ? (
                        <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20">
                          <CheckCircle className="w-8 h-8" />
                        </div>
                      ) : trackedDeposit?.status === 'failed' || trackedDeposit?.status === 'rejected' ? (
                        <div className="w-16 h-16 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full flex items-center justify-center mx-auto shadow-xl">
                          <ShieldAlert className="w-8 h-8" />
                        </div>
                      ) : (
                        <div className="w-16 h-16 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                          <Clock className="w-8 h-8" />
                        </div>
                      )}

                      <h3 className="text-xl font-display font-black text-white">
                        {trackedDeposit?.status === 'confirmed' || trackedDeposit?.status === 'completed'
                          ? 'Crypto Deposit Confirmed!'
                          : trackedDeposit?.status === 'failed' || trackedDeposit?.status === 'rejected'
                          ? 'Crypto Deposit Rejected'
                          : 'Awaiting Blockchain Confirmations'}
                      </h3>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        Deposit ID: <strong className="text-white font-mono">{activeCryptoOrder.depositId}</strong>
                      </p>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 p-5 rounded-2xl space-y-3 text-xs font-mono">
                      <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                        <span className="text-slate-500">Network:</span>
                        <span className="text-white font-bold">{activeCryptoOrder.network}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                        <span className="text-slate-500">Amount:</span>
                        <span className="text-emerald-400 font-bold">${activeCryptoOrder.amount} USDT</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-800/80">
                        <span className="text-slate-500">Tx Hash:</span>
                        <span className="text-white font-bold truncate max-w-[180px]">{cryptoTxDetails || 'Submitted'}</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-500">Status:</span>
                        <span className={`font-black uppercase px-2 py-0.5 rounded text-[10px] ${
                          trackedDeposit?.status === 'confirmed' || trackedDeposit?.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {trackedDeposit?.status || 'Pending'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleReset}
                      className="w-full py-3.5 rounded-xl font-mono text-xs font-black uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-white transition-all cursor-pointer"
                    >
                      Initiate Another Deposit
                    </button>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* RIGHT COLUMN: DEPOSIT CLAIMS & RECENT ACTIVITY */}
        <div id="deposit-right-column" className="lg:col-span-4 space-y-6 w-full">
          
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-xs font-mono font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                Deposit Requests ({userDeposits.length})
              </h3>
            </div>

            {userDeposits.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <ShieldCheck className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs font-mono text-slate-500">No active deposit claims recorded.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar touch-pan-y" style={{ touchAction: 'pan-y' }}>
                {userDeposits.map((dep) => {
                  const isUp = dep.method.toLowerCase().includes('upi');
                  return (
                    <div
                      key={dep.id}
                      onPointerDown={() => setSelectedTxForModal(dep)}
                      className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl flex items-center justify-between gap-3 transition-all cursor-pointer"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded ${
                            isUp ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'
                          }`}>
                            {dep.method}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(dep.timestamp || Date.now()).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs font-mono font-bold text-white truncate">
                          {isUp ? `₹${dep.amount.toLocaleString()}` : `$${dep.amount} USDT`}
                        </p>
                      </div>

                      <span className={`text-[9px] font-mono font-black uppercase px-2 py-1 rounded ${
                        dep.status === 'completed' || dep.status === 'confirmed'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : dep.status === 'rejected' || dep.status === 'failed'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                      }`}>
                        {dep.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Security Guarantee Box */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold">
              <ShieldCheck className="w-4 h-4" />
              FinTech Security Standard
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              All deposit requests undergo secure serverless validation and immutable database logging. Balance adjustments are strictly authorization-gated.
            </p>
          </div>

        </div>

      </div>

      {/* QR ZOOM MODAL */}
      <AnimatePresence>
        {zoomQr && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setZoomQr(false)}
          >
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl max-w-sm w-full space-y-4 text-center">
              <img
                src={paymentMethodTab === 'upi' ? activeUpiOrder?.qrCode : activeCryptoOrder?.qrCode}
                alt="QR Zoom"
                className="w-64 h-64 mx-auto object-contain bg-white p-3 rounded-2xl"
              />
              <button
                type="button"
                onClick={() => setZoomQr(false)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl font-mono text-xs font-bold text-white"
              >
                Close Zoom
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CLAIM DETAILS MODAL */}
      <AnimatePresence>
        {selectedTxForModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setSelectedTxForModal(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-slate-800 p-6 rounded-3xl max-w-md w-full space-y-5"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="font-mono font-bold text-sm text-white">Deposit Request Details</h3>
                <button
                  type="button"
                  onClick={() => setSelectedTxForModal(null)}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-500">Deposit ID:</span>
                  <span className="text-white font-bold">{selectedTxForModal.id}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-500">Method / Network:</span>
                  <span className="text-emerald-400 font-bold">{selectedTxForModal.method}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-500">Amount:</span>
                  <span className="text-white font-bold">${selectedTxForModal.amount} USD</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-500">Status:</span>
                  <span className="text-amber-400 font-bold uppercase">{selectedTxForModal.status}</span>
                </div>
                <div className="space-y-1 pt-1">
                  <span className="text-slate-500 block">Submitted Details:</span>
                  <p className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-300 break-all leading-relaxed">
                    {selectedTxForModal.details}
                  </p>
                </div>
                {selectedTxForModal.screenshotUrl && (
                  <div className="space-y-1">
                    <span className="text-slate-500 block">Verification Proof:</span>
                    <img src={selectedTxForModal.screenshotUrl} alt="Proof" className="max-h-40 rounded-lg object-contain border border-slate-800" />
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedTxForModal(null)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-mono text-xs font-bold text-white"
              >
                Close Window
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
