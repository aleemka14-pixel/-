import React, { useState, useMemo, useEffect, memo } from 'react';
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
  Activity,
  QrCode,
  Building2,
  Plus,
  Star,
  Edit2,
  Eye,
  EyeOff,
  ChevronRight,
  RefreshCw,
  Lock,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { WithdrawalNetwork, WithdrawalSettings, Player, WithdrawalRequest, SavedWithdrawalMethod } from '../types.ts';
import { DEFAULT_RATES } from '../lib/currency.ts';
import { 
  encryptSavedData, 
  decryptSavedData, 
  maskCryptoAddress, 
  maskUpiId, 
  maskBankAccountNumber, 
  formatMaskedDestination, 
  lookupBankFromIFSC, 
  validateUpiFormat, 
  validateBankDetails 
} from '../lib/withdrawal-utils.ts';

// Currency formatting helpers
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

const validateCryptoAddress = (address: string, networkId: string): boolean => {
  const addr = address.trim();
  if (!addr) return false;
  switch ((networkId || '').toLowerCase()) {
    case 'tron':
    case 'trc20':
      return /^T[a-km-zA-HJ-NP-Z1-9]{33}$/.test(addr);
    case 'eth':
    case 'erc20':
    case 'bsc':
    case 'bep20':
    case 'polygon':
      return /^0x[a-fA-F0-9]{40}$/.test(addr);
    case 'btc':
      return /^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$|^(bc1)[a-zA-HJ-NP-Z0-9]{25,59}$/.test(addr);
    case 'sol':
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
    default:
      return addr.length >= 8;
  }
};

const getBlockExplorerUrl = (txHash: string, networkId?: string): string => {
  if (!txHash || txHash === 'Manual Override') return '#';
  const net = (networkId || '').toLowerCase();
  if (net.includes('bsc') || net.includes('bep20')) {
    return `https://bscscan.com/tx/${txHash}`;
  }
  if (net.includes('eth') || net.includes('erc20')) {
    return `https://etherscan.io/tx/${txHash}`;
  }
  if (net.includes('btc')) {
    return `https://mempool.space/tx/${txHash}`;
  }
  if (net.includes('sol')) {
    return `https://solscan.io/tx/${txHash}`;
  }
  return `https://tronscan.org/#/transaction/${txHash}`;
};

interface RedesignedWithdrawViewProps {
  withdrawalNetworks: WithdrawalNetwork[];
  withdrawalSettings?: WithdrawalSettings;
  currentPlayer: Player;
  withdrawalsHistory: WithdrawalRequest[];
  onBack: () => void;
  onWithdraw: (
    amountUsd: number, 
    networkId: string, 
    walletAddress: string, 
    feeUsd: number, 
    prefCurrency?: string, 
    exRate?: number, 
    prefAmount?: number
  ) => Promise<void>;
  preferredCurrency: string;
  rates: Record<string, number>;
  playSound: (sound: 'CLICK' | 'WIN' | 'LOSE' | 'BET' | 'SPIN') => void;
}

