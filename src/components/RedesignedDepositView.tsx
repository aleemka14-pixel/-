import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Copy, Check, AlertTriangle, Clock, Sparkles, 
  Upload, Image as ImageIcon, ChevronDown, CheckCircle2, 
  Shield, HelpCircle, AlertCircle, RefreshCw,
  Coins, Zap, Hexagon, Layers, Award, ShieldCheck,
  Wallet, TrendingUp, ArrowUpRight, ExternalLink, Eye, Info,
  Search, ShieldAlert, CheckSquare, X, DollarSign, CheckCircle,
  Network, ArrowRight, Server, Flame, Activity
} from 'lucide-react';
import { DepositNetwork, FAQItem, DepositRequest, Player } from '../types.ts';
import { DEFAULT_NETWORKS } from '../data/defaultNetworks.ts';

interface RedesignedDepositViewProps {
  depositNetworks: DepositNetwork[];
  currentPlayer?: Player;
  deposits?: DepositRequest[];
  onBack: () => void;
  onDeposit: (amount: number, method: string, details: string, screenshotUrl?: string, existingDepositId?: string, transactionHash?: string) => void;
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
  onBack,
  onDeposit,
  preferredCurrency,
  rates,
  playSound
}: RedesignedDepositViewProps) {
  
  // Use Firebase networks if available, otherwise default fallback
  const networks = useMemo(() => {
    return depositNetworks.length > 0 
      ? depositNetworks.filter(n => n.enabled) 
      : DEFAULT_NETWORKS.filter(n => n.enabled);
  }, [depositNetworks]);

  // States
  const [selectedNetwork, setSelectedNetwork] = useState<DepositNetwork | null>(null);
  const [currentStep, setCurrentStep] = useState<'network' | 'details' | 'review' | 'status'>('network');
  const [amount, setAmount] = useState<string>('');
  const [txDetails, setTxDetails] = useState<string>('');
  const [screenshot, setScreenshot] = useState<string | undefined>(undefined);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [networkSearch, setNetworkSearch] = useState<string>('');
  
  // Dynamic Payment States
  interface ActivePayment {
    paymentId: string;
    walletAddress: string;
    amount: number;
    qrCode: string;
    paymentStatus: string;
    createdAt: string;
    isMock?: boolean;
  }
  const [activePayment, setActivePayment] = useState<ActivePayment | null>(null);
  const [isCreatingPayment, setIsCreatingPayment] = useState<boolean>(false);

  // Helper mappings for the new crypto deposit backend
  const mapNetworkIdToName = (id: string): string | null => {
    if (id === 'tron') return 'TRC20';
    if (id === 'bsc') return 'BEP20';
    if (id === 'ethereum') return 'ERC20';
    return null;
  };

  const isCryptoDepositAPI = useMemo(() => {
    return selectedNetwork ? ['tron', 'bsc', 'ethereum'].includes(selectedNetwork.id) : false;
  }, [selectedNetwork]);

  // Track deposit real-time status from the Firestore deposits array
  const trackedDeposit = useMemo(() => {
    if (!activePayment?.paymentId) return null;
    return deposits.find(d => d.id === activePayment.paymentId || d.depositId === activePayment.paymentId);
  }, [deposits, activePayment]);

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

  // Call backend API /api/create-deposit for crypto networks or /api/create-payment for others
  const handleCreatePayment = async () => {
    if (!selectedNetwork) {
      showToast("Please choose a blockchain network", "error");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      showToast("Please specify a valid deposit amount", "error");
      return;
    }
    const minRequired = convertUsdToCurrency(selectedNetwork.minDepositUsd);
    const maxRequired = convertUsdToCurrency(selectedNetwork.maxDepositUsd);
    
    if (Number(amount) < minRequired) {
      showToast(`The minimum deposit is ${formatCurrency(selectedNetwork.minDepositUsd)}`, "error");
      return;
    }
    if (Number(amount) > maxRequired) {
      showToast(`The maximum deposit is ${formatCurrency(selectedNetwork.maxDepositUsd)}`, "error");
      return;
    }

    const targetNetwork = mapNetworkIdToName(selectedNetwork.id);
    if (targetNetwork) {
      setIsCreatingPayment(true);
      playSound('CLICK');
      try {
        const response = await fetch('/api/create-deposit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: currentPlayer?.id || 'guest',
            amount: Number(amount),
            network: targetNetwork
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data && data.depositId) {
            const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.qrData)}`;
            setActivePayment({
              paymentId: data.depositId,
              walletAddress: data.walletAddress,
              amount: data.amount,
              qrCode: qrCodeUrl,
              paymentStatus: data.status || 'pending',
              createdAt: new Date().toISOString(),
              isMock: false
            });
            setCurrentStep('review');
            showToast(`Dynamic ${targetNetwork} deposit address generated!`, "success");
          } else {
            throw new Error("Invalid response format from crypto deposit API");
          }
        } else {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }
      } catch (err: any) {
        console.error("API create-deposit failed:", err);
        showToast(err.message || "Failed to create crypto deposit request. Please try again.", "error");
      } finally {
        setIsCreatingPayment(false);
      }
      return;
    }

    setIsCreatingPayment(true);
    playSound('CLICK');

    try {
      const response = await fetch('/api/create-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: convertCurrencyToUsd(Number(amount)),
          currency: preferredCurrency,
          networkId: selectedNetwork.id,
          playerId: currentPlayer?.id || 'guest'
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setActivePayment({
            paymentId: data.paymentId,
            walletAddress: data.walletAddress,
            amount: data.amount,
            qrCode: data.qrCode,
            paymentStatus: data.paymentStatus,
            createdAt: data.createdAt,
            isMock: data.isMock
          });
          setCurrentStep('review');
          showToast("Dynamic deposit address generated!", "success");
        } else {
          throw new Error(data.error || "Failed to generate dynamic payment");
        }
      } else {
        throw new Error("HTTP error " + response.status);
      }
    } catch (err) {
      console.warn("Backend API not reachable or failed, using secure client-side generator:", err);
      
      const randomHex = Array.from({length: 6}, () => Math.floor(Math.random()*16).toString(16)).join('');
      const paymentId = `PAY-${randomHex.toUpperCase()}`;
      
      let dynamicAddress = selectedNetwork.depositAddress;
      if (selectedNetwork.depositAddress.startsWith('0x')) {
        const hex = Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join('');
        dynamicAddress = `0x${hex}`;
      } else if (selectedNetwork.depositAddress.startsWith('bc1q')) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        const randPart = Array.from({length: 34}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
        dynamicAddress = `bc1q${randPart}`;
      } else {
        const len = selectedNetwork.depositAddress.length;
        const prefix = selectedNetwork.depositAddress.substring(0, 4);
        const suffix = selectedNetwork.depositAddress.substring(len - 4);
        const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        const middle = Array.from({length: len - 8}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
        dynamicAddress = `${prefix}${middle}${suffix}`;
      }

      let coinName = 'usdt';
      switch (selectedNetwork.id) {
        case 'bitcoin': coinName = 'bitcoin'; break;
        case 'ethereum': coinName = 'ethereum'; break;
        case 'litecoin': coinName = 'litecoin'; break;
        case 'solana': coinName = 'solana'; break;
        case 'tron': coinName = 'tron'; break;
      }
      const qrData = `${coinName}:${dynamicAddress}?amount=${amount}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}`;

      setActivePayment({
        paymentId,
        walletAddress: dynamicAddress,
        amount: Number(amount),
        qrCode: qrCodeUrl,
        paymentStatus: 'waiting',
        createdAt: new Date().toISOString(),
        isMock: true
      });
      setCurrentStep('review');
      showToast("Dynamic deposit address generated (Fallback mode)!", "success");
    } finally {
      setIsCreatingPayment(false);
    }
  };
  
  // Interactive UI features
  const [zoomQr, setZoomQr] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
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

  // Toast notification system
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Supported Coins based on network ID
  const getSupportedCoins = (net: DepositNetwork) => {
    if (net.supportedCoins) return net.supportedCoins;
    switch (net.id) {
      case 'bitcoin': return 'BTC';
      case 'solana': return 'SOL, USDT, USDC';
      case 'polygon': return 'POL (MATIC), USDT, USDC';
      case 'tron': return 'USDT (TRC20), TRX';
      case 'ethereum': return 'ETH, USDT (ERC20), USDC';
      case 'bsc': return 'BNB, USDT (BEP20), BUSD';
      case 'litecoin': return 'LTC';
      default: return 'USDT, USDC';
    }
  };

  // Icon mapping for networks
  const getNetworkIcon = (id: string) => {
    switch (id) {
      case 'bitcoin': return <Coins className="w-5 h-5 text-amber-500" />;
      case 'solana': return <Zap className="w-5 h-5 text-purple-400" />;
      case 'polygon': return <Hexagon className="w-5 h-5 text-indigo-400" />;
      case 'tron': return <Layers className="w-5 h-5 text-red-500" />;
      case 'ethereum': return <Award className="w-5 h-5 text-cyan-400" />;
      case 'bsc': return <Coins className="w-5 h-5 text-yellow-500" />;
      default: return <Coins className="w-5 h-5 text-emerald-400" />;
    }
  };

  // Clipboard copy handler with sound & notification
  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    playSound('CLICK');
    showToast("Wallet Address copied to clipboard!", "success");
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Drag and drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // Handle uploaded screenshot with resizing
  const processFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      showToast("File is too large. Max size allowed is 5MB.", "error");
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
        setScreenshot(dataUrl);
        showToast("Proof screenshot loaded successfully!", "info");
        playSound('CLICK');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Submit verified deposit
  const handleSubmitDeposit = () => {
    if (!selectedNetwork) {
      showToast("Please choose a blockchain network", "error");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      showToast("Please specify a valid deposit amount", "error");
      return;
    }
    const minRequired = convertUsdToCurrency(selectedNetwork.minDepositUsd);
    const maxRequired = convertUsdToCurrency(selectedNetwork.maxDepositUsd);
    
    if (Number(amount) < minRequired) {
      showToast(`The minimum deposit is ${formatCurrency(selectedNetwork.minDepositUsd)}`, "error");
      return;
    }
    if (Number(amount) > maxRequired) {
      showToast(`The maximum deposit is ${formatCurrency(selectedNetwork.maxDepositUsd)}`, "error");
      return;
    }
    if (!txDetails.trim()) {
      showToast("Please enter the Tx Hash or Sender Address", "error");
      return;
    }
    if (!screenshot) {
      showToast("Verification screenshot is required to complete the deposit", "error");
      return;
    }

    setIsSubmitting(true);
    playSound('CLICK');
    
    const amountInUsd = convertCurrencyToUsd(Number(amount));
    const fullDetails = `Network: ${selectedNetwork.name} | Payment ID: ${activePayment?.paymentId || 'N/A'} | Target Address: ${activePayment?.walletAddress || selectedNetwork.depositAddress} | TXID/Address: ${txDetails.trim()}`;

    setTimeout(() => {
      onDeposit(amountInUsd, selectedNetwork.name, fullDetails, screenshot, activePayment?.paymentId, txDetails.trim());
      setIsSubmitting(false);
      setIsSuccess(true);
      setCurrentStep('status');
      playSound('WIN');
      showToast("Deposit request successfully logged!", "success");
    }, 1500);
  };

  const handleReset = () => {
    setAmount('');
    setTxDetails('');
    setScreenshot(undefined);
    setIsSuccess(false);
    setSelectedNetwork(null);
    setActivePayment(null);
    setCurrentStep('network');
  };

  // Filter networks
  const filteredNetworks = useMemo(() => {
    return networks.filter(n => 
      n.name.toLowerCase().includes(networkSearch.toLowerCase()) || 
      n.description.toLowerCase().includes(networkSearch.toLowerCase())
    );
  }, [networks, networkSearch]);

  // Presets
  const presetsByCurrency: Record<string, number[]> = {
    USD: [10, 50, 100, 250, 500, 1000],
    EUR: [10, 50, 100, 250, 500, 1000],
    GBP: [10, 50, 100, 250, 500, 1000],
    INR: [500, 1000, 5000, 10000, 25000, 50000],
    AED: [50, 100, 500, 1000, 2500, 5000],
    PKR: [1000, 2500, 5000, 10000, 25000, 50000],
    CAD: [10, 50, 100, 250, 500, 1000],
    CNY: [100, 500, 1000, 2500, 5000, 10000],
    JPY: [1000, 5000, 10000, 25000, 50000, 100000]
  };
  const currentPresets = presetsByCurrency[preferredCurrency] || presetsByCurrency.USD;

  // Real-time calculations for status cards
  const userDeposits = useMemo(() => {
    return deposits.filter(d => d.playerId === currentPlayer?.id);
  }, [deposits, currentPlayer]);

  // Calculations
  const availableBalanceFormatted = useMemo(() => {
    const balUsd = currentPlayer?.balance || 0;
    return formatCurrency(balUsd);
  }, [currentPlayer, preferredCurrency, rates]);

  const pendingDepositsFormatted = useMemo(() => {
    const pendingSumUsd = userDeposits
      .filter(d => d.status === 'pending')
      .reduce((sum, d) => sum + d.amount, 0);
    return formatCurrency(pendingSumUsd);
  }, [userDeposits, preferredCurrency, rates]);

  const todayDepositsFormatted = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todaySumUsd = userDeposits
      .filter(d => d.status === 'completed' && d.timestamp >= startOfToday.getTime())
      .reduce((sum, d) => sum + d.amount, 0);
    return formatCurrency(todaySumUsd);
  }, [userDeposits, preferredCurrency, rates]);

  const totalDepositsFormatted = useMemo(() => {
    const totalSumUsd = userDeposits
      .filter(d => d.status === 'completed')
      .reduce((sum, d) => sum + d.amount, 0);
    return formatCurrency(totalSumUsd);
  }, [userDeposits, preferredCurrency, rates]);

  const latestDeposit = useMemo(() => {
    if (userDeposits.length === 0) return null;
    return [...userDeposits].sort((a, b) => b.timestamp - a.timestamp)[0];
  }, [userDeposits]);

  // Network customized visuals mapping (Stake Inspired Premium Themes)
  const getNetworkVisuals = (id: string) => {
    switch (id) {
      case 'tron':
        return {
          symbol: 'TRX',
          typeBadge: 'TRC20 Network',
          glowBg: 'rgba(239, 68, 68, 0.15)',
          glowText: 'text-red-400',
          gradientBorder: 'from-red-500 to-rose-600',
          logoColor: 'text-red-500 bg-red-500/10 border-red-500/20',
          themeGlow: 'shadow-[0_0_25px_rgba(239,68,68,0.2)] border-red-500/40',
          accent: 'red',
          icon: <Layers className="w-8 h-8 text-red-500" />
        };
      case 'bsc':
        return {
          symbol: 'BNB',
          typeBadge: 'BEP20 Network',
          glowBg: 'rgba(245, 158, 11, 0.15)',
          glowText: 'text-yellow-400',
          gradientBorder: 'from-yellow-400 to-amber-500',
          logoColor: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
          themeGlow: 'shadow-[0_0_25px_rgba(245,158,11,0.2)] border-yellow-500/40',
          accent: 'yellow',
          icon: <Coins className="w-8 h-8 text-yellow-500" />
        };
      case 'ethereum':
        return {
          symbol: 'ETH',
          typeBadge: 'ERC20 Network',
          glowBg: 'rgba(6, 182, 212, 0.15)',
          glowText: 'text-cyan-400',
          gradientBorder: 'from-cyan-400 to-blue-500',
          logoColor: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
          themeGlow: 'shadow-[0_0_25px_rgba(6,182,212,0.2)] border-cyan-500/40',
          accent: 'cyan',
          icon: <Award className="w-8 h-8 text-cyan-400" />
        };
      case 'bitcoin':
        return {
          symbol: 'BTC',
          typeBadge: 'Native SegWit',
          glowBg: 'rgba(249, 115, 22, 0.15)',
          glowText: 'text-orange-400',
          gradientBorder: 'from-orange-500 to-amber-600',
          logoColor: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
          themeGlow: 'shadow-[0_0_25px_rgba(249,115,22,0.2)] border-orange-500/40',
          accent: 'orange',
          icon: <Coins className="w-8 h-8 text-orange-500" />
        };
      case 'solana':
        return {
          symbol: 'SOL',
          typeBadge: 'SPL Protocol',
          glowBg: 'rgba(168, 85, 247, 0.15)',
          glowText: 'text-purple-400',
          gradientBorder: 'from-purple-400 to-fuchsia-600',
          logoColor: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
          themeGlow: 'shadow-[0_0_25px_rgba(168,85,247,0.2)] border-purple-500/40',
          accent: 'purple',
          icon: <Zap className="w-8 h-8 text-purple-400" />
        };
      case 'polygon':
        return {
          symbol: 'POL',
          typeBadge: 'POL Mainnet',
          glowBg: 'rgba(99, 102, 241, 0.15)',
          glowText: 'text-indigo-400',
          gradientBorder: 'from-indigo-500 to-purple-600',
          logoColor: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
          themeGlow: 'shadow-[0_0_25px_rgba(99,102,241,0.2)] border-indigo-500/40',
          accent: 'indigo',
          icon: <Hexagon className="w-8 h-8 text-indigo-400" />
        };
      case 'litecoin':
        return {
          symbol: 'LTC',
          typeBadge: 'LTC Core Network',
          glowBg: 'rgba(59, 130, 246, 0.15)',
          glowText: 'text-blue-400',
          gradientBorder: 'from-blue-400 to-cyan-500',
          logoColor: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
          themeGlow: 'shadow-[0_0_25px_rgba(59,130,246,0.2)] border-blue-500/40',
          accent: 'blue',
          icon: <Coins className="w-8 h-8 text-blue-400" />
        };
      default:
        return {
          symbol: 'TOKEN',
          typeBadge: 'Blockchain Token',
          glowBg: 'rgba(16, 185, 129, 0.15)',
          glowText: 'text-emerald-400',
          gradientBorder: 'from-emerald-400 to-teal-500',
          logoColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
          themeGlow: 'shadow-[0_0_25px_rgba(16,185,129,0.2)] border-emerald-400/40',
          accent: 'emerald',
          icon: <Coins className="w-8 h-8 text-emerald-400" />
        };
    }
  };

  return (
    <div id="redesigned-deposit-container" className="min-h-screen text-slate-200 pb-24 space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 select-none">
      
      {/* Toast notifications container */}
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
                Redeposit Capital
              </h1>
              <p className="text-xs text-slate-400">
                Premium multi-chain sovereign transaction logging. Fast, cryptographically audited.
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic total balance widget */}
        <div className="bg-slate-900 border border-slate-800 px-5 py-3 rounded-2xl flex items-center gap-4 shadow-md self-start sm:self-auto">
          <div className="space-y-0.5">
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest font-mono block">Available Wallet Balance</span>
            <span className="text-base font-mono font-black text-emerald-400 tracking-tight">
              {availableBalanceFormatted}
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
            <Wallet className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* CORE TWO-COLUMN CONTENT GRID */}
      <div id="deposit-grid-layout" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
        
        {/* LEFT COLUMN: Steps 1-4 (Main Progressive Wizard Flow) */}
        <div id="deposit-left-column" className="lg:col-span-8 space-y-8 w-full">
          
          {/* STEP INDICATOR BAR */}
          <div className="max-w-xl mx-auto mb-8 select-none">
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
                { label: 'Deposit Info', value: 'details' },
                { label: 'Scan & Pay', value: 'review' },
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
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-emerald-400" />
                        Select Blockchain Network
                      </h3>
                      <p className="text-xs text-slate-400">Choose the precise network matching your transaction asset.</p>
                    </div>

                    {/* Dynamic search bar */}
                    <div className="relative max-w-xs w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filter networks..."
                        value={networkSearch}
                        onChange={(e) => setNetworkSearch(e.target.value)}
                        className="w-full bg-slate-950/80 border border-slate-800 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none transition-all text-white font-medium"
                      />
                    </div>
                  </div>

                  {/* Grid of Network Cards */}
                  {filteredNetworks.length === 0 ? (
                    <div className="py-12 text-center rounded-xl border border-dashed border-slate-800 bg-slate-950/30 space-y-3">
                      <Coins className="w-8 h-8 mx-auto text-slate-600 animate-pulse" />
                      <p className="text-xs text-slate-400 font-mono">No matched active networks.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredNetworks.map((net) => {
                        const isSelected = selectedNetwork?.id === net.id;
                        const isMaintenance = net.statusBadge === 'Maintenance';
                        const vis = getNetworkVisuals(net.id);
                        
                        return (
                          <motion.div
                            id={`network-card-${net.id}`}
                            key={net.id}
                            onClick={() => {
                              if (isMaintenance) {
                                showToast(`${net.name} node upgrades are currently active. Under maintenance.`, 'error');
                                return;
                              }
                              setSelectedNetwork(net);
                              setCurrentStep('details');
                              playSound('CLICK');
                            }}
                            whileHover={{ y: isMaintenance ? 0 : -3 }}
                            transition={{ type: "spring", stiffness: 350, damping: 25 }}
                            className={`relative rounded-xl p-5 border cursor-pointer transition-all flex flex-col justify-between min-h-[160px] select-none ${
                              isMaintenance 
                                ? 'opacity-40 cursor-not-allowed bg-slate-950/20 border-slate-800/40' 
                                : isSelected 
                                  ? `bg-slate-950/95 border-emerald-500/50 ${vis.themeGlow}` 
                                  : 'bg-slate-950/75 hover:bg-slate-900/60 border-slate-800/60 hover:border-slate-700/60'
                            }`}
                          >
                            {/* Inner glow effect when selected */}
                            {isSelected && (
                              <div 
                                className="absolute -top-10 -right-10 w-24 h-24 rounded-full blur-xl pointer-events-none transition-all"
                                style={{ backgroundColor: vis.glowBg }}
                              />
                            )}

                            <div className="space-y-3 relative z-10">
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex items-center gap-3">
                                  {/* Logo Wrapper */}
                                  <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 border overflow-hidden relative ${vis.logoColor}`}>
                                    {net.logoUrl ? (
                                      <img 
                                        src={net.logoUrl} 
                                        alt={net.name} 
                                        referrerPolicy="no-referrer"
                                        className="w-7 h-7 object-contain rounded relative z-10" 
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.display = 'none';
                                        }} 
                                      />
                                    ) : null}
                                    <div className="absolute inset-0 flex items-center justify-center opacity-85">
                                      {vis.icon}
                                    </div>
                                  </div>
                                  
                                  <div className="min-w-0">
                                    <h4 className="font-bold text-white text-sm truncate tracking-tight">{net.name}</h4>
                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5 font-bold uppercase">{vis.typeBadge}</p>
                                  </div>
                                </div>

                                <div className="shrink-0 flex items-center">
                                  {isSelected ? (
                                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                                    </span>
                                  ) : (
                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider font-mono border ${
                                      isMaintenance 
                                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    }`}>
                                      {isMaintenance ? 'Offline' : 'Online'}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                                {net.description}
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 border-t border-slate-800/80 pt-3 mt-3 text-[11px] font-mono">
                              <div>
                                <p className="text-[8px] text-slate-500 uppercase tracking-widest font-bold font-sans">Network Fee</p>
                                <span className="text-emerald-400 font-extrabold truncate block max-w-full">
                                  {net.networkFeeText}
                                </span>
                              </div>
                              <div className="text-right">
                                <p className="text-[8px] text-slate-500 uppercase tracking-widest font-bold font-sans">Confirm Time</p>
                                <span className="text-white font-extrabold block">
                                  ~{net.estimatedTime}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: FORM INFO */}
              {currentStep === 'details' && selectedNetwork && (
                <div className="space-y-6">
                  {/* Selected Network pipeline display */}
                  <div className="flex items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-md font-mono font-black border border-emerald-500/20">
                        PIPELINE
                      </span>
                      <span className="text-xs text-slate-300">
                        Configuring deposit for: <strong className="text-white font-bold">{selectedNetwork.name}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setCurrentStep('network'); playSound('CLICK'); }}
                      className="text-[10px] font-mono font-black text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700/60 px-2.5 py-1.5 rounded-lg border border-slate-700/60 transition-all cursor-pointer"
                    >
                      Change Network
                    </button>
                  </div>

                  {/* Main Form Fields Layout (split screen) */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full items-stretch">
                    
                    {/* Left Column - Form Fields (7 cols) */}
                    <div className="md:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-6 shadow-xl flex flex-col justify-between">
                      <div className="space-y-5">
                        <div className="flex justify-between items-start gap-4 pb-4 border-b border-slate-800/80">
                          <div className="space-y-1">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest font-mono block">CONFIGURE DEPOSIT DETAILS</span>
                            <h3 className="text-lg font-display font-black text-white tracking-tight">Initiate Transfer</h3>
                          </div>
                          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                            <ShieldCheck className="w-5 h-5" />
                          </div>
                        </div>

                        {/* Specifications matrix bar */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl text-xs font-mono">
                          <div>
                            <p className="text-[8px] text-slate-500 uppercase tracking-widest block mb-0.5 font-sans font-bold">Min. Limit</p>
                            <span className="font-bold text-slate-100">{formatCurrency(selectedNetwork.minDepositUsd)}</span>
                          </div>
                          <div>
                            <p className="text-[8px] text-slate-500 uppercase tracking-widest block mb-0.5 font-sans font-bold">Max. Limit</p>
                            <span className="font-bold text-slate-100">{formatCurrency(selectedNetwork.maxDepositUsd)}</span>
                          </div>
                          <div>
                            <p className="text-[8px] text-slate-500 uppercase tracking-widest block mb-0.5 font-sans font-bold">Network Speed</p>
                            <span className="font-bold text-emerald-400">{selectedNetwork.estimatedTime}</span>
                          </div>
                          <div>
                            <p className="text-[8px] text-slate-500 uppercase tracking-widest block mb-0.5 font-sans font-bold">Confirmations</p>
                            <span className="font-bold text-slate-100">{selectedNetwork.confirmations} Block{selectedNetwork.confirmations > 1 ? 's' : ''}</span>
                          </div>
                        </div>

                        <div className="space-y-5">
                          {/* Presets + Amount input */}
                          <div className="space-y-3">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                              Enter Deposit Amount {isCryptoDepositAPI ? '(USDT)' : `(${preferredCurrency})`}
                            </label>
                            
                            {/* Presets Grid */}
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                              {currentPresets.map((preset) => {
                                const minAllowed = convertUsdToCurrency(selectedNetwork.minDepositUsd);
                                const maxAllowed = convertUsdToCurrency(selectedNetwork.maxDepositUsd);
                                const isDisabled = preset < minAllowed || preset > maxAllowed;
                                
                                return (
                                  <button
                                    key={preset}
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => { setAmount(String(preset)); playSound('CLICK'); }}
                                    className={`py-2 rounded-lg text-[10px] font-mono font-bold border transition-all ${
                                      isDisabled 
                                        ? 'opacity-20 cursor-not-allowed border-transparent bg-transparent text-slate-600 font-bold' 
                                        : amount === String(preset)
                                          ? 'bg-emerald-500 border-emerald-500 text-slate-950 shadow-md shadow-emerald-500/10 font-bold' 
                                          : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-200 cursor-pointer font-bold'
                                    }`}
                                  >
                                    {isCryptoDepositAPI ? '' : getCurrencySymbol(preferredCurrency)}{preset.toLocaleString()}{isCryptoDepositAPI ? ' USDT' : ''}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Custom Numeric Input */}
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold font-mono text-sm">
                                {isCryptoDepositAPI ? 'USDT' : getCurrencySymbol(preferredCurrency)}
                              </span>
                              <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full bg-slate-950/80 border border-slate-800 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-lg pl-14 pr-4 py-3 text-xs focus:outline-none transition-all text-white font-mono font-bold"
                                placeholder={isCryptoDepositAPI ? "Or specify custom USDT amount" : "Or specify custom amount"}
                                min={convertUsdToCurrency(selectedNetwork.minDepositUsd)}
                                max={convertUsdToCurrency(selectedNetwork.maxDepositUsd)}
                              />
                            </div>

                            {/* Interactive dynamic limit alerts */}
                            {amount && (
                              <div className="text-[10px] font-mono px-1">
                                {Number(amount) < convertUsdToCurrency(selectedNetwork.minDepositUsd) && (
                                  <p className="text-rose-400 flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    Minimum required limit is {formatCurrency(selectedNetwork.minDepositUsd)}
                                  </p>
                                )}
                                {Number(amount) > convertUsdToCurrency(selectedNetwork.maxDepositUsd) && (
                                  <p className="text-rose-400 flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    Maximum allowable limit is {formatCurrency(selectedNetwork.maxDepositUsd)}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Column - Deposit Preview & Action (5 cols) */}
                    <div className="md:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-5 shadow-xl flex flex-col justify-between">
                      <div className="space-y-4">
                        <h4 className="text-xs font-mono font-black text-slate-400 uppercase tracking-wider pb-3 border-b border-slate-800">
                          Deposit Order Preview
                        </h4>

                        <div className="space-y-3 font-mono text-xs">
                          <div className="flex justify-between py-1 border-b border-slate-800/40">
                            <span className="text-slate-400 font-sans">Blockchain Network:</span>
                            <span className="text-white font-bold">{selectedNetwork.name}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-800/40">
                            <span className="text-slate-400 font-sans">Settle Amount:</span>
                            <span className="text-emerald-400 font-black text-sm font-bold">
                              {amount ? `${isCryptoDepositAPI ? '' : getCurrencySymbol(preferredCurrency)}${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}${isCryptoDepositAPI ? ' USDT' : ''}` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-800/40">
                            <span className="text-slate-400 font-sans">USD Value Equivalent:</span>
                            <span className="text-slate-300 font-bold">
                              {amount ? `$${convertCurrencyToUsd(Number(amount)).toFixed(2)} USD` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between py-1">
                            <span className="text-slate-400 font-sans">Processing Fee:</span>
                            <span className="text-emerald-400 font-bold font-mono">0.00% (FREE)</span>
                          </div>
                        </div>

                        <div className="bg-slate-950/50 border border-slate-800/85 rounded-xl p-3 text-[10px] text-slate-400/80 leading-relaxed">
                          <Info className="w-3.5 h-3.5 inline text-emerald-400 mr-1 shrink-0 -translate-y-0.5" />
                          Clicking <strong>"{isCryptoDepositAPI ? 'Generate QR' : 'Create Deposit'}"</strong> will call our payment gateway to establish a unique on-chain transaction session.
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-800 w-full">
                        <button
                          type="button"
                          onClick={() => { playSound('CLICK'); setCurrentStep('network'); }}
                          className="py-3.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 font-mono font-black uppercase text-[10px] tracking-widest rounded-lg transition-all font-bold cursor-pointer flex-1"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          disabled={
                            isCreatingPayment ||
                            !amount || 
                            Number(amount) < convertUsdToCurrency(selectedNetwork.minDepositUsd) ||
                            Number(amount) > convertUsdToCurrency(selectedNetwork.maxDepositUsd)
                          }
                          onClick={handleCreatePayment}
                          className="py-3.5 bg-emerald-500 text-slate-950 font-black uppercase tracking-widest text-[10px] rounded-lg shadow-xl hover:bg-emerald-400 active:scale-[0.99] transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center gap-2 border-0 cursor-pointer flex-1 animate-pulse hover:animate-none"
                        >
                          {isCreatingPayment ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <span>{isCryptoDepositAPI ? 'Generate QR' : 'Create Deposit'}</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* FAQs accordion support */}
                  {selectedNetwork.faqs && selectedNetwork.faqs.length > 0 && (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-md w-full">
                      <div className="flex items-center gap-1.5">
                        <HelpCircle className="w-4 h-4 text-emerald-400" />
                        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">Help Center FAQ</h4>
                      </div>
                      <div className="space-y-2">
                        {selectedNetwork.faqs.map((faq, i) => {
                          const isOpen = activeFaq === i;
                          return (
                            <div 
                              key={i} 
                              className="border border-slate-800/80 bg-slate-950/40 rounded-lg overflow-hidden transition-all"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveFaq(isOpen ? null : i);
                                  playSound('CLICK');
                                }}
                                className="w-full px-4 py-3.5 text-left flex justify-between items-center text-xs text-slate-200 hover:text-emerald-400 font-bold transition-colors cursor-pointer"
                              >
                                <span>{faq.question}</span>
                                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-400' : ''}`} />
                              </button>
                              <AnimatePresence initial={false}>
                                {isOpen && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="px-4 pb-3.5 text-[11px] text-slate-400 leading-relaxed italic border-t border-slate-800/40 pt-2 font-medium">
                                      {faq.answer}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: VERIFICATION */}
              {currentStep === 'review' && selectedNetwork && (
                <div className="space-y-6">
                  {/* Selected Network pipeline display */}
                  <div className="flex items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-md font-mono font-black border border-emerald-500/20">
                        PIPELINE
                      </span>
                      <span className="text-xs text-slate-300">
                        Configuring deposit for: <strong className="text-white font-bold">{selectedNetwork.name}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setCurrentStep('network'); playSound('CLICK'); }}
                      className="text-[10px] font-mono font-black text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700/60 px-2.5 py-1.5 rounded-lg border border-slate-700/60 transition-all cursor-pointer"
                    >
                      Change Network
                    </button>
                  </div>

                  {/* Warning Security Checkpoint banner */}
                  <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl space-y-2 w-full">
                    <div className="flex items-center gap-2 text-rose-400">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <h5 className="font-bold text-[10px] uppercase tracking-wider font-mono">Security Checkpoint</h5>
                    </div>
                    <p className="text-[10px] text-rose-200/85 leading-relaxed">
                      {selectedNetwork.warningMessage || "Verify that you have actually sent the on-chain assets. Submitting false claims is a breach of guidelines."}
                    </p>
                  </div>

                  {/* Main Split Screen container */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full items-stretch">
                    
                    {/* Left Column: Interactive Payment Panel */}
                    <div className="md:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-6 shadow-xl flex flex-col justify-between">
                      <div className="space-y-5">
                        <div className="flex justify-between items-start gap-4 pb-4 border-b border-slate-800/80">
                          <div className="space-y-1">
                            <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest font-mono block">STEP 3: SCAN & DEPOSIT</span>
                            <h3 className="text-lg font-display font-black text-white tracking-tight">Make Payment</h3>
                          </div>
                          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                            <Coins className="w-5 h-5" />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
                          {/* Payment QR code */}
                          <div className="sm:col-span-5 text-center flex flex-col justify-center items-center">
                            <div 
                              onClick={() => { setZoomQr(true); playSound('CLICK'); }}
                              className="relative bg-white p-2.5 rounded-xl shadow-2xl mx-auto w-32 h-32 flex items-center justify-center border border-slate-200 cursor-zoom-in group transition-all"
                            >
                              {activePayment?.qrCode ? (
                                <img src={activePayment.qrCode} alt="Deposit QR Code" className="w-full h-full object-contain" />
                              ) : (
                                <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-mono">No QR</div>
                              )}
                              <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 rounded-xl flex flex-col items-center justify-center transition-all text-white font-mono text-[9px] uppercase tracking-wider gap-1">
                                <Eye className="w-4 h-4 text-emerald-400" /> 
                                <span>Zoom QR</span>
                              </div>
                            </div>
                            <span className="text-[8px] text-slate-500 mt-2 block font-mono">Click to expand QR Code</span>
                          </div>

                          {/* Payment details text */}
                          <div className="sm:col-span-7 space-y-3 font-mono text-[11px]">
                            <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 flex items-center justify-between">
                              <span className="text-slate-500 uppercase tracking-widest text-[8px] font-sans">Payment ID</span>
                              <span className="text-emerald-400 font-bold font-mono">{activePayment?.paymentId || "PAY-PENDING"}</span>
                            </div>

                            <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 flex items-center justify-between">
                              <span className="text-slate-500 uppercase tracking-widest text-[8px] font-sans">Network</span>
                              <span className="text-white font-bold">{selectedNetwork.name}</span>
                            </div>

                            <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 flex items-center justify-between">
                              <span className="text-slate-500 uppercase tracking-widest text-[8px] font-sans">Settle Amount</span>
                              <span className="text-emerald-400 font-bold font-mono text-xs">{amount ? `${getCurrencySymbol(preferredCurrency)}${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}</span>
                            </div>

                            <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 flex items-center justify-between">
                              <span className="text-slate-500 uppercase tracking-widest text-[8px] font-sans">Mempool Status</span>
                              <span className="text-amber-400 font-bold flex items-center gap-1 animate-pulse font-sans">
                                <Activity className="w-3 h-3 animate-spin" />
                                {activePayment?.paymentStatus || "waiting"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Wallet copy block */}
                        <div className="space-y-2 pt-2 border-t border-slate-800/50">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block px-1">
                            Deposit Wallet Address
                          </label>
                          <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 flex items-center justify-between gap-3 w-full">
                            <span className="text-[10px] font-mono text-emerald-400 break-all select-all font-black flex-1 min-w-0 leading-relaxed">
                              {activePayment?.walletAddress || selectedNetwork.depositAddress}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(activePayment?.walletAddress || selectedNetwork.depositAddress)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md transition-all cursor-pointer border-0 shrink-0"
                              title="Copy Wallet Address"
                            >
                              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
                            </button>
                          </div>
                        </div>

                        {/* Extra details below the QR when using the real crypto deposit endpoint */}
                        {isCryptoDepositAPI && (
                          <div className="mt-4 p-4 bg-slate-950/70 border border-emerald-500/10 rounded-xl space-y-2.5 font-mono text-xs">
                            <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider font-sans pb-1 border-b border-slate-800/60">
                              USDT Crypto Deposit Invoice
                            </div>
                            <div className="flex justify-between items-center gap-4 py-0.5 border-b border-slate-900/60">
                              <span className="text-slate-500 text-[10px]">Wallet Address:</span>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-slate-200 text-[10px] truncate select-all font-bold">{activePayment?.walletAddress}</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(activePayment?.walletAddress || '')}
                                  className="text-slate-400 hover:text-white transition-colors border-0 p-0"
                                  title="Copy Wallet Address"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <div className="flex justify-between py-0.5 border-b border-slate-900/60">
                              <span className="text-slate-500 text-[10px]">Network Name:</span>
                              <span className="text-slate-200 font-bold">{mapNetworkIdToName(selectedNetwork.id)} ({selectedNetwork.name})</span>
                            </div>
                            <div className="flex justify-between py-0.5 border-b border-slate-900/60">
                              <span className="text-slate-500 text-[10px]">Deposit Amount:</span>
                              <span className="text-emerald-400 font-bold">{activePayment?.amount} USDT</span>
                            </div>
                            <div className="flex justify-between py-0.5 border-b border-slate-900/60">
                              <span className="text-slate-500 text-[10px]">Deposit ID:</span>
                              <span className="text-slate-200 font-bold">{activePayment?.paymentId}</span>
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span className="text-slate-500 text-[10px]">Status:</span>
                              <span className="text-amber-400 font-bold uppercase tracking-wider animate-pulse">Pending</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="pt-4 border-t border-slate-800/50">
                        <button
                          type="button"
                          onClick={() => { playSound('CLICK'); setCurrentStep('details'); }}
                          className="w-full py-3 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 font-mono font-bold uppercase text-[10px] tracking-widest rounded-lg transition-all cursor-pointer"
                        >
                          Modify Amount Selection
                        </button>
                      </div>
                    </div>

                    {/* Right Column: Submission Verification Form */}
                    <div className="md:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-5 shadow-xl flex flex-col justify-between">
                      <div className="space-y-4">
                        <h4 className="text-xs font-mono font-black text-slate-400 uppercase tracking-wider pb-3 border-b border-slate-800">
                          Verify & Submit Proof
                        </h4>

                        {/* Transaction hash input field */}
                        <div className="space-y-2">
                          <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">
                            Sender Tx Hash / TXID / Wallet Address
                          </label>
                          <input
                            type="text"
                            value={txDetails}
                            onChange={(e) => setTxDetails(e.target.value)}
                            className="w-full bg-slate-950/80 border border-slate-800 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 rounded-lg px-3 py-2.5 text-xs focus:outline-none transition-all text-white font-mono"
                            placeholder="Blockchain TXID or sending address"
                            required
                          />
                        </div>

                        {/* Screenshot uploader component */}
                        <div className="space-y-2">
                          <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest font-mono">
                            Upload Screenshot Proof
                          </label>
                          <div 
                            onDragEnter={handleDrag}
                            onDragOver={handleDrag}
                            onDragLeave={handleDrag}
                            onDrop={handleDrop}
                            className={`relative border border-dashed rounded-lg h-24 flex flex-col items-center justify-center transition-all overflow-hidden group bg-slate-950/40 ${
                              dragActive 
                                ? 'border-emerald-500/60 bg-emerald-500/[0.02]' 
                                : screenshot 
                                  ? 'border-emerald-500/30' 
                                  : 'border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            {screenshot ? (
                              <>
                                <img src={screenshot} alt="Screenshot Proof" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-all">
                                  <ImageIcon className="w-5 h-5 text-white animate-pulse" />
                                  <span className="text-[9px] font-bold text-white uppercase tracking-wider font-mono">Replace Screenshot</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setScreenshot(undefined);
                                    playSound('CLICK');
                                  }}
                                  className="absolute top-2 right-2 p-1 bg-slate-900/90 text-slate-400 hover:text-white rounded-md border border-slate-800 cursor-pointer z-20"
                                  title="Remove image"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <div className="text-center p-3 space-y-1.5 text-slate-500">
                                <Upload className="w-5 h-5 mx-auto opacity-35 text-slate-400" />
                                <div className="text-[9px] font-bold uppercase tracking-widest font-mono">
                                  Drag file or <span className="text-emerald-400 underline cursor-pointer">browse</span>
                                </div>
                              </div>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleScreenshotUpload}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-800 w-full">
                        <button
                          type="button"
                          disabled={
                            isSubmitting ||
                            !txDetails.trim() || 
                            !screenshot
                          }
                          onClick={handleSubmitDeposit}
                          className="w-full py-3.5 bg-emerald-500 text-slate-950 font-black uppercase tracking-widest text-[10px] rounded-lg shadow-xl hover:bg-emerald-400 active:scale-[0.99] transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center gap-2 border-0 cursor-pointer"
                        >
                          {isSubmitting ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Logging Audit Claim...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Confirm & Submit Proof
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: TIMELINE */}
              {currentStep === 'status' && (() => {
                const isConfirmed = trackedDeposit?.status === 'confirmed' || trackedDeposit?.status === 'completed';
                const txHash = trackedDeposit?.transactionHash || '';
                
                return (
                  <div className="space-y-6">
                    {/* Claim Confirmed Card */}
                    <div className={`p-6 bg-slate-900 border ${isConfirmed ? 'border-emerald-500/40' : 'border-amber-500/20'} rounded-2xl text-center space-y-4 shadow-2xl relative overflow-hidden transition-all duration-500`}>
                      <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${isConfirmed ? 'from-emerald-500 to-teal-400' : 'from-amber-500 to-orange-400 animate-pulse'}`} />
                      
                      <div className={`w-14 h-14 ${isConfirmed ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-amber-500/10 border-amber-500/25'} rounded-full flex items-center justify-center mx-auto border`}>
                        {isConfirmed ? (
                          <ShieldCheck className="w-7 h-7 text-emerald-400" />
                        ) : (
                          <Activity className="w-7 h-7 text-amber-400 animate-pulse" />
                        )}
                      </div>
                      
                      <div>
                        <h3 className="text-lg font-bold text-white uppercase tracking-wider font-mono">
                          {isConfirmed ? 'Deposit Fully Confirmed' : 'Payment Pending Verification'}
                        </h3>
                        <p className="text-slate-400 text-xs mt-1">
                          {isConfirmed ? `USDT credited to ${selectedNetwork?.name} Wallet` : `Awaiting Blockchain Webhook Confirmations`}
                        </p>
                      </div>
                      
                      <p className="text-slate-300 text-[11px] leading-relaxed max-w-md mx-auto">
                        {isConfirmed ? (
                          <span>
                            Success! Your deposit of <strong className="text-emerald-400 font-mono text-sm">{getCurrencySymbol(preferredCurrency)}{Number(amount).toLocaleString()}</strong> has been verified by the blockchain oracle, and your account balance was automatically updated.
                          </span>
                        ) : (
                          <span>
                            Your deposit claim of <strong className="text-amber-400 font-mono">{getCurrencySymbol(preferredCurrency)}{Number(amount).toLocaleString()}</strong> was logged. Our automated payment hook is scanning the mempools. Please keep this tab open.
                          </span>
                        )}
                      </p>

                      {/* Display transaction details after webhook confirmation */}
                      {isConfirmed && (
                        <div className="mt-4 p-4 bg-slate-950/60 rounded-xl border border-emerald-500/10 text-left space-y-2.5 max-w-md mx-auto">
                          <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-slate-500">DEPOSIT ID:</span>
                            <span className="text-slate-300 font-bold">{activePayment?.paymentId}</span>
                          </div>
                          <div className="flex justify-between text-[10px] font-mono">
                            <span className="text-slate-500">NETWORK:</span>
                            <span className="text-emerald-400 font-black">{selectedNetwork?.name}</span>
                          </div>
                          {txHash && (
                            <div className="space-y-1 pt-1.5 border-t border-slate-900">
                              <span className="text-[9px] font-mono text-slate-500 block">TRANSACTION HASH:</span>
                              <div className="flex items-center justify-between gap-2 bg-slate-900 px-2 py-1.5 rounded border border-slate-800">
                                <span className="text-[10px] font-mono text-slate-300 truncate max-w-[280px]">{txHash}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(txHash);
                                    showToast("Transaction hash copied!", "success");
                                    playSound('CLICK');
                                  }}
                                  className="p-1 bg-slate-950 text-slate-400 hover:text-emerald-400 rounded transition-colors border-0 cursor-pointer"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Progressive timeline tracker */}
                    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-5 shadow-xl">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
                        <p className="text-xs font-black uppercase text-slate-300 tracking-wider flex items-center gap-1.5 font-bold">
                          <Activity className={`w-4 h-4 ${isConfirmed ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`} />
                          Blockchain Confirmation Hub
                        </p>
                        <span className={`text-[10px] font-mono ${isConfirmed ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20 animate-pulse'} px-2 py-0.5 border rounded uppercase font-black tracking-wider`}>
                          {isConfirmed ? 'SYNC COMPLETE' : 'LIVE MEMPOOL SYNC'}
                        </span>
                      </div>

                      {/* Timeline elements */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
                        {/* 1. Submitted */}
                        <div className="bg-slate-950/80 p-3 rounded-lg border border-emerald-500/30 flex flex-col justify-between min-h-[90px] relative">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-mono text-emerald-400 font-black uppercase">Completed</span>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          </div>
                          <div>
                            <span className="text-[11px] font-bold text-slate-200 block">Submitted</span>
                            <span className="text-[9px] text-slate-500 block leading-tight font-sans mt-0.5">Audit ledger logged</span>
                          </div>
                        </div>

                        {/* 2. Verification */}
                        <div className={`bg-slate-950/80 p-3 rounded-lg border ${isConfirmed ? 'border-emerald-500/30' : 'border-cyan-500/20'} flex flex-col justify-between min-h-[90px]`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-[8px] font-mono ${isConfirmed ? 'text-emerald-400' : 'text-cyan-400'} font-bold uppercase`}>
                              {isConfirmed ? 'Completed' : 'In Progress'}
                            </span>
                            {isConfirmed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                            )}
                          </div>
                          <div>
                            <span className="text-[11px] font-bold text-slate-200 block">Verification</span>
                            <span className="text-[9px] text-slate-500 block leading-tight font-sans mt-0.5">
                              {isConfirmed ? 'Screenshot verified' : 'Checking screenshot'}
                            </span>
                          </div>
                        </div>

                        {/* 3. Node Consensus */}
                        <div className={`bg-slate-950/80 p-3 rounded-lg border ${isConfirmed ? 'border-emerald-500/30' : 'border-slate-800'} flex flex-col justify-between min-h-[90px]`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-[8px] font-mono ${isConfirmed ? 'text-emerald-400' : 'text-slate-500'} font-bold uppercase`}>
                              {isConfirmed ? 'Completed' : 'Pending'}
                            </span>
                            {isConfirmed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 text-slate-600" />
                            )}
                          </div>
                          <div>
                            <span className={`text-[11px] font-bold ${isConfirmed ? 'text-slate-200' : 'text-slate-400'} block`}>Node Consensus</span>
                            <span className={`text-[9px] ${isConfirmed ? 'text-slate-500' : 'text-slate-600'} block leading-tight font-sans mt-0.5`}>
                              {isConfirmed ? 'Oracle matches' : 'Querying miners'}
                            </span>
                          </div>
                        </div>

                        {/* 4. Ledger Balance */}
                        <div className={`bg-slate-950/80 p-3 rounded-lg border ${isConfirmed ? 'border-emerald-500/30' : 'border-slate-800'} flex flex-col justify-between min-h-[90px]`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-[8px] font-mono ${isConfirmed ? 'text-emerald-400' : 'text-slate-500'} font-bold uppercase`}>
                              {isConfirmed ? 'Completed' : 'Pending'}
                            </span>
                            {isConfirmed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 text-slate-600" />
                            )}
                          </div>
                          <div>
                            <span className={`text-[11px] font-bold ${isConfirmed ? 'text-slate-200' : 'text-slate-400'} block`}>Ledger Balance</span>
                            <span className={`text-[9px] ${isConfirmed ? 'text-slate-500' : 'text-slate-600'} block leading-tight font-sans mt-0.5`}>
                              {isConfirmed ? 'Balance credited' : 'Adding balance'}
                            </span>
                          </div>
                        </div>

                        {/* 5. Completed */}
                        <div className={`bg-slate-950/80 p-3 rounded-lg border ${isConfirmed ? 'border-emerald-500/30' : 'border-slate-800'} flex flex-col justify-between min-h-[90px] col-span-2 md:col-span-1`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-[8px] font-mono ${isConfirmed ? 'text-emerald-400' : 'text-slate-500'} font-bold uppercase`}>
                              {isConfirmed ? 'Completed' : 'Pending'}
                            </span>
                            {isConfirmed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 text-slate-600" />
                            )}
                          </div>
                          <div>
                            <span className={`text-[11px] font-bold ${isConfirmed ? 'text-slate-200' : 'text-slate-400'} block`}>Completed</span>
                            <span className={`text-[9px] ${isConfirmed ? 'text-slate-500' : 'text-slate-600'} block leading-tight font-sans mt-0.5`}>
                              {isConfirmed ? 'Settled securely' : 'Verified wallet'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={handleReset}
                          className="py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase text-[10px] tracking-widest rounded-lg transition-all cursor-pointer shadow-lg shadow-emerald-500/10 border-0 flex items-center justify-center gap-1.5 font-bold"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Initiate Another Deposit
                        </button>
                        <button
                          type="button"
                          onClick={() => { playSound('CLICK'); onBack(); }}
                          className="py-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 font-mono font-black uppercase text-[10px] tracking-widest rounded-lg transition-all cursor-pointer font-bold"
                        >
                          Back to Wallet Overview
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

            </motion.div>
          </AnimatePresence>

        </div>

        {/* RIGHT COLUMN: STICKY WALLET SUMMARY CARD */}
        <div id="deposit-right-column" className="lg:col-span-4 lg:sticky lg:top-24 space-y-6 w-full">
          
          {/* Main sticky summary module */}
          <div id="deposit-sticky-summary" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl relative overflow-hidden w-full select-none">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/[0.01] rounded-full blur-2xl pointer-events-none" />
            
            {/* Header banner */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Wallet className="w-4.5 h-4.5 text-emerald-400" />
                <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider font-mono">Live Wallet Summary</h4>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            </div>

            {/* Metrics rows */}
            <div className="space-y-4">
              
              {/* Available Balance block */}
              <div className="p-4 bg-slate-950/80 border border-slate-800/80 rounded-xl space-y-1">
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest font-mono block">Available Wallet Balance</span>
                <span className="text-2xl font-mono font-black text-white tracking-tight block">
                  {availableBalanceFormatted}
                </span>
                <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                  ≈ {(currentPlayer?.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                </span>
              </div>

              {/* Grid with statistics */}
              <div className="grid grid-cols-2 gap-3">
                {/* Pending */}
                <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
                  <span className="text-[8px] font-bold text-amber-500 uppercase tracking-widest font-mono block">Pending Sync</span>
                  <span className="text-xs font-mono font-bold text-white mt-1 block">
                    {pendingDepositsFormatted}
                  </span>
                </div>

                {/* Today's */}
                <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg">
                  <span className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest font-mono block">Cleared Today</span>
                  <span className="text-xs font-mono font-bold text-white mt-1 block">
                    {todayDepositsFormatted}
                  </span>
                </div>

                {/* Total */}
                <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg col-span-2 flex justify-between items-center">
                  <div>
                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest font-mono block">Cumulative Synced Deposit</span>
                    <span className="text-sm font-mono font-bold text-white mt-1 block">
                      {totalDepositsFormatted}
                    </span>
                  </div>
                  <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
                </div>
              </div>

              {/* Active Network specifics */}
              <div className="border-t border-slate-800 pt-4 space-y-2 text-[11px] font-mono leading-relaxed">
                <div className="flex justify-between">
                  <span className="text-slate-500">Deposit Currency:</span>
                  <span className="text-white font-bold">{preferredCurrency} ({getCurrencySymbol(preferredCurrency)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Live Exchange Index:</span>
                  <span className="text-emerald-400 font-bold">1 USD = {convertUsdToCurrency(1).toFixed(4)} {preferredCurrency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Selected Blockchain:</span>
                  <span className="text-white font-bold">{selectedNetwork ? selectedNetwork.name : 'Not chosen'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Est. Settlement Time:</span>
                  <span className="text-emerald-400 font-bold">{selectedNetwork ? selectedNetwork.estimatedTime : 'N/A'}</span>
                </div>
              </div>

            </div>

            {/* Quick status timeline for last initiated claim */}
            {latestDeposit ? (
              <div className="border-t border-slate-800 pt-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest font-mono">Latest Ledger Submission</span>
                  <span className="text-[9px] text-slate-400 font-mono">{new Date(latestDeposit.timestamp).toLocaleDateString()}</span>
                </div>
                
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-slate-200 block truncate">
                      {latestDeposit.method}
                    </span>
                    <span className="text-xs font-mono text-emerald-400 font-black block mt-0.5">
                      {getCurrencySymbol(preferredCurrency)}{convertUsdToCurrency(latestDeposit.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  
                  {/* Status Badge */}
                  <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 border ${
                    latestDeposit.status === 'completed'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : latestDeposit.status === 'pending'
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}>
                    {latestDeposit.status === 'pending' ? 'Pending' : latestDeposit.status === 'completed' ? 'Cleared' : 'Rejected'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="border-t border-slate-800 pt-4 text-center">
                <p className="text-[10px] text-slate-500 font-mono italic">No recent claims submitted.</p>
              </div>
            )}

          </div>

          {/* Quick compliance box */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Shield className="w-4 h-4 text-emerald-400" />
              <h5 className="text-[10px] font-bold uppercase tracking-wider font-mono">Crypto Safety Compliance</h5>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              We monitor network confirmations and mempool gas prices. Claim verify workflows require manual confirmation by the auditing staff before credit clearing.
            </p>
          </div>

        </div>

      </div>

      {/* FOOTER AREA: RECENT DEPOSITS LOGS */}
      <div id="deposit-recent-logs" className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl space-y-5 w-full overflow-hidden shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Clock className="w-4.5 h-4.5 text-emerald-400" />
              Recent Ledger Claims History
            </h3>
            <p className="text-slate-400 text-xs">
              Audit logs for your latest blockchain transaction credit request claims.
            </p>
          </div>
          <span className="text-[10px] font-bold text-slate-400 font-mono bg-slate-950 border border-slate-800 px-3 py-1 rounded-lg uppercase shrink-0 self-start sm:self-auto">
            {userDeposits.length} Claims Saved
          </span>
        </div>

        {userDeposits.length === 0 ? (
          <div className="py-12 text-center rounded-xl border border-dashed border-slate-800 bg-slate-950/20 text-slate-500 space-y-2">
            <Coins className="w-8 h-8 mx-auto opacity-15" />
            <p className="text-xs font-bold uppercase font-mono text-slate-400">No transactions cleared yet.</p>
          </div>
        ) : (
          <div className="w-full">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-800/80 bg-slate-950/40">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-widest text-[9px] font-mono bg-slate-950/80">
                    <th className="p-4">Deposit ID</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Network</th>
                    <th className="p-4">Wallet Address</th>
                    <th className="p-4 text-right">Amount</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4">TX Hash / Proof</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {userDeposits.map((dep) => {
                    const txHash = dep.details.includes('| TXID/Address:') 
                      ? dep.details.split('| TXID/Address:')[1]?.trim() 
                      : dep.details;
                    
                    const displayWallet = dep.walletAddress || (dep.details.includes('| Target Address:') 
                      ? dep.details.split('| Target Address:')[1]?.split('|')[0]?.trim() 
                      : dep.details.split('|')[0]?.trim() || dep.details);

                    return (
                      <tr key={dep.id} className="hover:bg-slate-900/40 transition-all font-mono">
                        <td className="p-4 text-white font-bold text-[11px]">
                          {dep.depositId || dep.id}
                        </td>
                        <td className="p-4 text-slate-400 text-[11px]">
                          {new Date(dep.timestamp).toLocaleString()}
                        </td>
                        <td className="p-4 font-bold text-slate-300 font-sans text-[11px]">
                          {dep.network || dep.method}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-1.5 max-w-[150px]">
                            <span className="text-slate-400 truncate text-[11px]" title={displayWallet}>
                              {displayWallet}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(displayWallet)}
                              className="p-1 bg-transparent hover:bg-slate-850 rounded text-slate-400 hover:text-white border-0 cursor-pointer"
                              title="Copy Wallet"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                        <td className="p-4 text-right font-bold text-emerald-400 text-xs">
                          {getCurrencySymbol(preferredCurrency)}{convertUsdToCurrency(dep.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider inline-block border ${
                            dep.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : dep.status === 'pending'
                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}>
                            {dep.status === 'pending' ? 'Pending' : dep.status === 'completed' ? 'Completed' : 'Rejected'}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 max-w-[120px]">
                              <span className="text-slate-500 truncate text-[11px]" title={txHash}>
                                {txHash}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(txHash)}
                                className="p-1 bg-transparent hover:bg-slate-800 rounded text-slate-400 hover:text-white border-0 cursor-pointer"
                                title="Copy Hash"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              {dep.screenshotUrl && (
                                <button
                                  type="button"
                                  onClick={() => { setSelectedTxForModal(dep); playSound('CLICK'); }}
                                  className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 text-[9px] flex items-center gap-1 cursor-pointer"
                                  title="View Proof Screenshot"
                                >
                                  <ImageIcon className="w-3 h-3" /> Proof
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards Layout (Guarantees zero overflow or horizontal scroll) */}
            <div className="md:hidden space-y-4">
              {userDeposits.map((dep) => {
                const txHash = dep.details.includes('| TXID/Address:') 
                  ? dep.details.split('| TXID/Address:')[1]?.trim() 
                  : dep.details;

                const displayWallet = dep.walletAddress || (dep.details.includes('| Target Address:') 
                  ? dep.details.split('| Target Address:')[1]?.split('|')[0]?.trim() 
                  : dep.details.split('|')[0]?.trim() || dep.details);

                return (
                  <div key={dep.id} className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 space-y-3.5 text-xs font-mono">
                    
                    {/* Header bar */}
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-sm font-sans">{dep.network || dep.method}</span>
                          <span className="text-[9px] bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded uppercase">{dep.depositId || dep.id}</span>
                        </div>
                        <span className="text-[9px] text-slate-500">{new Date(dep.timestamp).toLocaleString()}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                        dep.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : dep.status === 'pending'
                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}>
                        {dep.status === 'pending' ? 'Pending' : dep.status === 'completed' ? 'Cleared' : 'Rejected'}
                      </span>
                    </div>

                    {/* Data Specs */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] border-t border-slate-800/60 pt-3">
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase font-sans">USDT Wallet</span>
                        <div className="flex items-center gap-1 font-bold text-slate-200">
                          <span className="truncate max-w-[90px]">{displayWallet}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(displayWallet)}
                            className="text-slate-500 hover:text-white p-0 border-0"
                          >
                            <Copy className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 block text-[9px] uppercase font-sans">synced sum</span>
                        <span className="font-bold text-emerald-400 text-sm">
                          {getCurrencySymbol(preferredCurrency)}{convertUsdToCurrency(dep.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* Hash copying input */}
                    <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-[8px] text-slate-500 block uppercase font-sans">Hash / identifier</span>
                        <span className="text-slate-400 text-xs truncate block leading-none mt-1">{txHash}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(txHash)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 border-0 cursor-pointer"
                        title="Copy Hash"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Actions panel */}
                    <div className="flex gap-2 justify-end pt-1 font-sans">
                      {dep.screenshotUrl && (
                        <button
                          type="button"
                          onClick={() => { setSelectedTxForModal(dep); playSound('CLICK'); }}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-800 text-[10px] flex items-center gap-1 cursor-pointer"
                        >
                          <ImageIcon className="w-3.5 h-3.5" /> Proof
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          showToast("Opening blockchain explorer lookup...", "info");
                          playSound('CLICK');
                        }}
                        className="p-1.5 bg-slate-900 hover:bg-slate-800 rounded border border-slate-800 text-slate-400 hover:text-white cursor-pointer"
                        title="Open Explorer Link"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* FULL QR ZOOM BACKDROP MODAL */}
      <AnimatePresence>
        {zoomQr && selectedNetwork && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoomQr(false)}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-zoom-out"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-slate-800 p-6 sm:p-7 rounded-2xl max-w-xs w-full text-center space-y-5 relative shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setZoomQr(false)}
                className="absolute top-4 right-4 p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md border-0 text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-1">
                <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded">
                  {selectedNetwork.name} QR
                </span>
                <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider font-mono mt-1">High-Res Address Code</h4>
              </div>

              {/* Large Code Container */}
              <div className="bg-white p-4 rounded-xl shadow-2xl mx-auto w-48 h-48 flex items-center justify-center">
                <img src={activePayment?.qrCode || selectedNetwork.qrCodeUrl} alt="Deposit QR Zoomed" className="w-full h-full object-contain" />
              </div>

              <div className="space-y-2 text-left font-mono">
                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest text-center">
                  WALLET ADDRESS TARGET
                </p>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 text-center">
                  <span className="text-[11px] text-emerald-400 select-all break-all font-bold block leading-relaxed">
                    {activePayment?.walletAddress || selectedNetwork.depositAddress}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCopy(selectedNetwork.depositAddress)}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase text-[10px] tracking-widest rounded-lg transition-all border-0 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" /> Copy Destination Address
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SCREENSHOT PROOF ZOOM MODAL */}
      <AnimatePresence>
        {selectedTxForModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedTxForModal(null)}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4 cursor-zoom-out"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-slate-800 p-5 rounded-2xl max-w-md w-full text-center space-y-4 relative shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setSelectedTxForModal(null)}
                className="absolute top-4 right-4 p-1.5 bg-slate-800 hover:bg-slate-700 rounded-md border-0 text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-1">
                <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded">
                  AUDIT TRANSACTION RECEIPT
                </span>
                <p className="text-xs text-slate-400 font-bold font-mono mt-1">
                  Value: {getCurrencySymbol(preferredCurrency)}{convertUsdToCurrency(selectedTxForModal.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>

              {/* Large Image Frame */}
              <div className="bg-slate-950 rounded-xl overflow-hidden border border-slate-800/80 max-h-[340px] flex items-center justify-center p-2">
                <img 
                  src={selectedTxForModal.screenshotUrl} 
                  alt="Transaction screenshot proof" 
                  className="max-h-[320px] max-w-full object-contain rounded" 
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="text-[9px] text-slate-500 font-mono flex justify-between px-1">
                <span>CLAIM ID: {selectedTxForModal.id}</span>
                <span>SUBMITTED: {new Date(selectedTxForModal.timestamp).toLocaleDateString()}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
