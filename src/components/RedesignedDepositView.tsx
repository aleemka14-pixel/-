import React, { useState, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Check, Clock, Sparkles, 
  CheckCircle2, Shield, HelpCircle, RefreshCw,
  Wallet, ArrowUpRight, ExternalLink, Info,
  ShieldAlert, X, DollarSign, CheckCircle,
  CreditCard, Smartphone, ShieldCheck
} from 'lucide-react';
import { DepositRequest, Player, PaymentSettings } from '../types.ts';

interface RedesignedDepositViewProps {
  currentPlayer?: Player;
  deposits?: DepositRequest[];
  paymentSettings?: PaymentSettings;
  onBack: () => void;
  onDeposit?: (
    amount: number, 
    method: string, 
    details: string
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

export const RedesignedDepositView = memo(function RedesignedDepositView({
  currentPlayer,
  deposits = [],
  paymentSettings,
  onBack,
  preferredCurrency,
  rates,
  playSound
}: RedesignedDepositViewProps) {

  const [sunpayAmount, setSunpayAmount] = useState<string>('500');
  const [isCreatingSunpay, setIsCreatingSunpay] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [selectedTxForModal, setSelectedTxForModal] = useState<DepositRequest | null>(null);

  // Quick Amount Presets in INR
  const presets = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000];

  // Toast Notification Handler
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Convert and format currency displays
  const availableBalanceFormatted = useMemo(() => {
    const bal = Number(currentPlayer?.walletBalance ?? currentPlayer?.balance ?? 0);
    return `₹${bal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }, [currentPlayer]);

  // Player's deposit history filtered
  const userDeposits = useMemo(() => {
    if (!currentPlayer?.id) return deposits;
    return deposits.filter(d => 
      d.userId === currentPlayer.id || d.playerId === currentPlayer.id
    ).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [deposits, currentPlayer]);

  // Initiate Sunpay Payment Order & Immediate Checkout Redirect
  const handlePayWithSunpay = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const numAmt = Number(sunpayAmount);
    if (!sunpayAmount || isNaN(numAmt) || numAmt < 100) {
      showToast("Minimum deposit amount is ₹100.", "error");
      return;
    }
    if (numAmt > 100000) {
      showToast("Maximum deposit amount per transaction is ₹1,00,000.", "error");
      return;
    }

    setIsCreatingSunpay(true);
    playSound('CLICK');

    try {
      const response = await fetch('/api/create-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentPlayer?.id || 'guest',
          amount: numAmt,
          currency: 'INR',
          provider: 'sunpay'
        })
      });

      const data = await response.json();

      if (response.ok && data.success && data.paymentUrl) {
        showToast("Redirecting to Sunpay checkout page...", "success");
        // Immediate checkout redirect
        window.location.href = data.paymentUrl;
      } else {
        throw new Error(data.error || "Failed to initialize Sunpay payment order.");
      }
    } catch (err: any) {
      console.error("Sunpay payment initiation failed:", err);
      showToast(err.message || "Unable to initiate payment with Sunpay. Please try again.", "error");
      setIsCreatingSunpay(false);
    }
  };

  return (
    <div id="redesigned-deposit-view" className="w-full max-w-7xl mx-auto space-y-6 pb-12 px-3 sm:px-6">
      
      {/* TOAST OVERLAY */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              className={`pointer-events-auto p-4 rounded-xl border shadow-2xl flex items-center gap-3 text-white ${
                t.type === 'success' 
                  ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200' 
                  : t.type === 'error'
                  ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                  : 'bg-slate-900/90 border-slate-700 text-slate-200'
              }`}
            >
              {t.type === 'success' ? (
                <CheckCircle className="w-5 h-5 shrink-0 text-emerald-400" />
              ) : t.type === 'error' ? (
                <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400" />
              ) : (
                <Info className="w-5 h-5 shrink-0 text-blue-400" />
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
            className="flex items-center gap-2 text-slate-400 hover:text-white text-xs font-mono font-black uppercase tracking-wider bg-slate-900 hover:bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-800 transition-all cursor-pointer mb-2"
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
                Deposit Funds
              </h1>
              <p className="text-xs text-slate-400">
                Instant payment gateway powered by Sunpay.
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

      {/* MAIN CONTAINER */}
      <div id="deposit-grid-layout" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
        
        {/* LEFT COLUMN: SUNPAY CHECKOUT FORM */}
        <div id="deposit-left-column" className="lg:col-span-8 space-y-8 w-full">
          
          <form onSubmit={handlePayWithSunpay} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 space-y-6 shadow-xl">
            
            {/* Header / Gateway Badge */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div>
                <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest font-mono block">INSTANT PAYMENT GATEWAY</span>
                <h3 className="text-lg font-display font-black text-white tracking-tight flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                  Sunpay Deposit
                </h3>
              </div>
              <span className="text-[9px] font-mono font-black text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                ACTIVE GATEWAY
              </span>
            </div>

            {/* Presets Grid */}
            <div className="space-y-2.5">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                Select Deposit Amount (INR)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => { setSunpayAmount(String(preset)); playSound('CLICK'); }}
                    className={`py-3 px-2 rounded-xl text-xs font-mono font-black border transition-all cursor-pointer ${
                      Number(sunpayAmount) === preset
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20 scale-[1.02]'
                        : 'bg-slate-950/80 hover:bg-slate-800 text-slate-300 border-slate-800'
                    }`}
                  >
                    ₹{preset.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount Input Field */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">
                Custom Amount (₹100 - ₹1,00,000)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono font-black text-emerald-400 text-xl">
                  ₹
                </span>
                <input
                  type="number"
                  min="100"
                  max="100000"
                  placeholder="Enter amount (e.g. 500)"
                  value={sunpayAmount}
                  onChange={(e) => setSunpayAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 rounded-xl pl-10 pr-4 py-3.5 text-xl font-mono font-black text-white focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Info / Instructions Box */}
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 text-xs font-mono text-slate-400 space-y-1.5">
              <div className="flex items-center gap-2 text-white font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                How Sunpay Checkout Works:
              </div>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400">
                <li>Clicking PAY will open the official Sunpay checkout page.</li>
                <li>Complete your payment using UPI, NetBanking, or QR code.</li>
                <li>Your wallet balance will be credited automatically once confirmed.</li>
              </ul>
            </div>

            {/* Submit / PAY Button */}
            <button
              type="submit"
              disabled={isCreatingSunpay}
              className="w-full py-4 rounded-xl font-mono text-sm font-black uppercase tracking-wider bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-xl shadow-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingSunpay ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin text-slate-950" />
                  Generating Sunpay Order...
                </>
              ) : (
                <>
                  <ExternalLink className="w-5 h-5" />
                  PAY ₹{Number(sunpayAmount || 0).toLocaleString('en-IN')} NOW
                </>
              )}
            </button>

          </form>

        </div>

        {/* RIGHT COLUMN: RECENT DEPOSIT TRANSACTIONS */}
        <div id="deposit-right-column" className="lg:col-span-4 space-y-6 w-full">
          
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-xs font-mono font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                Recent Deposits ({userDeposits.length})
              </h3>
            </div>

            {userDeposits.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <ShieldCheck className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs font-mono text-slate-500">No deposit history recorded.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
                {userDeposits.map((dep) => (
                  <div
                    key={dep.id || dep.depositId}
                    onClick={() => setSelectedTxForModal(dep)}
                    className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl flex items-center justify-between gap-3 transition-all cursor-pointer"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                          Sunpay
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(dep.timestamp || Date.now()).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs font-mono font-bold text-white truncate">
                        ₹{dep.amount.toLocaleString('en-IN')}
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
                ))}
              </div>
            )}
          </div>

          {/* Security Guarantee Box */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold">
              <ShieldCheck className="w-4 h-4" />
              Sunpay Secure Gateway
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              All transactions are encrypted and processed through Sunpay's secure checkout infrastructure with real-time automated ledger synchronization.
            </p>
          </div>

        </div>

      </div>

      {/* TRANSACTION DETAILS MODAL */}
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
              className="bg-slate-900 border border-slate-800 p-6 rounded-3xl max-w-md w-full space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="font-mono font-bold text-sm text-white">Deposit Transaction Details</h3>
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
                  <span className="text-white font-bold">{selectedTxForModal.id || selectedTxForModal.depositId}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-500">Provider:</span>
                  <span className="text-emerald-400 font-bold">Sunpay</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-500">Amount:</span>
                  <span className="text-white font-bold">₹{selectedTxForModal.amount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-500">Status:</span>
                  <span className="text-amber-400 font-bold uppercase">{selectedTxForModal.status}</span>
                </div>
                <div className="space-y-1 pt-1">
                  <span className="text-slate-500 block">Description:</span>
                  <p className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px] text-slate-300 break-all leading-relaxed">
                    {selectedTxForModal.details || `Sunpay Deposit Order: ₹${selectedTxForModal.amount}`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTxForModal(null)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-mono text-xs font-bold text-white transition-all cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
});