export const RedesignedWithdrawView = memo(function RedesignedWithdrawView({
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
  // Method category selector: 'crypto' | 'upi' | 'bank'
  const [methodCategory, setMethodCategory] = useState<'crypto' | 'upi' | 'bank'>('crypto');

  // Saved withdrawal methods (encrypted local storage)
  const [savedMethods, setSavedMethods] = useState<SavedWithdrawalMethod[]>(() => {
    const raw = localStorage.getItem('saved_withdrawal_methods_v2');
    if (raw) {
      const decrypted = decryptSavedData<SavedWithdrawalMethod[]>(raw);
      if (decrypted && Array.isArray(decrypted)) return decrypted;
    }
    // Default initial saved methods
    const initial: SavedWithdrawalMethod[] = [
      {
        id: 'sm-1',
        type: 'crypto',
        label: 'My TRC20 Wallet',
        isDefault: true,
        networkId: 'trc20',
        walletAddress: 'TY77v827vGNSda88njas99jBshDja9JkaN',
        createdAt: Date.now() - 86400000
      },
      {
        id: 'sm-2',
        type: 'upi',
        label: 'Personal Google Pay',
        isDefault: false,
        upiId: 'john.doe@okaxis',
        createdAt: Date.now() - 43200000
      },
      {
        id: 'sm-3',
        type: 'bank',
        label: 'SBI Primary Account',
        isDefault: false,
        accountHolder: 'John Doe',
        accountNumber: '389201984821',
        ifsc: 'SBIN0001234',
        bankName: 'State Bank of India',
        createdAt: Date.now() - 20000000
      }
    ];
    localStorage.setItem('saved_withdrawal_methods_v2', encryptSavedData(initial));
    return initial;
  });

  // Save methods update helper
  const updateSavedMethods = (updated: SavedWithdrawalMethod[]) => {
    setSavedMethods(updated);
    localStorage.setItem('saved_withdrawal_methods_v2', encryptSavedData(updated));
  };

  // Active networks for Crypto
  const activeNetworks = useMemo(() => {
    if (!withdrawalNetworks || withdrawalNetworks.length === 0) {
      return [
        { 
          id: 'trc20', 
          name: 'TRON (TRC20)', 
          logoUrl: '', 
          bannerUrl: '', 
          title: 'TRON (TRC20)', 
          subtitle: 'Low Fee & Instant', 
          description: '', 
          averageFee: 1.0, 
          networkFeeText: '1.0 USDT', 
          estimatedTime: '2-5 mins', 
          popularityBadge: 'Most Popular', 
          securityRating: 5, 
          status: 'Online', 
          warningMessage: '', 
          instructions: '', 
          minWithdraw: 10, 
          maxWithdraw: 10000, 
          faq: [], 
          priority: 1, 
          enabled: true 
        },
        { 
          id: 'bep20', 
          name: 'BNB Chain (BEP20)', 
          logoUrl: '', 
          bannerUrl: '', 
          title: 'BNB Chain (BEP20)', 
          subtitle: 'Lowest Fee', 
          description: '', 
          averageFee: 0.5, 
          networkFeeText: '0.5 USDT', 
          estimatedTime: '1-3 mins', 
          popularityBadge: 'Lowest Fee', 
          securityRating: 5, 
          status: 'Online', 
          warningMessage: '', 
          instructions: '', 
          minWithdraw: 10, 
          maxWithdraw: 10000, 
          faq: [], 
          priority: 2, 
          enabled: true 
        },
        { 
          id: 'erc20', 
          name: 'Ethereum (ERC20)', 
          logoUrl: '', 
          bannerUrl: '', 
          title: 'Ethereum (ERC20)', 
          subtitle: 'High Security', 
          description: '', 
          averageFee: 5.0, 
          networkFeeText: '5.0 USDT', 
          estimatedTime: '5-15 mins', 
          popularityBadge: 'High Security', 
          securityRating: 5, 
          status: 'Online', 
          warningMessage: '', 
          instructions: '', 
          minWithdraw: 20, 
          maxWithdraw: 10000, 
          faq: [], 
          priority: 3, 
          enabled: true 
        }
      ] as WithdrawalNetwork[];
    }
    return withdrawalNetworks.filter(n => n.enabled);
  }, [withdrawalNetworks]);

  // Crypto Form State
  const [selectedCryptoNetworkId, setSelectedCryptoNetworkId] = useState<string>(
    activeNetworks.length > 0 ? activeNetworks[0].id : 'trc20'
  );
  const selectedNetwork = useMemo(() => {
    return activeNetworks.find(n => n.id === selectedCryptoNetworkId) || activeNetworks[0];
  }, [activeNetworks, selectedCryptoNetworkId]);

  const [cryptoAddress, setCryptoAddress] = useState<string>('');

  // UPI Form State
  const [upiId, setUpiId] = useState<string>('');

  // Bank Form State
  const [bankAccountHolder, setBankAccountHolder] = useState<string>('');
  const [bankAccountNumber, setBankAccountNumber] = useState<string>('');
  const [confirmBankAccountNumber, setConfirmBankAccountNumber] = useState<string>('');
  const [bankIfsc, setBankIfsc] = useState<string>('');
  const [bankName, setBankName] = useState<string>('');

  // Auto-detect bank name from IFSC
  useEffect(() => {
    if (bankIfsc.length >= 4) {
      const detected = lookupBankFromIFSC(bankIfsc);
      if (detected) {
        setBankName(detected);
      }
    }
  }, [bankIfsc]);

  // General Amount State
  const [amountUsd, setAmountUsd] = useState<string>('');
  const [saveMethodChecked, setSaveMethodChecked] = useState<boolean>(true);
  const [savedMethodLabel, setSavedMethodLabel] = useState<string>('');

  // Currency Switcher State
  const [activeCurrency, setActiveCurrency] = useState<string>(preferredCurrency || 'USD');
  const [currencyDropdownOpen, setCurrencyDropdownOpen] = useState<boolean>(false);

  // UI Flow State
  const [showSavedMethodDrawer, setShowSavedMethodDrawer] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // History & Filters
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyFilterStatus, setHistoryFilterStatus] = useState<string>('all');
  const [historyFilterCategory, setHistoryFilterCategory] = useState<string>('all');
  const [copiedTxId, setCopiedTxId] = useState<string | null>(null);

  // Edit / Add Saved Method Modal
  const [editingMethod, setEditingMethod] = useState<SavedWithdrawalMethod | null>(null);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);

  // Computed fees and totals
  const numAmount = parseFloat(amountUsd) || 0;
  
  const estimatedFee = useMemo(() => {
    if (methodCategory === 'crypto') {
      return selectedNetwork ? (selectedNetwork.averageFee ?? 1.0) : 1.0;
    }
    if (methodCategory === 'upi') return 0.0; // Free UPI payout
    if (methodCategory === 'bank') return 0.0; // Free IMPS/NEFT payout
    return 0.0;
  }, [methodCategory, selectedNetwork]);

  const netReceiveAmount = Math.max(0, numAmount - estimatedFee);

  const minLimitUsd = useMemo(() => {
    if (withdrawalSettings?.minWithdraw) return withdrawalSettings.minWithdraw;
    if (methodCategory === 'crypto' && selectedNetwork) return selectedNetwork.minWithdraw;
    return 10;
  }, [withdrawalSettings, methodCategory, selectedNetwork]);

  const maxLimitUsd = useMemo(() => {
    if (withdrawalSettings?.maxWithdraw) return withdrawalSettings.maxWithdraw;
    if (methodCategory === 'crypto' && selectedNetwork) return selectedNetwork.maxWithdraw;
    return 10000;
  }, [withdrawalSettings, methodCategory, selectedNetwork]);

  // Handle Quick Amount Percentage
  const handleSetPercentageAmount = (pct: number) => {
    playSound('CLICK');
    const bal = currentPlayer.balance || 0;
    const calc = Math.min(maxLimitUsd, Math.max(0, (bal * pct) / 100));
    setAmountUsd(calc.toFixed(2));
  };

  // Saved Method Selection
  const handleSelectSavedMethod = (method: SavedWithdrawalMethod) => {
    playSound('CLICK');
    setMethodCategory(method.type);
    if (method.type === 'crypto') {
      if (method.networkId) setSelectedCryptoNetworkId(method.networkId);
      if (method.walletAddress) setCryptoAddress(method.walletAddress);
    } else if (method.type === 'upi') {
      if (method.upiId) setUpiId(method.upiId);
    } else if (method.type === 'bank') {
      if (method.accountHolder) setBankAccountHolder(method.accountHolder);
      if (method.accountNumber) {
        setBankAccountNumber(method.accountNumber);
        setConfirmBankAccountNumber(method.accountNumber);
      }
      if (method.ifsc) setBankIfsc(method.ifsc);
      if (method.bankName) setBankName(method.bankName);
    }
    setShowSavedMethodDrawer(false);
  };

  // Toggle Default Saved Method
  const handleToggleDefaultSavedMethod = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playSound('CLICK');
    const updated = savedMethods.map(m => ({
      ...m,
      isDefault: m.id === id
    }));
    updateSavedMethods(updated);
  };

  // Delete Saved Method
  const handleDeleteSavedMethod = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playSound('CLICK');
    const updated = savedMethods.filter(m => m.id !== id);
    updateSavedMethods(updated);
  };

  // Validate form inputs prior to confirmation
  const validateForm = (): boolean => {
    setErrorMessage(null);

    // 1. Check Amount
    if (!amountUsd || isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage("Please enter a valid withdrawal amount.");
      return false;
    }
    if (numAmount < minLimitUsd) {
      setErrorMessage(`Minimum withdrawal amount is ${minLimitUsd} USDT.`);
      return false;
    }
    if (numAmount > maxLimitUsd) {
      setErrorMessage(`Maximum withdrawal amount is ${maxLimitUsd} USDT.`);
      return false;
    }
    if (numAmount > (currentPlayer.balance || 0)) {
      setErrorMessage("Insufficient wallet balance for this withdrawal.");
      return false;
    }

    // 2. Validate Category Specific Fields
    if (methodCategory === 'crypto') {
      if (!cryptoAddress.trim()) {
        setErrorMessage("Please enter your crypto wallet destination address.");
        return false;
      }
      if (!validateCryptoAddress(cryptoAddress, selectedCryptoNetworkId)) {
        setErrorMessage(`Invalid ${selectedNetwork?.name || 'crypto'} wallet address format.`);
        return false;
      }
    } else if (methodCategory === 'upi') {
      const v = validateUpiFormat(upiId);
      if (!v.isValid) {
        setErrorMessage(v.error || "Invalid UPI ID format.");
        return false;
      }
    } else if (methodCategory === 'bank') {
      const v = validateBankDetails(bankAccountHolder, bankAccountNumber, confirmBankAccountNumber, bankIfsc);
      if (!v.isValid) {
        setErrorMessage(v.error || "Invalid bank details.");
        return false;
      }
    }

    return true;
  };

  // Initiate confirmation
  const handleProceedToConfirmation = () => {
    playSound('CLICK');
    if (validateForm()) {
      setShowConfirmModal(true);
    }
  };

  // Final Submit Action
  const handleConfirmSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    playSound('CLICK');

    try {
      let networkIdString = '';
      let destinationDetailString = '';
      let methodTypeString = '';

      if (methodCategory === 'crypto') {
        networkIdString = selectedCryptoNetworkId;
        destinationDetailString = cryptoAddress.trim();
        methodTypeString = `Crypto ${selectedNetwork?.name || 'USDT'}`;
      } else if (methodCategory === 'upi') {
        networkIdString = 'UPI';
        destinationDetailString = upiId.trim();
        methodTypeString = 'UPI Transfer';
      } else if (methodCategory === 'bank') {
        networkIdString = 'BANK';
        const bankPayload = {
          accountHolder: bankAccountHolder.trim(),
          accountNumber: bankAccountNumber.trim(),
          ifsc: bankIfsc.trim().toUpperCase(),
          bankName: bankName.trim() || lookupBankFromIFSC(bankIfsc) || 'Bank'
        };
        destinationDetailString = JSON.stringify(bankPayload);
        methodTypeString = `Bank Transfer (${bankPayload.bankName})`;
      }

      const currRate = rates[preferredCurrency] || 1;
      const prefAmt = numAmount * currRate;

      // Execute onWithdraw
      await onWithdraw(
        numAmount,
        networkIdString,
        destinationDetailString,
        estimatedFee,
        preferredCurrency,
        currRate,
        prefAmt
      );

      // Save Method if checked
      if (saveMethodChecked) {
        const label = savedMethodLabel.trim() || (
          methodCategory === 'crypto' ? `${selectedNetwork?.name || 'Crypto'} Wallet` :
          methodCategory === 'upi' ? `UPI (${maskUpiId(upiId)})` :
          `${bankName || 'Bank'} (${maskBankAccountNumber(bankAccountNumber)})`
        );

        const newSaved: SavedWithdrawalMethod = {
          id: 'sm-' + Math.random().toString(36).substr(2, 8),
          type: methodCategory,
          label,
          isDefault: savedMethods.length === 0,
          networkId: selectedCryptoNetworkId,
          walletAddress: cryptoAddress.trim(),
          upiId: upiId.trim(),
          accountHolder: bankAccountHolder.trim(),
          accountNumber: bankAccountNumber.trim(),
          ifsc: bankIfsc.trim().toUpperCase(),
          bankName: bankName.trim(),
          createdAt: Date.now()
        };

        const existingFiltered = savedMethods.filter(m => {
          if (methodCategory === 'crypto') return m.walletAddress !== cryptoAddress.trim();
          if (methodCategory === 'upi') return m.upiId !== upiId.trim();
          if (methodCategory === 'bank') return m.accountNumber !== bankAccountNumber.trim();
          return true;
        });

        updateSavedMethods([newSaved, ...existingFiltered]);
      }

      playSound('WIN');
      setShowConfirmModal(false);
      setSuccessMessage("Withdrawal request submitted successfully!");
      setAmountUsd('');
      
    } catch (err: any) {
      console.error("Submission failed:", err);
      playSound('LOSE');
      setErrorMessage(err.message || "Failed to submit withdrawal request.");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter History List
  const filteredHistory = useMemo(() => {
    return (withdrawalsHistory || []).filter(item => {
      // 1. Search filter
      const searchLower = (historySearch || '').toLowerCase();
      const matchSearch = !historySearch || 
        (item.id || '').toLowerCase().includes(searchLower) ||
        (item.walletAddress || item.details || '').toLowerCase().includes(searchLower) ||
        (item.blockchain || item.method || '').toLowerCase().includes(searchLower);

      // 2. Status filter
      const matchStatus = historyFilterStatus === 'all' || item.status === historyFilterStatus;

      // 3. Category filter
      let matchCat = true;
      if (historyFilterCategory !== 'all') {
        const methodUpper = (item.method || item.blockchain || '').toUpperCase();
        if (historyFilterCategory === 'crypto') {
          matchCat = !methodUpper.includes('UPI') && !methodUpper.includes('BANK');
        } else if (historyFilterCategory === 'upi') {
          matchCat = methodUpper.includes('UPI');
        } else if (historyFilterCategory === 'bank') {
          matchCat = methodUpper.includes('BANK');
        }
      }

      return matchSearch && matchStatus && matchCat;
    });
  }, [withdrawalsHistory, historySearch, historyFilterStatus, historyFilterCategory]);

  return (
    <div className="w-full max-w-full bg-black text-zinc-100 p-1.5 sm:p-3 md:p-4 font-sans selection:bg-amber-500/30 selection:text-amber-200 overflow-x-hidden box-border">
      <div className="max-w-3xl mx-auto space-y-3 sm:space-y-4 w-full min-w-0 box-border overflow-hidden">
        
        {/* TOP BAR & BALANCE DISPLAY */}
        <div className="relative overflow-hidden bg-gradient-to-r from-zinc-950 via-zinc-900 to-black border border-amber-500/30 rounded-2xl p-2.5 sm:p-3.5 shadow-2xl backdrop-blur-2xl min-w-0 w-full box-border">
          {/* Background Glows */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-gradient-to-br from-red-600/15 via-amber-500/10 to-transparent blur-3xl rounded-full pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-gradient-to-tr from-amber-500/10 via-red-600/10 to-transparent blur-3xl rounded-full pointer-events-none" />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 min-w-0 w-full">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => { playSound('CLICK'); onBack(); }}
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-amber-400 transition-all border border-zinc-800 hover:border-amber-500/40 shadow-inner group shrink-0 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 sm:w-4.5 sm:h-4.5 group-hover:-translate-x-0.5 transition-transform" />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h1 className="text-base sm:text-xl font-black bg-gradient-to-r from-amber-200 via-amber-400 via-red-300 to-amber-100 bg-clip-text text-transparent tracking-tight truncate">
                    Withdrawal Center
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-gradient-to-r from-amber-500/10 to-red-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1 shadow-sm shrink-0">
                    <Sparkles className="w-2.5 h-2.5 text-red-400" /> Instant Payouts
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-zinc-400 mt-0.5 font-medium truncate">
                  Fast, secure, and encrypted multi-currency payouts
                </p>
              </div>
            </div>

            {/* BALANCE DISPLAY WITH COMPACT CURRENCY SHORTCUT */}
            <div className="flex items-center justify-between sm:justify-end gap-2 bg-zinc-950/90 px-3 py-1.5 rounded-xl border border-amber-500/30 shadow-inner shrink-0 relative min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <Wallet className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider shrink-0">Balance</span>
              </div>
              
              <div className="relative inline-flex items-center gap-1 shrink-0">
                <span className="text-xs sm:text-sm md:text-base font-black text-amber-400 font-mono tracking-tight">
                  {getCurrencySymbol(activeCurrency)} {formatCurrencyValue(currentPlayer.balance || 0, activeCurrency, rates)}
                </span>
                
                <button
                  type="button"
                  onClick={() => { playSound('CLICK'); setCurrencyDropdownOpen(!currencyDropdownOpen); }}
                  className="p-0.5 hover:bg-zinc-800/80 text-amber-400 rounded transition-colors cursor-pointer flex items-center justify-center"
                  title="Select Currency"
                >
                  <span className="text-[10px] text-amber-400 leading-none">▼</span>
                </button>

                {currencyDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setCurrencyDropdownOpen(false)} 
                    />
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-36 bg-zinc-950 border border-amber-500/40 rounded-xl shadow-2xl p-1 overflow-hidden backdrop-blur-xl">
                      <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                        Select Currency
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y divide-zinc-800/40">
                        {[
                          { code: 'INR', symbol: '₹' },
                          { code: 'USD', symbol: '$' },
                          { code: 'AED', symbol: 'د.إ' },
                          { code: 'USDT', symbol: '₮' },
                          { code: 'EUR', symbol: '€' },
                          { code: 'GBP', symbol: '£' },
                          { code: 'PKR', symbol: '₨' },
                          { code: 'CAD', symbol: 'C$' }
                        ].map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => {
                              playSound('CLICK');
                              setActiveCurrency(c.code);
                              setCurrencyDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1 text-xs rounded-lg transition-colors text-left cursor-pointer ${
                              activeCurrency === c.code 
                                ? 'bg-amber-500/20 text-amber-300 font-bold' 
                                : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                            }`}
                          >
                            <span className="font-mono">{c.code} <span className="text-zinc-400 font-sans">({c.symbol})</span></span>
                            {activeCurrency === c.code && <Check className="w-3 h-3 text-amber-400" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* NOTIFICATIONS & BANNERS */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 flex items-center justify-between gap-2 shadow-lg text-xs min-w-0 w-full box-border"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="font-semibold truncate">{errorMessage}</span>
              </div>
              <button 
                type="button"
                onClick={() => setErrorMessage(null)} 
                className="text-red-400 hover:text-white p-1 transition-colors shrink-0"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {successMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 flex items-center justify-between gap-2 shadow-lg text-xs min-w-0 w-full box-border"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-semibold truncate">{successMessage}</span>
              </div>
              <button 
                type="button"
                onClick={() => setSuccessMessage(null)} 
                className="text-amber-400 hover:text-white p-1 transition-colors shrink-0"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MAIN WORKFLOW GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 min-w-0 w-full box-border">
          
          {/* LEFT 7 COLS: METHOD SELECTOR & INPUT FORM */}
          <div className="lg:col-span-7 space-y-3 sm:space-y-4 min-w-0 w-full box-border">
            
            {/* 1. METHOD CATEGORY CARDS */}
            <div className="bg-zinc-950/90 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-3 sm:p-4 backdrop-blur-xl space-y-2.5 shadow-xl min-w-0 w-full box-border">
              <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5 truncate">
                  <Coins className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  Select Method
                </span>

                {/* Quick Saved Methods button */}
                <button
                  type="button"
                  onClick={() => { playSound('CLICK'); setShowSavedMethodDrawer(true); }}
                  className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] sm:text-xs font-bold flex items-center gap-1 transition-all shadow-sm shrink-0 cursor-pointer"
                >
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                  Saved ({savedMethods.length})
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 min-w-0 w-full">
                {/* CRYPTO TAB */}
                <button
                  type="button"
                  onClick={() => { playSound('CLICK'); setMethodCategory('crypto'); setErrorMessage(null); }}
                  className={`p-2 rounded-xl border flex flex-col items-center justify-center text-center gap-1 transition-all relative overflow-hidden min-w-0 w-full box-border cursor-pointer ${
                    methodCategory === 'crypto'
                      ? 'bg-gradient-to-b from-amber-500/20 via-zinc-900 to-zinc-950 border-amber-500/80 text-white shadow-lg shadow-amber-500/10'
                      : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <div className={`p-1 rounded-lg shrink-0 ${methodCategory === 'crypto' ? 'bg-amber-500 text-black shadow-md' : 'bg-zinc-800 text-zinc-300'}`}>
                    <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <div className="min-w-0 w-full">
                    <span className="text-xs font-extrabold block truncate">Crypto</span>
                    <span className="text-[9px] text-zinc-400 font-medium hidden sm:block truncate">USDT</span>
                  </div>
                  {methodCategory === 'crypto' && (
                    <motion.div layoutId="activeMethodTab" className="absolute bottom-0 inset-x-0 h-0.5 bg-gradient-to-r from-amber-400 to-red-500" />
                  )}
                </button>

                {/* UPI TAB */}
                <button
                  type="button"
                  onClick={() => { playSound('CLICK'); setMethodCategory('upi'); setErrorMessage(null); }}
                  className={`p-2 rounded-xl border flex flex-col items-center justify-center text-center gap-1 transition-all relative overflow-hidden min-w-0 w-full box-border cursor-pointer ${
                    methodCategory === 'upi'
                      ? 'bg-gradient-to-b from-red-500/20 via-zinc-900 to-zinc-950 border-red-500/80 text-white shadow-lg shadow-red-500/10'
                      : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <div className={`p-1 rounded-lg shrink-0 ${methodCategory === 'upi' ? 'bg-red-600 text-white shadow-md' : 'bg-zinc-800 text-zinc-300'}`}>
                    <QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <div className="min-w-0 w-full">
                    <span className="text-xs font-extrabold block truncate">UPI</span>
                    <span className="text-[9px] text-zinc-400 font-medium hidden sm:block truncate">Instant</span>
                  </div>
                  {methodCategory === 'upi' && (
                    <motion.div layoutId="activeMethodTab" className="absolute bottom-0 inset-x-0 h-0.5 bg-gradient-to-r from-red-500 to-amber-400" />
                  )}
                </button>

                {/* BANK TAB */}
                <button
                  type="button"
                  onClick={() => { playSound('CLICK'); setMethodCategory('bank'); setErrorMessage(null); }}
                  className={`p-2 rounded-xl border flex flex-col items-center justify-center text-center gap-1 transition-all relative overflow-hidden min-w-0 w-full box-border cursor-pointer ${
                    methodCategory === 'bank'
                      ? 'bg-gradient-to-b from-amber-600/20 via-zinc-900 to-zinc-950 border-amber-600/80 text-white shadow-lg shadow-amber-600/10'
                      : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <div className={`p-1 rounded-lg shrink-0 ${methodCategory === 'bank' ? 'bg-amber-600 text-black shadow-md' : 'bg-zinc-800 text-zinc-300'}`}>
                    <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <div className="min-w-0 w-full">
                    <span className="text-xs font-extrabold block truncate">Bank Wire</span>
                    <span className="text-[9px] text-zinc-400 font-medium hidden sm:block truncate">IMPS / NEFT</span>
                  </div>
                  {methodCategory === 'bank' && (
                    <motion.div layoutId="activeMethodTab" className="absolute bottom-0 inset-x-0 h-0.5 bg-gradient-to-r from-amber-500 to-amber-300" />
                  )}
                </button>
              </div>
            </div>

            {/* 2. SPECIFIC METHOD DETAILS FORM */}
            <div className="bg-zinc-950/90 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-3 sm:p-4 backdrop-blur-xl space-y-3 shadow-xl min-w-0 w-full box-border">
              
              {/* CATEGORY A: CRYPTO WITHDRAWAL */}
              {methodCategory === 'crypto' && (
                <div className="space-y-3 min-w-0 w-full box-border">
                  <div>
                    <label className="text-[10px] sm:text-xs uppercase tracking-wider text-zinc-400 font-bold block mb-1.5 truncate">
                      Select Blockchain Network
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 min-w-0 w-full">
                      {activeNetworks.map((net) => (
                        <button
                          key={net.id}
                          type="button"
                          onClick={() => { playSound('CLICK'); setSelectedCryptoNetworkId(net.id); }}
                          className={`p-2 rounded-xl border text-left flex items-center justify-between transition-all min-w-0 w-full box-border cursor-pointer ${
                            selectedCryptoNetworkId === net.id
                              ? 'bg-amber-500/10 border-amber-500/80 text-white shadow-md'
                              : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-bold block text-zinc-200 truncate">{net.name}</span>
                            <span className="text-[10px] text-zinc-400 font-mono block truncate">Fee: {net.averageFee ?? 1.0} USDT</span>
                          </div>
                          {selectedCryptoNetworkId === net.id && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-1" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1 min-w-0 w-full">
                      <label className="text-[10px] sm:text-xs uppercase tracking-wider text-zinc-400 font-bold block truncate">
                        Destination Address
                      </label>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText();
                            if (text) setCryptoAddress(text.trim());
                          } catch (e) {}
                        }}
                        className="text-[10px] text-amber-400 hover:text-amber-300 font-bold hover:underline shrink-0 cursor-pointer"
                      >
                        Paste
                      </button>
                    </div>
                    <div className="relative w-full min-w-0 box-border">
                      <input
                        type="text"
                        value={cryptoAddress}
                        onChange={(e) => setCryptoAddress(e.target.value)}
                        placeholder={`Enter ${selectedNetwork?.name || 'Crypto'} address`}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/80 transition-colors box-border"
                      />
                      {cryptoAddress && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                          {validateCryptoAddress(cryptoAddress, selectedCryptoNetworkId) ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-bold flex items-center gap-1">
                              <Check className="w-2.5 h-2.5" /> Valid
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 text-[9px] font-bold">
                              Invalid
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* CATEGORY B: UPI WITHDRAWAL */}
              {methodCategory === 'upi' && (
                <div className="space-y-3 min-w-0 w-full box-border">
                  <div className="bg-gradient-to-r from-red-950/40 to-zinc-950 border border-red-500/30 rounded-xl p-2.5 flex items-center gap-2 min-w-0 w-full box-border">
                    <QrCode className="w-4 h-4 text-red-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-red-200 block truncate">Instant UPI Payouts</span>
                      <span className="text-[10px] text-zinc-400 block truncate">Google Pay, PhonePe, Paytm, BHIM VPAs</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] sm:text-xs uppercase tracking-wider text-zinc-400 font-bold block mb-1 truncate">
                      UPI ID (VPA)
                    </label>
                    <input
                      type="text"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="e.g. username@okaxis or mobile@paytm"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-red-500/80 transition-colors box-border"
                    />
                  </div>
                </div>
              )}

              {/* CATEGORY C: BANK ACCOUNT WITHDRAWAL */}
              {methodCategory === 'bank' && (
                <div className="space-y-3 min-w-0 w-full box-border">
                  <div className="bg-gradient-to-r from-amber-950/40 to-zinc-950 border border-amber-500/30 rounded-xl p-2.5 flex items-center gap-2 min-w-0 w-full box-border">
                    <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-amber-200 block truncate">Bank Transfer</span>
                      <span className="text-[10px] text-zinc-400 block truncate">IMPS / NEFT directly to account</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-w-0 w-full">
                    <div>
                      <label className="text-[10px] sm:text-xs uppercase tracking-wider text-zinc-400 font-bold block mb-1 truncate">
                        Account Holder Name
                      </label>
                      <input
                        type="text"
                        value={bankAccountHolder}
                        onChange={(e) => setBankAccountHolder(e.target.value)}
                        placeholder="Name on Passbook"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/80 box-border"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] sm:text-xs uppercase tracking-wider text-zinc-400 font-bold block mb-1 truncate">
                        IFSC Code
                      </label>
                      <input
                        type="text"
                        value={bankIfsc}
                        onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                        placeholder="e.g. SBIN0001234"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/80 uppercase box-border"
                      />
                    </div>
                  </div>

                  {bankName && (
                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 font-bold flex items-center gap-1.5 min-w-0 w-full box-border">
                      <Building2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="shrink-0">Detected:</span> <span className="text-white truncate flex-1">{bankName}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-w-0 w-full">
                    <div>
                      <label className="text-[10px] sm:text-xs uppercase tracking-wider text-zinc-400 font-bold block mb-1 truncate">
                        Account Number
                      </label>
                      <input
                        type="password"
                        value={bankAccountNumber}
                        onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, ''))}
                        placeholder="Account Number"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/80 box-border"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] sm:text-xs uppercase tracking-wider text-zinc-400 font-bold block mb-1 truncate">
                        Confirm Account Number
                      </label>
                      <input
                        type="text"
                        value={confirmBankAccountNumber}
                        onChange={(e) => setConfirmBankAccountNumber(e.target.value.replace(/\D/g, ''))}
                        placeholder="Re-enter Number"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/80 box-border"
                      />
                    </div>
                  </div>

                  {bankAccountNumber && confirmBankAccountNumber && (
                    <div className="text-[10px] font-bold min-w-0">
                      {bankAccountNumber === confirmBankAccountNumber ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3 shrink-0" /> Account numbers match
                        </span>
                      ) : (
                        <span className="text-red-400">
                          Account numbers do not match
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* SAVE METHOD OPTION CHECKBOX */}
              <div className="pt-2 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2 min-w-0 w-full">
                <label className="flex items-center gap-2 cursor-pointer select-none min-w-0">
                  <input
                    type="checkbox"
                    checked={saveMethodChecked}
                    onChange={(e) => setSaveMethodChecked(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500/40 shrink-0"
                  />
                  <span className="text-[10px] sm:text-xs text-zinc-300 font-medium truncate">
                    Save for 1-tap payouts
                  </span>
                </label>

                {saveMethodChecked && (
                  <input
                    type="text"
                    value={savedMethodLabel}
                    onChange={(e) => setSavedMethodLabel(e.target.value)}
                    placeholder="Custom Label (Optional)"
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-[10px] text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700 w-32 sm:w-40 box-border"
                  />
                )}
              </div>

            </div>

          </div>

          {/* RIGHT 5 COLS: AMOUNT & CALCULATION SUMMARY */}
          <div className="lg:col-span-5 space-y-3 sm:space-y-4 min-w-0 w-full box-border">
            <div className="bg-zinc-950/90 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-3 sm:p-4 backdrop-blur-xl space-y-3 shadow-xl min-w-0 w-full box-border">
              <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5 truncate">
                <Sparkles className="w-4 h-4 text-red-500 shrink-0" />
                Withdrawal Amount
              </span>

              {/* AMOUNT INPUT FIELD */}
              <div className="w-full min-w-0">
                <div className="flex items-center justify-between mb-1 min-w-0 w-full">
                  <span className="text-xs text-zinc-400 font-bold truncate">Enter Amount (USDT)</span>
                  <span className="text-[10px] text-zinc-400 font-mono shrink-0">
                    Limits: ${minLimitUsd}-${maxLimitUsd}
                  </span>
                </div>
                <div className="relative w-full min-w-0 box-border">
                  <input
                    type="number"
                    value={amountUsd}
                    onChange={(e) => setAmountUsd(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-3 pr-12 py-2 text-base sm:text-lg font-black text-amber-400 placeholder-zinc-700 focus:outline-none focus:border-amber-500/80 font-mono tracking-tight box-border"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 pointer-events-none">
                    USDT
                  </span>
                </div>

                {/* QUICK PERCENTAGE BUTTONS */}
                <div className="grid grid-cols-4 gap-1 mt-2 min-w-0 w-full">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handleSetPercentageAmount(pct)}
                      className="py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/40 text-[11px] font-bold text-zinc-300 hover:text-amber-400 transition-all cursor-pointer w-full"
                    >
                      {pct === 100 ? 'MAX' : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* BREAKDOWN CARD */}
              <div className="bg-black/90 border border-zinc-800/90 rounded-xl p-2.5 sm:p-3 space-y-2 min-w-0 w-full box-border">
                <div className="flex items-center justify-between text-xs text-zinc-400 min-w-0">
                  <span className="truncate">Requested Amount</span>
                  <span className="font-mono text-zinc-200 font-bold shrink-0">${numAmount.toFixed(2)} USDT</span>
                </div>

                {preferredCurrency !== 'USD' && (
                  <div className="flex items-center justify-between text-xs text-zinc-400 min-w-0">
                    <span className="truncate">Equivalent ({preferredCurrency})</span>
                    <span className="font-mono text-zinc-300 font-bold shrink-0">
                      {getCurrencySymbol(preferredCurrency)} {formatCurrencyValue(numAmount, preferredCurrency, rates)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-zinc-400 min-w-0">
                  <span className="truncate">Estimated Fee</span>
                  <span className="font-mono text-amber-400 font-bold shrink-0">
                    {estimatedFee === 0 ? 'FREE' : `${estimatedFee.toFixed(2)} USDT`}
                  </span>
                </div>

                <div className="pt-2 border-t border-zinc-800 flex items-center justify-between min-w-0">
                  <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider truncate">
                    Net Receive Amount
                  </span>
                  <span className="text-sm sm:text-base font-black text-amber-400 font-mono shrink-0">
                    ${netReceiveAmount.toFixed(2)} USDT
                  </span>
                </div>
              </div>

              {/* PROCEED BUTTON */}
              <button
                type="button"
                onClick={handleProceedToConfirmation}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-red-600 to-amber-500 hover:from-amber-400 hover:via-red-500 hover:to-amber-400 text-black font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-lg shadow-red-600/20 active:scale-[0.99] border border-amber-400/30 flex items-center justify-center gap-2 cursor-pointer box-border"
              >
                Request Withdrawal <ArrowRight className="w-4 h-4 shrink-0" />
              </button>

              <div className="flex items-center justify-center gap-1 text-[10px] text-zinc-400 font-medium text-center min-w-0">
                <Shield className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="truncate">Protected by 256-bit automated encryption</span>
              </div>
            </div>
          </div>

        </div>

        {/* SAVED METHODS DRAWER / MODAL */}
        <AnimatePresence>
          {showSavedMethodDrawer && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-zinc-950 border border-amber-500/30 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl relative"
              >
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                    <h3 className="text-lg font-extrabold text-white">Saved Withdrawal Methods</h3>
                  </div>
                  <button 
                    onClick={() => setShowSavedMethodDrawer(false)}
                    className="text-zinc-400 hover:text-white p-1 rounded-lg"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                {savedMethods.length === 0 ? (
                  <div className="text-center py-8 text-zinc-400 space-y-2">
                    <Wallet className="w-10 h-10 mx-auto text-zinc-600 stroke-[1.5]" />
                    <p className="text-sm font-semibold">No saved withdrawal methods found.</p>
                    <p className="text-xs text-zinc-500">Save a method during your next withdrawal for quick 1-tap payouts.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                    {savedMethods.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => handleSelectSavedMethod(m)}
                        className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-amber-500/50 cursor-pointer transition-all flex items-center justify-between gap-3 group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2.5 rounded-lg shrink-0 ${
                            m.type === 'crypto' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                            m.type === 'upi' ? 'bg-red-500/10 text-red-400 border border-red-500/30' :
                            'bg-amber-600/10 text-amber-500 border border-amber-600/30'
                          }`}>
                            {m.type === 'crypto' && <Coins className="w-4 h-4" />}
                            {m.type === 'upi' && <QrCode className="w-4 h-4" />}
                            {m.type === 'bank' && <Building2 className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                                {m.label}
                              </span>
                              {m.isDefault && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                                  Default
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-mono text-zinc-400 block mt-0.5 truncate">
                              {m.type === 'crypto' && maskCryptoAddress(m.walletAddress || '')}
                              {m.type === 'upi' && maskUpiId(m.upiId || '')}
                              {m.type === 'bank' && `${m.bankName || 'Bank'} (${maskBankAccountNumber(m.accountNumber || '')})`}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            title={m.isDefault ? "Default Method" : "Set as Default"}
                            onClick={(e) => handleToggleDefaultSavedMethod(m.id, e)}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              m.isDefault 
                                ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' 
                                : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-amber-400'
                            }`}
                          >
                            <Star className={`w-3.5 h-3.5 ${m.isDefault ? 'fill-amber-400' : ''}`} />
                          </button>

                          <button
                            title="Delete Saved Method"
                            onClick={(e) => handleDeleteSavedMethod(m.id, e)}
                            className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CONFIRMATION MODAL */}
        <AnimatePresence>
          {showConfirmModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-zinc-950 border border-amber-500/30 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative"
              >
                <div className="text-center space-y-1">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-3">
                    <Shield className="w-6 h-6 text-red-500" />
                  </div>
                  <h3 className="text-xl font-black text-white">Confirm Withdrawal</h3>
                  <p className="text-xs text-zinc-400">Please review your payout details before authorizing.</p>
                </div>

                <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 space-y-3 text-xs">
                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Method Category</span>
                    <span className="font-bold text-white uppercase">{methodCategory}</span>
                  </div>

                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Destination</span>
                    <span className="font-mono text-amber-300 font-semibold truncate max-w-[200px]">
                      {methodCategory === 'crypto' && maskCryptoAddress(cryptoAddress)}
                      {methodCategory === 'upi' && maskUpiId(upiId)}
                      {methodCategory === 'bank' && `${bankName || 'Bank'} (${maskBankAccountNumber(bankAccountNumber)})`}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Gross Amount</span>
                    <span className="font-mono text-white font-semibold">${numAmount.toFixed(2)} USDT</span>
                  </div>

                  <div className="flex justify-between items-center text-zinc-400">
                    <span>Processing Fee</span>
                    <span className="font-mono text-amber-400 font-semibold">${estimatedFee.toFixed(2)} USDT</span>
                  </div>

                  <div className="pt-2 border-t border-zinc-800 flex justify-between items-center">
                    <span className="font-bold text-zinc-200">Net Receive Amount</span>
                    <span className="text-base font-black text-amber-400 font-mono">${netReceiveAmount.toFixed(2)} USDT</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs uppercase transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleConfirmSubmit}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 via-red-600 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-black font-black text-xs uppercase transition-all shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-black" /> Processing...
                      </>
                    ) : (
                      'Authorize Payout'
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* WITHDRAWAL HISTORY SECTION */}
        <div className="bg-zinc-950/90 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-3.5 sm:p-5 backdrop-blur-xl space-y-3.5 shadow-xl overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <Clock className="w-4.5 h-4.5 text-amber-400 shrink-0" />
              <h2 className="text-base sm:text-lg font-black text-white">Withdrawal History</h2>
            </div>

            {/* FILTERS & SEARCH */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 sm:flex-initial min-w-[130px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search Tx ID / Address..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 font-mono"
                />
              </div>

              <select
                value={historyFilterCategory}
                onChange={(e) => setHistoryFilterCategory(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500/50 flex-1 sm:flex-initial"
              >
                <option value="all">All Methods</option>
                <option value="crypto">Crypto</option>
                <option value="upi">UPI</option>
                <option value="bank">Bank</option>
              </select>

              <select
                value={historyFilterStatus}
                onChange={(e) => setHistoryFilterStatus(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500/50 flex-1 sm:flex-initial"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {/* TABLE / CARD LIST */}
          {filteredHistory.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 space-y-1.5 border border-dashed border-zinc-800 rounded-xl">
              <Activity className="w-7 h-7 mx-auto text-zinc-600 stroke-[1.5]" />
              <p className="text-xs font-semibold">No withdrawal history matching your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto w-full rounded-xl border border-zinc-800/80">
              <table className="w-full text-left text-xs border-collapse min-w-[560px]">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 font-bold uppercase tracking-wider bg-zinc-900/50">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">ID / Method</th>
                    <th className="py-2.5 px-3">Destination</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Explorer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-medium">
                  {filteredHistory.map((item, idx) => {
                    const maskedDest = formatMaskedDestination(item.details || item.walletAddress || '', item.method, item.blockchain);
                    return (
                      <tr key={item.id || `wd-hist-${idx}`} className="hover:bg-zinc-900/60 transition-colors">
                        <td className="py-2.5 px-3 text-zinc-400 whitespace-nowrap">
                          {new Date(item.timestamp || item.createdAt || Date.now()).toLocaleDateString()}
                          <span className="block text-[10px] text-zinc-500 font-mono">
                            {new Date(item.timestamp || item.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="font-mono text-zinc-200 font-bold block">{item.id}</span>
                          <span className="text-[10px] text-amber-400/90 font-bold">{item.blockchain || item.method || 'Crypto'}</span>
                        </td>

                        <td className="py-2.5 px-3 font-mono text-zinc-300">
                          {maskedDest}
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap font-mono font-bold text-amber-400">
                          ${item.amount.toFixed(2)} USDT
                        </td>

                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                            item.status === 'processing' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                            item.status === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                            'bg-red-500/10 text-red-400 border-red-500/30'
                          }`}>
                            {item.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                            {item.status === 'processing' && <RefreshCw className="w-3 h-3 animate-spin" />}
                            {item.status === 'pending' && <Clock className="w-3 h-3" />}
                            {item.status}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {item.transactionHash && item.transactionHash !== 'Manual Override' ? (
                            <a
                              href={getBlockExplorerUrl(item.transactionHash, item.blockchain)}
                              target="_blank"
                              referrerPolicy="no-referrer"
                              rel="noopener noreferrer"
                              className="text-amber-400 hover:text-amber-300 font-bold inline-flex items-center gap-1 hover:underline"
                            >
                              Tx Hash <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
});
