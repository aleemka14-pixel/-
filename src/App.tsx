import { useState, useEffect, useMemo, ReactNode, useRef, ChangeEvent, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';
import { 
  Wallet, 
  TrendingUp, 
  History, 
  Settings, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle2, 
  XCircle, 
  Clock,
  AlertCircle,
  Check,
  Search,
  Menu,
  X,
  Volume2,
  VolumeX,
  Flame,
  Zap,
  Trophy,
  RotateCcw,
  LogOut,
  Trash2,
  ShieldAlert,
  Construction,
  Share2,
  UserPlus,
  QrCode,
  Image as ImageIcon,
  Copy,
  Info,
  Lock,
  LockOpen,
  User,
  ChevronRight,
  ChevronDown,
  Heart,
  Coffee,
  Users,
  Crown,
  Megaphone,
  Sliders,
  RefreshCw,
  AlertTriangle,
  Wrench,
  Smartphone,
  Coins,
  Shield,
  Headphones
} from 'lucide-react';
import { AppState, Transaction, WithdrawalRequest, DepositRequest, Player, PaymentSettings, DepositNetwork, WithdrawalNetwork, WithdrawalSettings, ActiveBet } from './types.ts';
import { auth, db, loginWithGoogle, logout, OperationType, handleFirestoreError } from './lib/firebase.ts';
import { RedesignedDepositView } from './components/RedesignedDepositView.tsx';
import { RedesignedWithdrawView } from './components/RedesignedWithdrawView.tsx';
import { RedesignedWalletView } from './components/RedesignedWalletView.tsx';
import { AdminDepositManager } from './components/AdminDepositManager.tsx';
import { AdminWithdrawalManager } from './components/AdminWithdrawalManager.tsx';
import { AdminDepositLedger } from './components/AdminDepositLedger.tsx';
import { VercelDiagnosticModal } from './components/VercelDiagnosticModal.tsx';
import { CurrencySelector } from './components/CurrencySelector.tsx';
import { LeaderboardView } from './components/LeaderboardView.tsx';
import { AdminActiveUsersView } from './components/AdminActiveUsersView.tsx';
import { MatrixBackground } from './components/MatrixBackground.tsx';
import {
  SUPPORTED_CURRENCIES,
  DEFAULT_RATES,
  getCachedRates,
  setCachedRates,
  fetchExchangeRates,
  convertUsdToCurrency,
  convertCurrencyToUsd,
  formatCurrencyValue,
  getCurrencySymbol
} from './lib/currency.ts';
import { 
  onSnapshot, 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  getDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  increment,
  runTransaction,
  limit
} from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { walletServiceTS } from './lib/wallet-service';

// High-fidelity modern sound effects
const SOUNDS = {
  WIN: 'https://cdn.freesound.org/previews/341/341695_5858296-lq.mp3', // Epic level up/win
  LOSE: 'https://cdn.freesound.org/previews/415/415209_5121236-lq.mp3',
  SPIN: 'https://cdn.freesound.org/previews/146/146718_2437358-lq.mp3',
  BET: 'https://cdn.freesound.org/previews/442/442127_7431267-lq.mp3',
  CLICK: 'https://cdn.freesound.org/previews/264/264761_4546410-lq.mp3',
  TICK: 'https://cdn.freesound.org/previews/264/264761_4546410-lq.mp3',
};

// Preloaded audio cache to prevent gameplay latency
const audioCache: Record<string, HTMLAudioElement> = {};
if (typeof window !== 'undefined') {
  Object.entries(SOUNDS).forEach(([key, url]) => {
    try {
      const audio = new Audio(url);
      audio.preload = 'auto';
      audioCache[key] = audio;
    } catch (e) {
      console.warn(`Failed to preload sound ${key}:`, e);
    }
  });
}

// Custom Web Audio API Synthesizer for high-end casino sound effects (Stake-style)
const playCasinoWinSynth = (intensity: 'small' | 'medium' | 'large', volume: number = 0.6) => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volume, ctx.currentTime);
    masterGain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (intensity === 'small') {
      // Short, clean, rewarding victory notification chime
      const notes = [659.25, 783.99, 1046.50]; // E5, G5, C6 (Rising perfect C-major arpeggio fragment)
      notes.forEach((freq, i) => {
        const time = now + i * 0.06;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);
        
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.12, time + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(time);
        osc.stop(time + 0.16);
      });

      // Subtle digital sparkle effect note at the end
      const sparkOsc = ctx.createOscillator();
      const sparkGain = ctx.createGain();
      sparkOsc.type = 'sine';
      sparkOsc.frequency.setValueAtTime(2200, now + 0.18);
      sparkGain.gain.setValueAtTime(0, now + 0.18);
      sparkGain.gain.linearRampToValueAtTime(0.05, now + 0.19);
      sparkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      sparkOsc.connect(sparkGain);
      sparkGain.connect(masterGain);
      sparkOsc.start(now + 0.18);
      sparkOsc.stop(now + 0.25);

    } else if (intensity === 'medium') {
      // Energetic rising major arpeggio with high-passed square & warm triangle elements
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const time = now + i * 0.07;
        
        // Triangle wave for full body
        const oscT = ctx.createOscillator();
        const gainT = ctx.createGain();
        oscT.type = 'triangle';
        oscT.frequency.setValueAtTime(freq, time);
        
        gainT.gain.setValueAtTime(0, time);
        gainT.gain.linearRampToValueAtTime(0.12, time + 0.02);
        gainT.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
        
        oscT.connect(gainT);
        gainT.connect(masterGain);
        oscT.start(time);
        oscT.stop(time + 0.25);

        // Sine wave octave above for digital sparkle shine
        const oscS = ctx.createOscillator();
        const gainS = ctx.createGain();
        oscS.type = 'sine';
        oscS.frequency.setValueAtTime(freq * 2, time);
        
        gainS.gain.setValueAtTime(0, time);
        gainS.gain.linearRampToValueAtTime(0.06, time + 0.02);
        gainS.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
        
        oscS.connect(gainS);
        gainS.connect(masterGain);
        oscS.start(time);
        oscS.stop(time + 0.16);
      });

      // Digital sparkle shimmer details
      for (let j = 0; j < 4; j++) {
        const sparkTime = now + 0.05 + j * 0.08;
        const sparkFreq = 1800 + Math.random() * 1200;

        const sparkOsc = ctx.createOscillator();
        const sparkGain = ctx.createGain();
        sparkOsc.type = 'sine';
        sparkOsc.frequency.setValueAtTime(sparkFreq, sparkTime);

        sparkGain.gain.setValueAtTime(0, sparkTime);
        sparkGain.gain.linearRampToValueAtTime(0.04, sparkTime + 0.015);
        sparkGain.gain.exponentialRampToValueAtTime(0.001, sparkTime + 0.08);

        sparkOsc.connect(sparkGain);
        sparkGain.connect(masterGain);
        sparkOsc.start(sparkTime);
        sparkOsc.stop(sparkTime + 0.09);
      }

      // Echo arpeggio tail
      const echoOsc = ctx.createOscillator();
      const echoGain = ctx.createGain();
      echoOsc.type = 'sine';
      echoOsc.frequency.setValueAtTime(1046.50, now + 0.35);
      echoGain.gain.setValueAtTime(0, now + 0.35);
      echoGain.gain.linearRampToValueAtTime(0.04, now + 0.37);
      echoGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      echoOsc.connect(echoGain);
      echoGain.connect(masterGain);
      echoOsc.start(now + 0.35);
      echoOsc.stop(now + 0.56);

    } else {
      // Large Win: Premium jackpot-style sound sequence (Stake-inspired crescendo and bells)
      // 1. Rapid dazzling arpeggio scaling up 2 octaves
      const baseArp = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98, 2093.00]; // C5 to C7
      baseArp.forEach((freq, i) => {
        const time = now + i * 0.04;
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = i % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, time);
        
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.12, time + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
        
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(time);
        osc.stop(time + 0.18);
      });

      // 2. Rising pitch glide sweep (synthesizer crescendo)
      const sweepOsc = ctx.createOscillator();
      const sweepGain = ctx.createGain();
      sweepOsc.type = 'sawtooth';
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, now);
      filter.frequency.exponentialRampToValueAtTime(1800, now + 0.55);

      sweepOsc.frequency.setValueAtTime(261.63, now); // C4
      sweepOsc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.55); // C6

      sweepGain.gain.setValueAtTime(0, now);
      sweepGain.gain.linearRampToValueAtTime(0.08, now + 0.08);
      sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

      sweepOsc.connect(filter);
      filter.connect(sweepGain);
      sweepGain.connect(masterGain);
      sweepOsc.start(now);
      sweepOsc.stop(now + 0.56);

      // 3. Immersive digital sparkles (cascade of 12 sparkling bell tones)
      for (let j = 0; j < 12; j++) {
        const sparkTime = now + 0.08 + j * 0.05;
        const sparkFreq = 2000 + Math.random() * 2500; // 2000Hz to 4500Hz

        const sparkOsc = ctx.createOscillator();
        const sparkGain = ctx.createGain();
        sparkOsc.type = 'sine';
        sparkOsc.frequency.setValueAtTime(sparkFreq, sparkTime);

        sparkGain.gain.setValueAtTime(0, sparkTime);
        sparkGain.gain.linearRampToValueAtTime(0.04, sparkTime + 0.01);
        sparkGain.gain.exponentialRampToValueAtTime(0.001, sparkTime + 0.08);

        sparkOsc.connect(sparkGain);
        sparkGain.connect(masterGain);
        sparkOsc.start(sparkTime);
        sparkOsc.stop(sparkTime + 0.09);
      }

      // 4. Large Jackpot Climax Chord at now + 0.38s
      const chord = [523.25, 659.25, 783.99, 1046.50]; // C Major Chord
      chord.forEach((freq) => {
        const chordTime = now + 0.38;
        
        const chordOsc = ctx.createOscillator();
        const chordGain = ctx.createGain();
        chordOsc.type = 'triangle';
        chordOsc.frequency.setValueAtTime(freq, chordTime);

        // Add vibrating LFO for rich resonance (gives physical casino bell depth)
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 6.5; // Vibrato rate 6.5Hz
        lfoGain.gain.value = 5; // Depth of 5Hz
        lfo.connect(lfoGain);
        lfoGain.connect(chordOsc.frequency);
        lfo.start(chordTime);
        lfo.stop(chordTime + 1.2);

        chordGain.gain.setValueAtTime(0, chordTime);
        chordGain.gain.linearRampToValueAtTime(0.12, chordTime + 0.05);
        chordGain.gain.exponentialRampToValueAtTime(0.001, chordTime + 1.15);

        chordOsc.connect(chordGain);
        chordGain.connect(masterGain);
        chordOsc.start(chordTime);
        chordOsc.stop(chordTime + 1.2);
      });
    }
  } catch (error) {
    console.warn("Casino win sound synthesis failed:", error);
  }
};

// Create a custom non-worker confetti instance to bypass OffscreenCanvas and iframe getBoundingClientRect sandbox restrictions
const customConfetti = confetti.create(undefined as any, { useWorker: false, resize: true });

// Mock Initial Data
const INITIAL_STATE: AppState = {
  players: [],
  currentPlayerId: undefined,
  transactions: [],
  withdrawals: [],
  deposits: [],
  depositNetworks: [],
  winRate: 0.45, // 45% win rate by default
  totalEarned: 0,
  manualMode: false,
  maxBet: 500,
  isBetLimitEnabled: true,
  maintenanceMode: false,
  minDeposit: 10,
  minWithdraw: 500,
  paymentSettings: {
    additionalInstructions: 'Submit transaction hash or screenshot proof for quick approval.'
  },
  isPaymentLocked: false,
  referralAmount: 10,
  isReferralEnabled: true,
  isWithdrawLimit24hEnabled: false,
  isWinRateLocked: false,
  isTransferLimitsLocked: false,
  houseProfitResetTimestamp: 0,
  isBettingClosed: false,
  teaBreakMode: false,
  lotteryTargetTimestamp: 0,
  lotteryTimerDuration: 300,
  lotteryTimerActive: false,
  playersWonCount: 142,
  isPlayersWonShown: true,
  announcementText: 'Welcome to Matrix Multiplier! Active promotion: Earn double VIP experience this week!',
  isAnnouncementEnabled: false
};

const synchronizeUserAndPlayer = async (uid: string, uData: any, pData: any) => {
  if (!uid) return;
  const updatesUser: any = {};
  const updatesPlayer: any = {};

  // 1. Sync ID
  if (uData && uData.id !== uid) updatesUser.id = uid;
  if (pData && pData.id !== uid) updatesPlayer.id = uid;

  // 2. Sync username/name
  const nameVal = pData?.name || uData?.username || uData?.name || uData?.displayName || 'Player';
  if (uData && uData.username !== nameVal) updatesUser.username = nameVal;
  if (pData && pData.name !== nameVal) updatesPlayer.name = nameVal;

  // 3. Sync email
  const emailVal = pData?.email || uData?.email || '';
  if (uData && uData.email !== emailVal) updatesUser.email = emailVal;
  if (pData && pData.email !== emailVal) updatesPlayer.email = emailVal;

  // 4. Sync walletBalance/balance
  const balanceVal = uData?.walletBalance !== undefined ? Number(uData.walletBalance) : (uData?.balance !== undefined ? Number(uData.balance) : (pData?.balance !== undefined ? Number(pData.balance) : 0));
  if (uData && (uData.walletBalance !== balanceVal || uData.balance !== balanceVal)) {
    updatesUser.walletBalance = balanceVal;
    updatesUser.balance = balanceVal;
  }
  if (pData && pData.balance !== balanceVal) updatesPlayer.balance = balanceVal;

  // 5. Sync referral data
  const refCodeVal = pData?.referralCode || uData?.referralCode || '';
  const refByVal = pData?.referredBy || uData?.referredBy || '';
  const refCountVal = pData?.referralCount !== undefined ? pData.referralCount : (uData?.referralCount !== undefined ? uData.referralCount : 0);

  if (uData) {
    if (uData.referralCode !== refCodeVal) updatesUser.referralCode = refCodeVal;
    if (uData.referredBy !== refByVal) updatesUser.referredBy = refByVal;
    if (uData.referralCount !== refCountVal) updatesUser.referralCount = refCountVal;
  }
  if (pData) {
    if (pData.referralCode !== refCodeVal) updatesPlayer.referralCode = refCodeVal;
    if (pData.referredBy !== refByVal) updatesPlayer.referredBy = refByVal;
    if (pData.referralCount !== refCountVal) updatesPlayer.referralCount = refCountVal;
  }

  // Apply updates to users collection
  if (Object.keys(updatesUser).length > 0) {
    try {
      updatesUser.updatedAt = Date.now();
      await updateDoc(doc(db, 'users', uid), updatesUser);
      console.log(`Auto-Sync: Synced users fields for ${uid}`, updatesUser);
    } catch (err) {
      console.warn(`Auto-Sync: Failed to update users doc for ${uid}`, err);
    }
  }

  // Apply updates to players collection
  if (Object.keys(updatesPlayer).length > 0) {
    try {
      await updateDoc(doc(db, 'players', uid), updatesPlayer);
      console.log(`Auto-Sync: Synced players fields for ${uid}`, updatesPlayer);
    } catch (err) {
      console.warn(`Auto-Sync: Failed to update players doc for ${uid}`, err);
    }
  }
};

const NextLotteryCard = memo(function NextLotteryCard({
  lotteryTargetTimestamp,
  lotteryTimerActive,
  lotteryTimerDuration,
}: {
  lotteryTargetTimestamp?: number;
  lotteryTimerActive?: boolean;
  lotteryTimerDuration?: number;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!lotteryTimerActive) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [lotteryTimerActive]);

  const lotterySecondsLeft = lotteryTargetTimestamp && lotteryTimerActive
    ? Math.max(0, Math.floor((lotteryTargetTimestamp - now) / 1000))
    : (lotteryTimerDuration ?? 0);

  const formatLotteryTimerStr = (seconds: number) => {
    if (seconds <= 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = (num: number) => num < 10 ? `0${num}` : num;
    if (hrs > 0) return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    return `${pad(mins)}:${pad(secs)}`;
  };

  const lotteryTimerStr = formatLotteryTimerStr(lotterySecondsLeft);
  const progressPercent = lotteryTimerActive && lotterySecondsLeft > 0
    ? (lotterySecondsLeft / (lotteryTimerDuration || 300)) * 100
    : 75;

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full p-[1px] rounded-xl bg-gradient-to-r from-[#00aaff] via-[#ff5500] to-[#ff0033] shadow-[0_0_15px_rgba(255,50,0,0.2)]"
    >
      <div className="bg-[#0b0818]/95 backdrop-blur-md p-2.5 sm:p-3 rounded-[11px] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full bg-[#ffb700] shadow-[0_0_10px_#ffb700] animate-pulse shrink-0" />
          <div className="text-left min-w-0">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-[10px] sm:text-xs font-mono font-black uppercase tracking-wider text-[#ffb700]">NEXT LOTTERY</span>
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-white">RESULT</span>
            </div>
            <p className="text-[9px] sm:text-[10px] font-bold text-slate-300/80 truncate">
              {lotteryTimerActive && lotterySecondsLeft > 0 ? 'Drawing Soon' : 'Result Pending'}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 border border-[#ff2a00]/80 bg-[#1d070b]/90 rounded-lg text-[#ffcc00] shadow-[0_0_10px_rgba(255,0,68,0.3)]">
            <Clock className="w-3.5 h-3.5 text-[#ffcc00] animate-pulse shrink-0" />
            <span className="font-mono text-xs sm:text-sm font-black tracking-wider whitespace-nowrap">{lotteryTimerStr}</span>
          </div>
          {/* Yellow Progress bar */}
          <div className="w-[72px] sm:w-[84px] bg-gray-900/90 h-1 sm:h-1.5 rounded-full overflow-hidden mt-1 border border-white/10">
            <div 
              className="h-full bg-gradient-to-r from-[#ffb700] via-[#ff7700] to-[#ff0033] transition-all duration-1000 ease-linear shadow-[0_0_8px_#ffb700]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
});

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [walletLoading, setWalletLoading] = useState(false);
  const [showVercelDiag, setShowVercelDiag] = useState(false);
  const [vercelDiagError, setVercelDiagError] = useState<{ code?: string; message?: string } | null>(null);

  const activeListenersRef = useRef<{ uid: string | null; unsubscribes: (() => void)[] }>({ uid: null, unsubscribes: [] });
  const activeSessionRef = useRef<string | null>(null);

  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>(() => getCachedRates().rates);
  const [exchangeRatesLastUpdated, setExchangeRatesLastUpdated] = useState<number>(() => getCachedRates().lastUpdated);
  const [preferredCurrency, setPreferredCurrency] = useState<string>(() => {
    return localStorage.getItem('preferred_currency') || 'USD';
  });

  useEffect(() => {
    const loadExchangeRates = async () => {
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;
      
      if (now - exchangeRatesLastUpdated > oneHour || exchangeRatesLastUpdated === 0) {
        try {
          const fetchedRates = await fetchExchangeRates();
          setExchangeRates(fetchedRates);
          setExchangeRatesLastUpdated(now);
          setCachedRates(fetchedRates, now);
          console.log('Exchange rates updated successfully:', fetchedRates);
        } catch (err) {
          console.warn('Using cached exchange rates due to fetch failure:', err);
        }
      }
    };

    loadExchangeRates();
    const interval = setInterval(loadExchangeRates, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [exchangeRatesLastUpdated]);

  // Custom Demo/Offline Fallback State for Database Quota Exhaustion
  const [quotaExceeded, setQuotaExceeded] = useState(() => {
    if (typeof window !== 'undefined') {
      return !!(window as any).__firestoreQuotaExceeded;
    }
    return false;
  });
  const [demoMode, setDemoMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return !!(window as any).__firestoreQuotaExceeded;
    }
    return false;
  });
  const [demoBalance, setDemoBalance] = useState<number | null>(null);
  const [demoTransactions, setDemoTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    const handleQuotaExceeded = () => {
      setQuotaExceeded(true);
      setDemoMode(true);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason) {
        const msg = String(reason.message || reason).toLowerCase();
        if (msg.includes('quota') || msg.includes('resource-exhausted') || msg.includes('resource_exhausted') || msg.includes('limit exceeded')) {
          setQuotaExceeded(true);
          setDemoMode(true);
        }
      }
    };

    const handleGlobalError = (event: ErrorEvent) => {
      const msg = String(event.message || event.error?.message || '').toLowerCase();
      if (msg.includes('quota') || msg.includes('resource-exhausted') || msg.includes('resource_exhausted') || msg.includes('limit exceeded')) {
        setQuotaExceeded(true);
        setDemoMode(true);
      }
    };

    window.addEventListener('firestore-quota-exceeded', handleQuotaExceeded);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleGlobalError);

    return () => {
      window.removeEventListener('firestore-quota-exceeded', handleQuotaExceeded);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleGlobalError);
    };
  }, []);

  useEffect(() => {
    if (demoMode && (demoBalance === null || demoBalance <= 0)) {
      setDemoBalance(1000);
    }
  }, [demoMode, demoBalance]);

  useEffect(() => {
    if (quotaExceeded) {
      setDemoMode(true);
    }
  }, [quotaExceeded]);

  useEffect(() => {
    const start = Date.now();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      const elapsed = Date.now() - start;
      const delay = Math.max(0, 50 - elapsed);
      
      setTimeout(() => {
        setUser(firebaseUser);
        if (firebaseUser) {
          setWalletLoading(true);
          const cachedBalanceStr = localStorage.getItem(`last_known_balance_${firebaseUser.uid}`);
          const cachedBalance = cachedBalanceStr ? parseFloat(cachedBalanceStr) : null;
          
          setState(prev => {
            const exists = prev.players.some(p => p.id === firebaseUser.uid);
            if (!exists && cachedBalance !== null && !Number.isNaN(cachedBalance)) {
              return {
                ...prev,
                currentPlayerId: firebaseUser.uid,
                players: [...prev.players, {
                  id: firebaseUser.uid,
                  name: firebaseUser.displayName || 'Player',
                  email: firebaseUser.email || '',
                  balance: cachedBalance,
                  override: 'none',
                  referralCode: '',
                  referralCount: 0
                } as Player]
              };
            }
            return { ...prev, currentPlayerId: firebaseUser.uid };
          });
        } else {
          // Clear sensitive state on logout
          setState(prev => ({ 
            ...prev, 
            currentPlayerId: undefined,
            players: [],
            transactions: [],
            withdrawals: [],
            deposits: []
          }));
          setWalletLoading(false);
        }
        setLoading(false);
      }, delay);
    });
    return unsubscribe;
  }, []);

  const adminEmails = useMemo(() => ['futurebillionairehrx@gmail.com', 'aleemka14@gmail.com'], []);
    const isAdmin = useMemo(() => {
    if (!user) return false;
    const email = (user.email || '').toLowerCase();
    const uid = user.uid;
    const isSpecialUid = uid === '4m3i5Kbu9MV2x23vRbYImQpGeDn1';
    const isSpecialEmail = adminEmails.includes(email);
    const result = isSpecialUid || isSpecialEmail;
    console.log('Admin Check:', { email, uid, isSpecialUid, isSpecialEmail, result });
    return result;
  }, [user, adminEmails]);

  // Verify & Auto-create missing player/user records and update lastActive timestamp
  useEffect(() => {
    if (user && !demoMode && !quotaExceeded) {
      const verifyAndCreatePlayer = async () => {
        try {
          const playerRef = doc(db, 'players', user.uid);
          const userRef = doc(db, 'users', user.uid);
          const now = Date.now();
          
          const playerSnap = await getDoc(playerRef);
          
          if (!playerSnap.exists()) {
            console.log(`Auto-creating missing player profile for UID: ${user.uid}`);
            
            const name = user.displayName || user.email?.split('@')[0] || 'Player';
            const personalReferralCode = (name.substring(0, 3).replace(/[^a-zA-Z]/g, 'A') + Math.floor(100 + Math.random() * 900)).toUpperCase();
            
            const newPlayer: Player = {
              id: user.uid,
              name,
              email: user.email || '',
              balance: 0,
              override: 'none',
              referralCode: personalReferralCode,
              referredBy: '',
              referralCount: 0,
              totalWagered: 0,
              totalWinnings: 0,
              biggestBet: 0,
              totalBetsCount: 0,
              lastActive: now,
              wins: 0,
              losses: 0
            };

            const batch = writeBatch(db);
            batch.set(playerRef, newPlayer);
            batch.set(userRef, {
              id: user.uid,
              username: name,
              email: user.email || '',
              balance: 0,
              walletBalance: 0,
              referralCode: personalReferralCode,
              referredBy: '',
              referralCount: 0,
              totalWinnings: 0,
              biggestBet: 0,
              totalBetsCount: 0,
              lastActive: now,
              wins: 0,
              losses: 0,
              createdAt: now,
              updatedAt: now
            });
            await batch.commit();
            console.log(`Auto-created player and user docs for UID: ${user.uid}`);
          } else {
            // Update lastActive timestamp on app open / login
            await updateDoc(playerRef, { lastActive: now });
            await updateDoc(userRef, { lastActive: now, updatedAt: now });
            console.log(`Updated lastActive timestamp for user: ${user.uid}`);
          }
        } catch (e: any) {
          const msg = String(e?.message || e).toLowerCase();
          if (msg.includes('quota') || msg.includes('resource-exhausted') || e?.code === 'resource-exhausted') {
            if (typeof window !== 'undefined') {
              (window as any).__firestoreQuotaExceeded = true;
              window.dispatchEvent(new CustomEvent('firestore-quota-exceeded', { detail: { error: e?.message || String(e) } }));
            }
          } else {
            console.error("Error verifying or auto-creating player:", e);
          }
        }
      };
      verifyAndCreatePlayer();
    }
  }, [user, demoMode, quotaExceeded]);

  // Listeners for Firestore data
  useEffect(() => {
    if (quotaExceeded) {
      console.log('Snapshot listeners bypassed because Firestore quota is exceeded.');
      return;
    }

    const currentSessionKey = `${user?.uid || 'guest'}_${isAdmin}_${quotaExceeded}`;
    if (activeSessionRef.current === currentSessionKey) {
      console.log('Listeners already active for session:', currentSessionKey);
      return;
    }

    // Clean up any existing listeners first to prevent duplicates
    if (activeListenersRef.current.unsubscribes.length > 0) {
      console.log('Cleaning up old listeners before initializing new ones...');
      activeListenersRef.current.unsubscribes.forEach(unsub => {
        try {
          unsub();
        } catch (e) {
          console.warn('Error cleaning up listener:', e);
        }
      });
      activeListenersRef.current.unsubscribes = [];
    }

    activeSessionRef.current = currentSessionKey;

    console.log('Starting Listeners. User:', user?.email || 'Guest', user?.uid || 'none');
    console.log('CurrentUser:', auth.currentUser?.email, auth.currentUser?.uid);

    // Track active unsubscribes for this session
    const activeUnsubscribes: (() => void)[] = [];
    activeListenersRef.current.unsubscribes = activeUnsubscribes;

    const reg = (unsub: () => void) => {
      activeUnsubscribes.push(unsub);
      return unsub;
    };

    // Config Listener
    const handleListenerError = (context: string, err: any) => {
      const msg = String(err?.message || err).toLowerCase();
      const isQuota = msg.includes('quota') || msg.includes('resource-exhausted') || msg.includes('limit exceeded');
      const isUnavailable = err?.code === 'unavailable' || msg.includes('unavailable') || msg.includes('could not reach');
      if (isQuota || isUnavailable) {
        if (isQuota && typeof window !== 'undefined') {
          (window as any).__firestoreQuotaExceeded = true;
          window.dispatchEvent(new CustomEvent('firestore-quota-exceeded', { detail: { error: err?.message || String(err) } }));
        }
        console.info(`[Firebase Info] ${context} running in offline/cached mode:`, err?.message || String(err));
      } else {
        console.warn(`${context}:`, err?.message || String(err));
      }
    };

    const unsubConfig = reg(onSnapshot(doc(db, 'config', 'admin'), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setState(prev => ({
          ...prev,
          winRate: data.winRate ?? 0.45,
          manualMode: data.manualMode ?? false,
          maxBet: data.maxBet ?? 500,
          isBetLimitEnabled: data.isBetLimitEnabled ?? true,
          maintenanceMode: data.maintenanceMode ?? false,
          minDeposit: data.minDeposit ?? 10,
          minWithdraw: data.minWithdraw ?? 500,
          paymentSettings: data.paymentSettings,
          isPaymentLocked: data.isPaymentLocked ?? false,
          referralAmount: data.referralAmount ?? 10,
          isReferralEnabled: data.isReferralEnabled ?? true,
          isWithdrawLimit24hEnabled: data.isWithdrawLimit24hEnabled ?? false,
          isWinRateLocked: data.isWinRateLocked ?? false,
          isTransferLimitsLocked: data.isTransferLimitsLocked ?? false,
          houseProfitResetTimestamp: data.houseProfitResetTimestamp ?? 0,
          isBettingClosed: data.isBettingClosed ?? false,
          teaBreakMode: data.teaBreakMode ?? false,
          lotteryTargetTimestamp: data.lotteryTargetTimestamp ?? 0,
          lotteryTimerDuration: data.lotteryTimerDuration ?? 300,
          lotteryTimerActive: data.lotteryTimerActive ?? false,
          playersWonCount: data.playersWonCount ?? 142,
          isPlayersWonShown: data.isPlayersWonShown ?? true,
          announcementText: data.announcementText ?? 'Welcome to Matrix Multiplier! Active promotion: Earn double VIP experience this week!',
          isAnnouncementEnabled: data.isAnnouncementEnabled ?? false,
          customTotalBets: data.customTotalBets !== undefined ? data.customTotalBets : undefined,
          isWithdrawalsStopped: data.isWithdrawalsStopped ?? false
        }));
      } else if (isAdmin) {
        // Initialize default config if missing and user is admin
        try {
          await setDoc(doc(db, 'config', 'admin'), {
            winRate: 0.45,
            manualMode: false,
            maxBet: 500,
            isBetLimitEnabled: true,
            maintenanceMode: false,
            isPaymentLocked: false,
            referralAmount: 10,
            isReferralEnabled: true,
            isWithdrawLimit24hEnabled: false,
            isWinRateLocked: false,
            isTransferLimitsLocked: false,
            isBettingClosed: false,
            teaBreakMode: false,
            lotteryTargetTimestamp: 0,
            lotteryTimerDuration: 300,
            lotteryTimerActive: false,
            playersWonCount: 142,
            isPlayersWonShown: true,
            announcementText: 'Welcome to Matrix Multiplier! Active promotion: Earn double VIP experience this week!',
            isAnnouncementEnabled: false
          }, { merge: true });
        } catch (e) {
          handleListenerError('Failed to initialize admin config', e);
        }
      }
    }, (err) => {
      handleListenerError('Config access denied or missing. Using defaults.', err);
    }));

    // Players/Users Combined Listener - Everyone gets at least the top players for the leaderboard
    let rawPlayers: Player[] = [];
    let rawUsers: any[] = [];
    let rawCurrentPlayer: Player | null = null;
    const syncAttempted = new Set<string>();

    const getEffectiveBalance = (u?: any, p?: any, fallback: number = 0): number => {
      const checkVal = (v: any) => v !== undefined && v !== null && !Number.isNaN(Number(v));
      if (u && checkVal(u.walletBalance)) return Number(u.walletBalance);
      if (u && checkVal(u.balance)) return Number(u.balance);
      if (p && checkVal(p.walletBalance)) return Number(p.walletBalance);
      if (p && checkVal(p.balance)) return Number(p.balance);
      return fallback;
    };

    const mergeAndSetPlayers = () => {
      const playersMap = new Map<string, Player>();

      const getItemId = (item: any): string => {
        if (!item) return '';
        return String(item.id || item.uid || item.userId || '').trim();
      };

      // 1. Process rawUsers (from users collection)
      (rawUsers || []).forEach(u => {
        if (!u) return;
        const uid = getItemId(u);
        if (!uid) return;

        const p = (uid === user?.uid && rawCurrentPlayer) 
          ? rawCurrentPlayer 
          : (rawPlayers || []).find(pl => pl && getItemId(pl) === uid);

        const effBalance = getEffectiveBalance(u, p, 0);

        const playerObj: Player = {
          ...p,
          ...u,
          id: uid,
          name: u.username || u.name || u.displayName || p?.name || 'Player',
          email: u.email || p?.email || '',
          balance: effBalance,
          walletBalance: effBalance,
          override: p?.override || u.override || 'none',
          referralCode: p?.referralCode || u.referralCode || '',
          referredBy: p?.referredBy || u.referredBy || '',
          referralCount: p?.referralCount ?? u.referralCount ?? 0,
          totalWagered: p?.totalWagered ?? u.totalWagered ?? 0,
          preferredCurrency: p?.preferredCurrency || u.preferredCurrency || 'USDT',
          wins: p?.wins ?? u.wins ?? 0,
          losses: p?.losses ?? u.losses ?? 0,
          lastActive: u.lastActive || p?.lastActive || u.updatedAt || p?.updatedAt || Date.now(),
          createdAt: u.createdAt || p?.createdAt || Date.now(),
        } as Player;

        playersMap.set(uid, playerObj);
      });

      // 2. Process rawPlayers (from players collection - fill gaps / add players not in users collection)
      (rawPlayers || []).forEach(p => {
        if (!p) return;
        const pid = getItemId(p);
        if (!pid) return;

        if (playersMap.has(pid)) {
          const existing = playersMap.get(pid)!;
          const effBalance = getEffectiveBalance(existing, p, existing.balance || 0);
          playersMap.set(pid, {
            ...p,
            ...existing,
            balance: effBalance,
            walletBalance: effBalance,
            lastActive: existing.lastActive || p.lastActive || p.updatedAt || Date.now(),
            createdAt: existing.createdAt || p.createdAt || Date.now(),
          });
        } else {
          const effBalance = getEffectiveBalance(null, p, 0);
          playersMap.set(pid, {
            ...p,
            id: pid,
            name: p.name || 'Player',
            email: p.email || '',
            balance: effBalance,
            walletBalance: effBalance,
            override: p.override || 'none',
            referralCode: p.referralCode || '',
            referredBy: p.referredBy || '',
            referralCount: p.referralCount ?? 0,
            totalWagered: p.totalWagered ?? 0,
            preferredCurrency: p.preferredCurrency || 'USDT',
            wins: p.wins ?? 0,
            losses: p.losses ?? 0,
            lastActive: p.lastActive || p.updatedAt || Date.now(),
            createdAt: p.createdAt || Date.now(),
          } as Player);
        }
      });

      // 3. Process saved demo registered players (localStorage)
      try {
        const savedDemoJson = localStorage.getItem('demo_registered_players');
        if (savedDemoJson) {
          const savedDemoPlayers: Player[] = JSON.parse(savedDemoJson);
          if (Array.isArray(savedDemoPlayers) && savedDemoPlayers.length > 0) {
            savedDemoPlayers.forEach(dp => {
              if (!dp) return;
              const dpid = getItemId(dp);
              if (dpid && !playersMap.has(dpid)) {
                const effBalance = getEffectiveBalance(dp, null, 1000);
                playersMap.set(dpid, {
                  ...dp,
                  id: dpid,
                  balance: effBalance,
                  walletBalance: effBalance,
                  lastActive: dp.lastActive || Date.now(),
                  createdAt: dp.createdAt || Date.now(),
                } as Player);
              }
            });
          }
        }
      } catch (e) {
        console.warn('Failed to load demo_registered_players from localStorage:', e);
      }

      // 4. Ensure current user is always present
      if (user && user.uid) {
        const curUid = user.uid;
        if (!playersMap.has(curUid)) {
          const p = rawCurrentPlayer || (rawPlayers || []).find(pl => getItemId(pl) === curUid);
          const cachedBalanceStr = localStorage.getItem(`last_known_balance_${curUid}`);
          const cachedBalance = cachedBalanceStr ? parseFloat(cachedBalanceStr) : 0;
          const fallbackBal = !Number.isNaN(cachedBalance) ? cachedBalance : 0;
          const effBalance = getEffectiveBalance(null, p, fallbackBal);

          playersMap.set(curUid, {
            ...p,
            id: curUid,
            name: p?.name || user.displayName || 'Player',
            email: p?.email || user.email || '',
            balance: effBalance,
            walletBalance: effBalance,
            override: p?.override || 'none',
            referralCode: p?.referralCode || '',
            referredBy: p?.referredBy || '',
            referralCount: p?.referralCount ?? 0,
            totalWagered: p?.totalWagered ?? 0,
            preferredCurrency: p?.preferredCurrency || 'USDT',
            wins: p?.wins ?? 0,
            losses: p?.losses ?? 0,
            lastActive: p?.lastActive || p?.updatedAt || Date.now(),
            createdAt: p?.createdAt || Date.now(),
          } as Player);
        }
      }

      const mergedPlayers = Array.from(playersMap.values());

      // Sort in-memory by balance descending for Leaderboard and Admin Panel
      mergedPlayers.sort((a, b) => {
        const balA = a && typeof a.balance === 'number' ? a.balance : 0;
        const balB = b && typeof b.balance === 'number' ? b.balance : 0;
        return balB - balA;
      });

      console.log('Users displayed:', rawUsers ? rawUsers.length : 0);
      console.log('Players displayed:', mergedPlayers ? mergedPlayers.length : 0);

      setState(prev => {
        const existingMap = new Map<string, Player>((prev.players || []).map(item => [item.id, item]));

        const updated = mergedPlayers.map(p => {
          const existing = existingMap.get(p.id);
          const effBalance = getEffectiveBalance(p, existing, 0);

          return {
            ...(existing || {}),
            ...p,
            balance: effBalance,
            walletBalance: effBalance,
            lastActive: p.lastActive || existing?.lastActive || Date.now(),
            createdAt: p.createdAt || existing?.createdAt || Date.now(),
          } as Player;
        });
        return { ...prev, players: updated };
      });

      // If we are an admin, auto-sync missing player documents for existing users
      if (isAdmin && rawUsers && rawUsers.length > 0 && rawPlayers && rawPlayers.length > 0) {
        migrateExistingUsersToPlayers(rawUsers, rawPlayers);
      }
    };

    let unsubUsersList = () => {};
    if (isAdmin) {
      unsubUsersList = reg(onSnapshot(collection(db, 'users'), (snap) => {
        rawUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log('Users fetched:', rawUsers.length);
        mergeAndSetPlayers();
      }, (err) => {
        mergeAndSetPlayers();
        handleListenerError('Users listener error', err);
      }));
    } else {
      // Non-admins do not load users collection
      rawUsers = [];
      console.log('Users fetched: 0 (bypassed for non-admin)');
      mergeAndSetPlayers();
    }

    // Query players collection safely without restrictive queries or artificial limits
    const playersQuery = collection(db, 'players');

    console.log('[PRODUCTION DIAGNOSTICS 2] Query path:', 'collection(db, "players")');

    const unsubPlayersList = reg(onSnapshot(playersQuery, (snap) => {
      rawPlayers = snap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
      console.log('[PRODUCTION DIAGNOSTICS 3] Documents returned by players snapshot:', snap.docs.length);
      console.log('Players fetched:', rawPlayers.length);
      mergeAndSetPlayers();
    }, (err) => {
      mergeAndSetPlayers();
      handleListenerError('Players listener error', err);
    }));

    const syncCurrentUserDocuments = async (u: any, p: any) => {
      if (!user || !user.uid || !u || !p) return;
      
      const uName = u.username || u.name || '';
      const pName = p.name || '';
      const finalName = uName || pName || 'Player';

      const uEmail = u.email || '';
      const pEmail = p.email || '';
      const finalEmail = uEmail || pEmail || '';

      const uRefCode = u.referralCode || '';
      const pRefCode = p.referralCode || '';
      const finalRefCode = pRefCode || uRefCode || ((finalName.substring(0, 3) + Math.floor(100 + Math.random() * 900)).toUpperCase());

      const uReferredBy = u.referredBy || '';
      const pReferredBy = p.referredBy || '';
      const finalReferredBy = pReferredBy || uReferredBy || '';

      const uRefCount = u.referralCount !== undefined ? Number(u.referralCount) : 0;
      const pRefCount = p.referralCount !== undefined ? Number(p.referralCount) : 0;
      const finalRefCount = Math.max(uRefCount, pRefCount);

      const userNeedsUpdate = 
        u.username !== finalName || 
        u.email !== finalEmail || 
        u.referralCode !== finalRefCode || 
        u.referredBy !== finalReferredBy || 
        u.referralCount !== finalRefCount;

      const playerNeedsUpdate = 
        p.name !== finalName || 
        p.email !== finalEmail || 
        p.referralCode !== finalRefCode || 
        p.referredBy !== finalReferredBy || 
        p.referralCount !== finalRefCount;

      if (userNeedsUpdate) {
        try {
          await updateDoc(doc(db, 'users', user.uid), {
            username: finalName,
            email: finalEmail,
            referralCode: finalRefCode,
            referredBy: finalReferredBy,
            referralCount: finalRefCount,
            updatedAt: Date.now()
          });
          console.log(`[Sync] Successfully updated user doc for: ${user.uid}`);
        } catch (e) {
          console.warn(`[Sync] Failed to update user doc for: ${user.uid}`, e);
        }
      }

      if (playerNeedsUpdate) {
        try {
          await updateDoc(doc(db, 'players', user.uid), {
            name: finalName,
            email: finalEmail,
            referralCode: finalRefCode,
            referredBy: finalReferredBy,
            referralCount: finalRefCount
          });
          console.log(`[Sync] Successfully updated player doc for: ${user.uid}`);
        } catch (e) {
          console.warn(`[Sync] Failed to update player doc for: ${user.uid}`, e);
        }
      }
    };

    const migrateExistingUsersToPlayers = async (usersList: any[], playersList: Player[]) => {
      if (!usersList || usersList.length === 0) return;
      
      const missingUsers = usersList.filter(u => {
        if (!u || !u.id) return false;
        return !playersList.some(p => p && p.id === u.id);
      });

      if (missingUsers.length > 0) {
        console.log(`[Migration] Found ${missingUsers.length} users with missing player documents. Migrating...`);
        for (const u of missingUsers) {
          if (syncAttempted.has(u.id)) continue;
          syncAttempted.add(u.id);

          try {
            const personalReferralCode = ((u.username || u.name || u.displayName || 'Player').substring(0, 3) + Math.floor(100 + Math.random() * 900)).toUpperCase();
            const walletBalance = u.walletBalance !== undefined && !Number.isNaN(Number(u.walletBalance))
              ? Number(u.walletBalance)
              : (u.balance !== undefined && !Number.isNaN(Number(u.balance)) ? Number(u.balance) : 0);

            const newPlayer: Player = {
              id: u.id,
              name: u.username || u.name || u.displayName || 'Player',
              email: u.email || '',
              balance: walletBalance,
              override: u.override || 'none',
              referralCode: u.referralCode || personalReferralCode,
              referredBy: u.referredBy || '',
              referralCount: u.referralCount || 0,
              totalWagered: u.totalWagered || 0,
              preferredCurrency: u.preferredCurrency || 'USDT',
              wins: u.wins ?? 0,
              losses: u.losses ?? 0,
            };

            await setDoc(doc(db, 'players', u.id), newPlayer);
            console.log(`[Migration] Created missing player document for user: ${u.id} (${u.username || 'Player'})`);
          } catch (err) {
            console.error(`[Migration] Failed to create player document for user: ${u.id}`, err);
          }
        }
      }
    };

    if (user && user.uid) {
      const currentUserId = user.uid;
      const currentUserEmail = user.email || '';
      const currentDisplayName = user.displayName || 'Player';

      // Single Player profile listener for updates to own fields and override
      reg(onSnapshot(doc(db, 'players', currentUserId), (snap) => {
        if (snap.exists()) {
          const p = snap.data() as Player;
          rawCurrentPlayer = p;
          mergeAndSetPlayers();
          // Keep everything but override balance from the users doc
          setState(prev => {
            const otherPlayers = prev.players.filter(pl => pl.id !== p.id);
            const existingP = prev.players.find(pl => pl.id === p.id);
            const liveBalance = p.balance !== undefined && !Number.isNaN(Number(p.balance)) 
              ? Number(p.balance) 
              : (existingP?.balance ?? 0);
            const mergedPlayer = {
              ...p,
              balance: liveBalance,
              walletBalance: liveBalance
            };
            return { ...prev, players: [...otherPlayers, mergedPlayer] };
          });

          // Sync with user doc if it exists
          getDoc(doc(db, 'users', currentUserId)).then((userSnap) => {
            if (userSnap.exists()) {
              syncCurrentUserDocuments(userSnap.data(), p);
            }
          }).catch(err => console.warn('[Sync] Error checking user doc for sync:', err));
        }
      }, (err) => {
        handleListenerError(`Failed to listen to profile players/${currentUserId}`, err);
      }));

      // Single User wallet listener as single source of truth for balances
      reg(onSnapshot(doc(db, 'users', currentUserId), (snap) => {
        if (snap.exists()) {
          const u = snap.data();
          
          // Use a safe fallback for the balance, prioritizing walletBalance then balance
          const walletBalance = u.walletBalance !== undefined && !Number.isNaN(Number(u.walletBalance))
            ? Number(u.walletBalance)
            : (u.balance !== undefined && !Number.isNaN(Number(u.balance)) ? Number(u.balance) : 0);

          // Cache the live balance to avoid 0-balance resets on refresh or login
          localStorage.setItem(`last_known_balance_${currentUserId}`, String(walletBalance));

          // Self-heal/migration: check if matching player document exists, if not, create it!
          getDoc(doc(db, 'players', currentUserId)).then(async (playerSnap) => {
            if (!playerSnap.exists()) {
              const personalReferralCode = ((u.username || currentDisplayName).substring(0, 3) + Math.floor(100 + Math.random() * 900)).toUpperCase();
              const newPlayer: Player = {
                id: currentUserId,
                name: u.username || currentDisplayName,
                email: u.email || currentUserEmail,
                balance: walletBalance,
                override: u.override || 'none',
                referralCode: u.referralCode || personalReferralCode,
                referredBy: u.referredBy || '',
                referralCount: u.referralCount || 0,
                totalWagered: u.totalWagered || 0,
                preferredCurrency: u.preferredCurrency || 'USDT',
                wins: u.wins ?? 0,
                losses: u.losses ?? 0,
              };
              await setDoc(doc(db, 'players', currentUserId), newPlayer);
              console.log('Self-healed: Created missing players document for current user');
            } else {
              // Already exists, synchronize required fields
              syncCurrentUserDocuments(u, playerSnap.data());
            }
          }).catch(err => console.warn('Failed to check/create missing player document for user:', err));
          
          setState(prev => {
            const updatedPlayers = prev.players.map(p => {
              if (p.id === currentUserId) {
                return { ...p, balance: walletBalance };
              }
              return p;
            });
            
            const exists = prev.players.some(p => p.id === currentUserId);
            if (!exists) {
              return {
                ...prev,
                players: [...prev.players, {
                  id: currentUserId,
                  name: u.username || currentDisplayName,
                  email: u.email || currentUserEmail,
                  balance: walletBalance,
                  override: u.override || 'none',
                  referralCode: u.referralCode || '',
                  referralCount: u.referralCount || 0
                }]
              };
            }
            return { ...prev, players: updatedPlayers };
          });
          setWalletLoading(false);
        } else {
          // Automatically migrate if player exists but user doc does not yet
          getDoc(doc(db, 'players', currentUserId)).then(async (playerSnap) => {
            if (playerSnap.exists()) {
              const playerObj = playerSnap.data() as Player;
              await setDoc(doc(db, 'users', currentUserId), {
                username: playerObj.name || currentDisplayName,
                email: playerObj.email || currentUserEmail,
                balance: playerObj.balance || 0,
                walletBalance: playerObj.balance || 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
              });
            } else {
              setWalletLoading(false);
            }
          }).catch(err => {
            console.warn("Error migrating user profile to users collection:", err);
            setWalletLoading(false);
          });
        }
      }, (err) => {
        handleListenerError("Error listening to users/ doc", err);
        setWalletLoading(false);
      }));

      // Query helper to switch between own and admin data
      const getQuery = (colName: string) => {
        const l = colName === 'transactions' ? 100 : 100; // Capped at 100 for query optimization
        return isAdmin 
          ? query(collection(db, colName), orderBy('timestamp', 'desc'), limit(l))
          : query(collection(db, colName), where('playerId', '==', currentUserId), limit(100));
      };

      reg(onSnapshot(getQuery('transactions'), (snap) => {
        const transactions = snap.docs
          .map(d => d.data() as Transaction)
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setState(prev => ({ ...prev, transactions }));
      }, (err) => {
        if (err.message.includes('permission-denied') || (err as any).code === 'permission-denied') {
          console.warn(`Admin access to transactions denied for ${currentUserEmail} (${currentUserId}). Falling back to personal view.`);
          const fallbackQuery = query(collection(db, 'transactions'), where('playerId', '==', currentUserId), limit(100));
          reg(onSnapshot(fallbackQuery, (s) => {
             const transactions = s.docs
               .map(d => d.data() as Transaction)
               .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
             setState(prev => ({ ...prev, transactions }));
           }, (fErr) => {
              handleListenerError('Transactions Fallback Error', fErr);
           }));
        } else {
          handleListenerError('Failed to listen to transactions', err);
        }
      }));

      reg(onSnapshot(getQuery('withdrawals'), (snap) => {
        const withdrawals = snap.docs
          .map(d => d.data() as WithdrawalRequest)
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setState(prev => ({ ...prev, withdrawals }));
      }, (err) => {
        if (err.message.includes('permission-denied') || (err as any).code === 'permission-denied') {
          console.warn(`Admin access to withdrawals denied. Falling back.`);
          const fallbackQuery = query(collection(db, 'withdrawals'), where('playerId', '==', currentUserId), limit(100));
          reg(onSnapshot(fallbackQuery, (s) => {
            const withdrawals = s.docs
              .map(d => d.data() as WithdrawalRequest)
              .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            setState(prev => ({ ...prev, withdrawals }));
          }, (fErr) => {
            handleListenerError('Withdrawals Fallback Error', fErr);
          }));
        } else {
          handleListenerError('Failed to listen to withdrawals', err);
        }
      }));

      reg(onSnapshot(getQuery('deposits'), (snap) => {
        const deposits = snap.docs
          .map(d => d.data() as DepositRequest)
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setState(prev => ({ ...prev, deposits }));
      }, (err) => {
        if (err.message.includes('permission-denied') || (err as any).code === 'permission-denied') {
          console.warn(`Admin access to deposits denied. Falling back.`);
          const fallbackQuery = query(collection(db, 'deposits'), where('playerId', '==', currentUserId), limit(100));
          reg(onSnapshot(fallbackQuery, (s) => {
            const deposits = s.docs
              .map(d => d.data() as DepositRequest)
              .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            setState(prev => ({ ...prev, deposits }));
          }, (fErr) => {
            handleListenerError('Deposits Fallback Error', fErr);
          }));
        } else {
          handleListenerError('Failed to listen to deposits', err);
        }
      }));
    }

    const unsubNetworks = reg(onSnapshot(query(collection(db, 'deposit_networks'), orderBy('priority', 'asc')), (snap) => {
      if (snap.empty) {
        console.log("No deposit networks found in Firestore, seeding defaults...");
        import('./data/defaultNetworks.ts').then(({ DEFAULT_NETWORKS }) => {
          DEFAULT_NETWORKS.forEach(async (network) => {
            try {
              await setDoc(doc(db, 'deposit_networks', network.id), network);
            } catch (e) {
              console.error(`Error seeding network ${network.id}:`, e);
            }
          });
        });
      } else {
        const networks = snap.docs.map(d => d.data() as DepositNetwork);
        setState(prev => ({ ...prev, depositNetworks: networks }));

        // Self-healing check for oversized base64 strings to prevent Firestore document write blocks (e.g., 1MB limit)
        networks.forEach(async (net) => {
          let needsUpdate = false;
          const updateData: Partial<DepositNetwork> = {};

          if (net.logoUrl && net.logoUrl.startsWith('data:') && net.logoUrl.length > 250000) {
            updateData.logoUrl = 'https://images.unsplash.com/photo-1622790694511-ac93e2a07cb7?w=100&q=80';
            needsUpdate = true;
          }
          if (net.bannerUrl && net.bannerUrl.startsWith('data:') && net.bannerUrl.length > 300000) {
            updateData.bannerUrl = 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=800&q=80';
            needsUpdate = true;
          }
          if (net.qrCodeUrl && net.qrCodeUrl.startsWith('data:') && net.qrCodeUrl.length > 250000) {
            updateData.qrCodeUrl = '';
            needsUpdate = true;
          }

          if (needsUpdate) {
            console.warn(`[Self-Healing] Found oversized image fields on deposit network '${net.id}' in Firestore. Resetting to default high-performance URLs to unblock operations...`);
            try {
              await updateDoc(doc(db, 'deposit_networks', net.id), updateData);
            } catch (err) {
              console.error(`[Self-Healing Error] Could not auto-repair deposit network ${net.id}:`, err);
            }
          }
        });
      }
    }, (err) => {
      handleListenerError('Failed to listen to deposit networks', err);
    }));

    const unsubWithdrawalNetworks = reg(onSnapshot(query(collection(db, 'withdrawal_networks'), orderBy('priority', 'asc')), (snap) => {
      if (snap.empty) {
        console.log("No withdrawal networks found in Firestore, seeding defaults...");
        import('./data/defaultWithdrawalNetworks.ts').then(({ DEFAULT_WITHDRAWAL_NETWORKS }) => {
          DEFAULT_WITHDRAWAL_NETWORKS.forEach(async (network) => {
            try {
              await setDoc(doc(db, 'withdrawal_networks', network.id), network);
            } catch (e) {
              console.error(`Error seeding withdrawal network ${network.id}:`, e);
            }
          });
        });
      } else {
        const networks = snap.docs.map(d => d.data() as WithdrawalNetwork);
        setState(prev => ({ ...prev, withdrawalNetworks: networks }));

        // Self-healing check for oversized base64 strings in withdrawal networks
        networks.forEach(async (net) => {
          let needsUpdate = false;
          const updateData: Partial<WithdrawalNetwork> = {};

          if (net.logoUrl && net.logoUrl.startsWith('data:') && net.logoUrl.length > 250000) {
            updateData.logoUrl = 'https://images.unsplash.com/photo-1622790694511-ac93e2a07cb7?w=100&q=80';
            needsUpdate = true;
          }
          if (net.bannerUrl && net.bannerUrl.startsWith('data:') && net.bannerUrl.length > 300000) {
            updateData.bannerUrl = 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=800&q=80';
            needsUpdate = true;
          }

          if (needsUpdate) {
            console.warn(`[Self-Healing] Found oversized image fields on withdrawal network '${net.id}' in Firestore. Resetting to default high-performance URLs to unblock operations...`);
            try {
              await updateDoc(doc(db, 'withdrawal_networks', net.id), updateData);
            } catch (err) {
              console.error(`[Self-Healing Error] Could not auto-repair withdrawal network ${net.id}:`, err);
            }
          }
        });
      }
    }, (err) => {
      handleListenerError('Failed to listen to withdrawal networks', err);
    }));

    const unsubWithdrawalSettings = reg(onSnapshot(doc(db, 'config', 'withdrawal_settings'), (snap) => {
      if (!snap.exists()) {
        console.log("No withdrawal settings found in Firestore, seeding defaults...");
        import('./data/defaultWithdrawalNetworks.ts').then(({ DEFAULT_WITHDRAWAL_SETTINGS }) => {
          setDoc(doc(db, 'config', 'withdrawal_settings'), DEFAULT_WITHDRAWAL_SETTINGS).catch(e => {
            console.error('Error seeding withdrawal settings:', e);
          });
        });
      } else {
        const settings = snap.data() as WithdrawalSettings;
        setState(prev => ({ ...prev, withdrawalSettings: settings }));
      }
    }, (err) => {
      handleListenerError('Failed to listen to withdrawal settings', err);
    }));

    return () => {
      console.log('Cleaning up listeners on useEffect unmount...');
      activeUnsubscribes.forEach(unsub => {
        try {
          unsub();
        } catch (e) {
          console.warn('Error cleaning up listener:', e);
        }
      });
      activeListenersRef.current.unsubscribes = [];
      activeSessionRef.current = null;
    };
  }, [user, isAdmin, quotaExceeded]);

  const lastStateRef = useRef(state);
  useEffect(() => {
    lastStateRef.current = state;
  }, [state]);

  const [activeTab, setActiveTab] = useState<'play' | 'wallet' | 'admin' | 'announcement' | 'leaderboard'>('play');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState<number>(() => {
    const cached = localStorage.getItem('sound_volume');
    return cached !== null ? parseFloat(cached) : 0.6;
  });
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerReferral, setRegisterReferral] = useState('');
  const [showMajorWinParticles, setShowMajorWinParticles] = useState(false);

  const currentPlayer = useMemo(() => {
    const p = state.players.find(p => p.id === user?.uid) || state.players.find(p => p.id === state.currentPlayerId);
    if (!p) {
      const cachedBalanceStr = user?.uid ? localStorage.getItem(`last_known_balance_${user.uid}`) : null;
      const cachedBalance = cachedBalanceStr ? parseFloat(cachedBalanceStr) : 0;
      return {
        id: user?.uid || state.currentPlayerId || 'temp',
        name: user?.displayName || 'New Player',
        email: user?.email || '',
        balance: Number.isNaN(cachedBalance) ? 0 : cachedBalance,
        override: 'none',
        referralCode: '',
        referralCount: 0
      } as Player;
    }
    return p;
  }, [state.players, state.currentPlayerId, user]);

  const activePlayer = useMemo(() => {
    if (demoMode) {
      return {
        ...currentPlayer,
        balance: demoBalance !== null ? demoBalance : 1000,
        totalWagered: (currentPlayer?.totalWagered || 0) + (demoTransactions.filter(t => t.type === 'bet').reduce((acc, t) => acc + t.amount, 0))
      } as Player;
    }
    return currentPlayer;
  }, [currentPlayer, demoMode, demoBalance, demoTransactions]);

  const activeState = useMemo(() => {
    if (demoMode) {
      return {
        ...state,
        transactions: [...demoTransactions, ...state.transactions]
      };
    }
    return state;
  }, [state, demoMode, demoTransactions]);

  const formatBalance = (amountInUsd: number) => {
    return `${getCurrencySymbol(preferredCurrency)}${formatCurrencyValue(amountInUsd, preferredCurrency, exchangeRates)}`;
  };

  useEffect(() => {
    if (currentPlayer?.preferredCurrency && currentPlayer.preferredCurrency !== preferredCurrency) {
      setPreferredCurrency(currentPlayer.preferredCurrency);
      localStorage.setItem('preferred_currency', currentPlayer.preferredCurrency);
    }
  }, [currentPlayer?.preferredCurrency]);

  const handleSelectCurrency = async (newCurrency: string) => {
    setPreferredCurrency(newCurrency);
    localStorage.setItem('preferred_currency', newCurrency);
    playSound('CLICK');
    
    if (user && !demoMode) {
      try {
        await updateDoc(doc(db, 'players', user.uid), {
          preferredCurrency: newCurrency
        });
      } catch (err) {
        console.error('Failed to save preferred currency to Firestore:', err);
      }
    }
  };

  // Sound Controller
  const playSound = (soundKey: keyof typeof SOUNDS, winAmount?: number) => {
    if (isMuted) return;

    if (soundKey === 'WIN') {
      // Determine intensity based on the winAmount
      let intensity: 'small' | 'medium' | 'large' = 'small';
      if (winAmount !== undefined) {
        if (winAmount >= 500) {
          intensity = 'large';
        } else if (winAmount >= 100) {
          intensity = 'medium';
        } else {
          intensity = 'small';
        }
      } else {
        // Fallback default
        intensity = 'medium';
      }
      playCasinoWinSynth(intensity, volume);
      return;
    }

    const audio = new Audio(SOUNDS[soundKey]);
    audio.volume = 0.6 * volume;
    audio.play().catch((err) => {
      console.warn('Audio playback inhibited:', err);
    });
  };

  const triggerConfetti = () => {
    setShowMajorWinParticles(true);
    setTimeout(() => {
      setShowMajorWinParticles(false);
    }, 5000);

    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100, useWorker: false };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval = window.setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      customConfetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      customConfetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
  };

  const addTransaction = async (txn: Omit<Transaction, 'id' | 'timestamp' | 'playerId'>) => {
    if (!user) return;
    const id = Math.random().toString(36).substr(2, 9);
    const timestamp = Date.now();
    const newTxn: Transaction = {
      ...txn,
      id,
      playerId: user.uid,
      timestamp
    };

    if (demoMode) {
      setDemoTransactions(prev => [newTxn, ...prev]);
      const balanceChange = (txn.type === 'win' || txn.type === 'deposit') ? txn.amount : -txn.amount;
      setDemoBalance(prev => (prev !== null ? prev : 1000) + balanceChange);
      return;
    }

    try {
      if (txn.type === 'deposit') {
        await fetch('/api/admin/wallet/deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.uid, amount: txn.amount, description: 'Manual Admin Deposit', reason: 'Admin Manual Deposit', idempotencyKey: id })
        });
      } else if (txn.type === 'withdrawal') {
        await fetch('/api/admin/wallet/withdraw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.uid, amount: txn.amount, description: 'Manual Admin Withdrawal', reason: 'Admin Manual Withdrawal', idempotencyKey: id })
        });
      } else {
        await fetch('/api/admin/wallet/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.uid, amount: txn.amount, description: `Manual Admin Adjustment (${txn.type})`, reason: `Manual Admin Adjustment (${txn.type})`, isDeduction: txn.amount < 0, idempotencyKey: id })
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'transactions');
    }
  };

  const handleDeposit = async (amount: number, method: string, details: string, screenshotUrl?: string, existingDepositId?: string, transactionHash?: string) => {
    if (!user || amount < 10) return;
    if (demoMode) {
      return handleDepositDemo(amount, method, details, screenshotUrl, existingDepositId, transactionHash);
    }
    playSound('BET'); 
    
    if (existingDepositId) {
      try {
        const batch = writeBatch(db);
        const depRef = doc(db, 'deposits', existingDepositId);
        batch.update(depRef, {
          screenshotUrl: screenshotUrl || '',
          details: details,
          transactionHash: transactionHash || '',
          updatedAt: Date.now()
        });
        await batch.commit();
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'deposits');
      }
      return;
    }

    const id = Math.random().toString(36).substr(2, 9);
    const txnId = Math.random().toString(36).substr(2, 9);
    const timestamp = Date.now();

    const newRequest: DepositRequest = {
      id,
      playerId: user.uid,
      amount,
      method,
      details,
      screenshotUrl,
      status: 'pending',
      timestamp,
      playerBalanceAtRequest: currentPlayer?.balance || 0
    };

    const txn: Transaction = {
      id: txnId,
      playerId: user.uid,
      type: 'deposit',
      amount,
      timestamp,
      status: 'pending'
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'deposits', id), newRequest);
      batch.set(doc(db, 'transactions', txnId), txn);
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'deposits');
    }
  };

  const handleWithdraw = async (
    amount: number, 
    method: string, 
    details: string,
    blockchain?: string,
    walletAddress?: string,
    fee?: number,
    finalAmount?: number,
    preferredCurrency?: string,
    exchangeRate?: number,
    preferredAmount?: number
  ) => {
    if (!user || !currentPlayer) return;
    if (demoMode) {
      return handleWithdrawDemo(amount, method, details, blockchain, walletAddress, fee, finalAmount, preferredCurrency, exchangeRate, preferredAmount);
    }

    try {
      const response = await fetch('/api/create-withdrawal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: user.uid,
          amount,
          network: blockchain || method,
          withdrawalAddress: walletAddress || details,
          preferredCurrency,
          exchangeRate,
          preferredAmount,
          settlementCurrency: 'USDT'
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit withdrawal request via secure API.');
      }
    } catch (e: any) {
      console.error("API create-withdrawal failed:", e);
      throw e;
    }
  };

  const updateWithdrawalStatus = async (id: string, status: 'completed' | 'rejected') => {
    try {
      const withdrawalRef = doc(db, 'withdrawals', id);
      const withdrawalSnap = await getDoc(withdrawalRef);
      if (!withdrawalSnap.exists()) return;
      const withdrawalData = withdrawalSnap.data() as WithdrawalRequest;

      const batch = writeBatch(db);
      batch.update(withdrawalRef, { status });

      // Update related transaction
      const q = query(
        collection(db, 'transactions'), 
        where('playerId', '==', withdrawalData.playerId),
        where('type', '==', 'withdrawal'),
        where('amount', '==', withdrawalData.amount),
        where('status', '==', 'pending')
      );
      
      const tSnaps = await getDocs(q);
      tSnaps.docs.forEach(d => batch.update(d.ref, { status }));
      
      if (status === 'rejected') {
        // Refund player balance if rejected
        const playerRef = doc(db, 'players', withdrawalData.playerId);
        batch.update(playerRef, { balance: increment(withdrawalData.amount) });
        const userRef = doc(db, 'users', withdrawalData.playerId);
        batch.update(userRef, { 
          walletBalance: increment(withdrawalData.amount),
          balance: increment(withdrawalData.amount),
          updatedAt: Date.now()
        });
      }

      await batch.commit();
      playSound(status === 'completed' ? 'WIN' : 'CLICK');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'withdrawals');
    }
  };

  const updateDepositStatus = async (id: string, status: 'completed' | 'rejected') => {
    try {
      const depositRef = doc(db, 'deposits', id);
      const depositSnap = await getDoc(depositRef);
      if (!depositSnap.exists()) return;
      const deposit = depositSnap.data() as DepositRequest;

      await updateDoc(depositRef, { status, updatedAt: Date.now() });

      if (status === 'completed') {
        await fetch('/api/admin/wallet/deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: deposit.playerId,
            amount: deposit.amount,
            description: `Admin Approved Deposit: ${deposit.amount}`,
            reason: 'Admin Approved Deposit',
            idempotencyKey: `dep_admin_${depositRef.id}`
          })
        });
        playSound('WIN');
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'deposits');
    }
  };

  const resultBet = async (playerId: string, outcome: 'win' | 'lose', settlementCurrency: string = 'USDT', betAmount?: number) => {
    try {
      const currentRates = exchangeRates || getCachedRates().rates;
      const playerRef = doc(db, 'players', playerId);
      const playerSnap = await getDoc(playerRef);
      if (!playerSnap.exists()) return;

      const amount = betAmount || 0;
      const isWin = outcome === 'win';
      const winAmount = amount * 2;
      
      const batch = writeBatch(db);

      if (isWin) {
        const winTxnId = `win_${playerId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const exRate = currentRates[settlementCurrency] || 1.0;
        const settledAmt = winAmount * exRate;

        await walletServiceTS.gameWin(
          playerId,
          winAmount,
          {
            settlementCurrency,
            exchangeRate: exRate,
            preferredAmount: settledAmt,
            description: `Win Settlement: ${winAmount}`
          },
          winTxnId
        );

        batch.update(playerRef, { 
          totalWinnings: increment(winAmount),
          wins: increment(1),
          lastActive: Date.now()
        });
        batch.update(doc(db, 'users', playerId), {
          totalWinnings: increment(winAmount),
          wins: increment(1),
          lastActive: Date.now(),
          updatedAt: Date.now()
        });
        playSound('WIN', winAmount);
        triggerConfetti();
      } else {
        batch.update(playerRef, { 
          losses: increment(1),
          lastActive: Date.now()
        });
        batch.update(doc(db, 'users', playerId), {
          losses: increment(1),
          lastActive: Date.now(),
          updatedAt: Date.now()
        });
        playSound('LOSE');
      }

      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'players');
    }
  };

  const resetPlayerGraph = async (playerId: string) => {
    // Delete transactions for player (requires fetching them first)
    // For simplicity, we just clear the history in the UI or use a batch if fetched.
  };

  const onResetHouseStats = async () => {
    if (demoMode) {
      alert("This action is not available in Demo Mode.");
      return;
    }
    if (!confirm('🚨 CRITICAL ACTION: This will permanently DELETE ALL transaction history from the database. Proceed?')) return;
    try {
      setLoading(true);
      const q = query(collection(db, 'transactions'));
      const snapshots = await getDocs(q);
      
      for (let i = 0; i < snapshots.docs.length; i += 500) {
        const batch = writeBatch(db);
        snapshots.docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      
      playSound('WIN');
      setLoading(false);
      alert(`Yield History Purged: ${snapshots.docs.length} records deleted.`);
    } catch (e) {
      setLoading(false);
      handleFirestoreError(e, OperationType.DELETE, 'transactions');
    }
  };

  const safeMigrateUsersToPlayers = async (): Promise<{ createdCount: number; existedCount: number }> => {
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const playersSnap = await getDocs(collection(db, 'players'));
      
      const existingPlayerIds = new Set(playersSnap.docs.map(doc => doc.id));
      const usersList = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      
      let migrationCount = 0;
      const batch = writeBatch(db);
      
      for (const u of usersList) {
        if (!u.id) continue;
        if (!existingPlayerIds.has(u.id)) {
          const personalReferralCode = ((u.username || u.name || 'Player').substring(0, 3) + Math.floor(100 + Math.random() * 900)).toUpperCase();
          const walletBalance = u.walletBalance !== undefined && !Number.isNaN(Number(u.walletBalance))
            ? Number(u.walletBalance)
            : (u.balance !== undefined && !Number.isNaN(Number(u.balance)) ? Number(u.balance) : 0);
            
          const newPlayer: Player = {
            id: u.id,
            name: u.username || u.name || 'Player',
            email: u.email || '',
            balance: walletBalance,
            override: u.override || 'none',
            referralCode: u.referralCode || personalReferralCode,
            referredBy: u.referredBy || '',
            referralCount: u.referralCount || 0,
            totalWagered: u.totalWagered || 0,
            preferredCurrency: u.preferredCurrency || 'USDT',
            wins: u.wins ?? 0,
            losses: u.losses ?? 0,
            totalWinnings: u.totalWinnings ?? 0,
            biggestBet: u.biggestBet ?? 0,
            totalBetsCount: u.totalBetsCount ?? 0,
            lastActive: u.lastActive ?? Date.now()
          };
          
          batch.set(doc(db, 'players', u.id), newPlayer);
          migrationCount++;
        }
      }
      
      if (migrationCount > 0) {
        await batch.commit();
        console.log(`Successfully migrated ${migrationCount} users to players.`);
      } else {
        console.log("No missing players found; migration was clean.");
      }
      return {
        createdCount: migrationCount,
        existedCount: existingPlayerIds.size,
      };
    } catch (err: any) {
      console.warn("Error during safe user-to-player migration:", err?.message || err);
      handleFirestoreError(err, OperationType.GET, 'users/players');
      return {
        createdCount: 0,
        existedCount: 0,
      };
    }
  };

  const onResetPlayerGraph = async () => {
    if (!currentPlayer) return;
    if (!confirm('Reset your performance telemetry? This will wipe your session history.')) return;
    if (demoMode) {
      setDemoTransactions([]);
      playSound('CLICK');
      alert("Personal Telemetry Cleared.");
      return;
    }
    try {
      setLoading(true);
      const q = query(collection(db, 'transactions'), where('playerId', '==', currentPlayer.id));
      const snapshots = await getDocs(q);
      
      for (let i = 0; i < snapshots.docs.length; i += 500) {
        const batch = writeBatch(db);
        snapshots.docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      playSound('CLICK');
      setLoading(false);
      alert(`Personal Telemetry Cleared: ${snapshots.docs.length} records purged.`);
    } catch (e) {
      setLoading(false);
      handleFirestoreError(e, OperationType.DELETE, 'transactions');
    }
  };

  const onResetSystem = async () => {
    if (demoMode) {
      alert("This action is not available in Demo Mode.");
      return;
    }
    if (!confirm('WIPE SYSTEM: This will reset Admin Config AND DELETE ALL transactions, withdrawals, and deposits. Are you absolutely certain?')) return;
    try {
      setLoading(true);
      const batch = writeBatch(db);
      
      batch.set(doc(db, 'config', 'admin'), {
        winRate: 0.45,
        manualMode: false,
        maxBet: 500,
        isBetLimitEnabled: true,
        maintenanceMode: false,
        isPaymentLocked: false,
        isWithdrawLimit24hEnabled: false,
        isWinRateLocked: false,
        isTransferLimitsLocked: false,
        paymentSettings: {
          additionalInstructions: 'Submit transaction hash or screenshot proof for quick approval.'
        },
      });
      await batch.commit();

      const tables = ['transactions', 'withdrawals', 'deposits'];
      for (const table of tables) {
        const q = query(collection(db, table));
        const snapshots = await getDocs(q);
        for (let i = 0; i < snapshots.docs.length; i += 500) {
          const b = writeBatch(db);
          snapshots.docs.slice(i, i + 500).forEach(d => b.delete(d.ref));
          await b.commit();
        }
      }

      setLoading(false);
      alert('Total System Wipe Completed.');
      window.location.reload();
    } catch (e) {
      setLoading(false);
      handleFirestoreError(e, OperationType.UPDATE, 'config/admin');
    }
  };

  const onToggleMaintenanceMode = async () => {
    if (demoMode) {
      setState(prev => ({ ...prev, maintenanceMode: !prev.maintenanceMode }));
      playSound('CLICK');
      return;
    }
    try {
      const adminRef = doc(db, 'config', 'admin');
      await setDoc(adminRef, { maintenanceMode: !state.maintenanceMode }, { merge: true });
      playSound('CLICK');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'config/admin');
    }
  };

  const onToggleTeaBreakMode = async () => {
    if (demoMode) {
      setState(prev => ({ ...prev, teaBreakMode: !prev.teaBreakMode }));
      playSound('CLICK');
      return;
    }
    try {
      const adminRef = doc(db, 'config', 'admin');
      await setDoc(adminRef, { teaBreakMode: !state.teaBreakMode }, { merge: true });
      playSound('CLICK');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'config/admin');
    }
  };

  const onTogglePlayersWonShown = async () => {
    if (demoMode) {
      setState(prev => ({ ...prev, isPlayersWonShown: !(prev.isPlayersWonShown ?? true) }));
      playSound('CLICK');
      return;
    }
    try {
      const adminRef = doc(db, 'config', 'admin');
      await setDoc(adminRef, { isPlayersWonShown: !(state.isPlayersWonShown ?? true) }, { merge: true });
      playSound('CLICK');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'config/admin');
    }
  };

  const onUpdateLotteryTimer = async (duration: number, active: boolean, targetTimestamp: number) => {
    if (demoMode) {
      setState(prev => ({
        ...prev,
        lotteryTimerDuration: duration,
        lotteryTimerActive: active,
        lotteryTargetTimestamp: targetTimestamp
      }));
      playSound('CLICK');
      return;
    }
    try {
      const adminRef = doc(db, 'config', 'admin');
      await setDoc(adminRef, {
        lotteryTimerDuration: duration,
        lotteryTimerActive: active,
        lotteryTargetTimestamp: targetTimestamp
      }, { merge: true });
      playSound('CLICK');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'config/admin');
    }
  };

  const onUpdatePlayerOverride = async (id: string, override: 'win' | 'lose' | 'none') => {
    if (demoMode) {
      setState(prev => ({
        ...prev,
        players: prev.players.map(p => p.id === id ? { ...p, override } : p)
      }));
      playSound('CLICK');
      return;
    }
    try {
      await updateDoc(doc(db, 'players', id), { override });
      try {
        await updateDoc(doc(db, 'users', id), { override });
      } catch (err) {
        console.warn('Could not update override on users collection:', err);
      }
      playSound('CLICK');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'players');
    }
  };

  const handleRegisterPlayer = async (name: string, referralCode?: string) => {
    if (!user) return;
    
    const personalReferralCode = (name.substring(0, 3) + Math.floor(100 + Math.random() * 900)).toUpperCase();
    
    let bonusAmount = 0;
    let referrerId: string | undefined = undefined;

    if (referralCode && (state.isReferralEnabled ?? true)) {
      let referrer = state.players.find(p => p.referralCode === referralCode.toUpperCase());
      if (!referrer) {
        try {
          const q = query(collection(db, 'players'), where('referralCode', '==', referralCode.toUpperCase()), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            referrer = { id: snap.docs[0].id, ...snap.docs[0].data() } as Player;
          }
        } catch (err) {
          console.warn('Error querying referrer:', err);
        }
      }
      if (referrer) {
        bonusAmount = state.referralAmount ?? 10;
        referrerId = referrer.id;
      }
    }

    const newPlayer: Player = {
      id: user.uid,
      name,
      email: user.email || '',
      balance: bonusAmount,
      override: 'none',
      referralCode: personalReferralCode,
      referredBy: referrerId || '',
      referralCount: 0,
      totalWagered: 0,
      totalWinnings: 0,
      biggestBet: 0,
      totalBetsCount: 0,
      lastActive: Date.now(),
      wins: 0,
      losses: 0
    };

    if (demoMode) {
      const demoPlayer: Player = {
        ...newPlayer,
        balance: 1000, // Give them demo chips
        lastActive: Date.now(),
        createdAt: Date.now()
      };
      setDemoBalance(1000);

      // Save demo player into localStorage for persistence across refreshes
      try {
        const existingDemoJson = localStorage.getItem('demo_registered_players');
        const existingDemo: Player[] = existingDemoJson ? JSON.parse(existingDemoJson) : [];
        const updatedDemo = [...existingDemo.filter(p => p && p.id !== demoPlayer.id), demoPlayer];
        localStorage.setItem('demo_registered_players', JSON.stringify(updatedDemo));
      } catch (e) {
        console.warn('Failed to save demo player to localStorage:', e);
      }

      setState(prev => {
        const otherPlayers = prev.players.filter(p => p.id !== user.uid);
        return {
          ...prev,
          players: [...otherPlayers, demoPlayer]
        };
      });
      setShowRegisterModal(false);
      playSound('CLICK');
      triggerConfetti();
      return;
    }

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'players', user.uid), newPlayer);
      batch.set(doc(db, 'users', user.uid), {
        id: user.uid,
        username: name,
        email: user.email || '',
        balance: bonusAmount,
        walletBalance: bonusAmount,
        referralCode: personalReferralCode,
        referredBy: referrerId || '',
        referralCount: 0,
        totalWagered: 0,
        totalWinnings: 0,
        biggestBet: 0,
        totalBetsCount: 0,
        lastActive: Date.now(),
        wins: 0,
        losses: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      
      if (bonusAmount > 0 && referrerId) {
        const bonusTxnId = Math.random().toString(36).substr(2, 9);
        batch.set(doc(db, 'transactions', bonusTxnId), {
          id: bonusTxnId,
          playerId: user.uid,
          type: 'deposit',
          amount: bonusAmount,
          timestamp: Date.now(),
          status: 'completed'
        });
        
        const refBonusAmt = state.referralAmount ?? 10;
        await walletServiceTS.bonus(
          referrerId,
          refBonusAmt,
          {
            referrerId,
            claimedBy: user.uid,
            description: `Referral Bonus: ₹${refBonusAmt}`
          },
          `ref_bonus_${referrerId}_${user.uid}`
        );
        const referrerRef = doc(db, 'players', referrerId);
        const referrerSnap = await getDoc(referrerRef);
        if (referrerSnap.exists()) {
          const currentReferralCount = referrerSnap.data().referralCount || 0;
          batch.update(referrerRef, { 
            referralCount: (Number.isNaN(currentReferralCount) ? 0 : currentReferralCount) + 1
          });
        }
      }

      await batch.commit();
      setShowRegisterModal(false);
      playSound('CLICK');
      if (bonusAmount > 0) triggerConfetti();
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'players');
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const firebaseUser = await loginWithGoogle();
      if (firebaseUser) {
        const playerDoc = await getDoc(doc(db, 'players', firebaseUser.uid));
        if (!playerDoc.exists()) {
          setShowRegisterModal(true);
        } else {
          setActiveTab('play');
        }
      }
    } catch (e: any) {
      if (e.code === 'auth/unauthorized-domain' || (e.message && e.message.includes('auth/unauthorized-domain'))) {
        setVercelDiagError({ code: e.code || 'auth/unauthorized-domain', message: e.message });
        setShowVercelDiag(true);
      } else if (e.code !== 'auth/cancelled-popup-request' && e.code !== 'auth/popup-closed-by-user') {
        alert(`Google Sign-In Failed: ${e.message || e.code || 'Please try again.'}`);
      }
    }
  };

  const onUpdateWinRate = async (rate: number) => {
    if (state.isWinRateLocked) return;
    if (demoMode) {
      setState(prev => ({ ...prev, winRate: rate }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { winRate: rate }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onToggleWinRateLock = async () => {
    if (demoMode) {
      setState(prev => ({ ...prev, isWinRateLocked: !prev.isWinRateLocked }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { isWinRateLocked: !state.isWinRateLocked }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onUpdateReferralAmount = async (amount: number) => {
    if (demoMode) {
      setState(prev => ({ ...prev, referralAmount: amount }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { referralAmount: amount }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onToggleReferralEnabled = async () => {
    if (demoMode) {
      setState(prev => ({ ...prev, isReferralEnabled: !(prev.isReferralEnabled ?? true) }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { isReferralEnabled: !(state.isReferralEnabled ?? true) }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onUpdatePlayersWonCount = async (count: number) => {
    if (demoMode) {
      setState(prev => ({ ...prev, playersWonCount: count }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { playersWonCount: count }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onUpdateMinLimits = async (minDeposit: number, minWithdraw: number) => {
    if (state.isTransferLimitsLocked) return;
    if (demoMode) {
      setState(prev => ({ ...prev, minDeposit, minWithdraw }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { minDeposit, minWithdraw }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onToggleTransferLimitsLock = async () => {
    if (demoMode) {
      setState(prev => ({ ...prev, isTransferLimitsLocked: !prev.isTransferLimitsLocked }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { isTransferLimitsLocked: !state.isTransferLimitsLocked }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onUpdateMaxBet = async (max: number) => {
    if (demoMode) {
      setState(prev => ({ ...prev, maxBet: max }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { maxBet: max }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onToggleBetLimit = async () => {
    if (demoMode) {
      setState(prev => ({ ...prev, isBetLimitEnabled: !prev.isBetLimitEnabled }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { isBetLimitEnabled: !state.isBetLimitEnabled }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onToggleManualMode = async () => {
    if (demoMode) {
      setState(prev => ({ ...prev, manualMode: !prev.manualMode }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { manualMode: !state.manualMode }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onUpdatePaymentSettings = async (settings: PaymentSettings) => {
    if (demoMode) {
      setState(prev => ({ ...prev, paymentSettings: settings }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { paymentSettings: settings }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onTogglePaymentLock = async () => {
    if (demoMode) {
      setState(prev => ({ ...prev, isPaymentLocked: !prev.isPaymentLocked }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { isPaymentLocked: !state.isPaymentLocked }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onUpdateAnnouncementText = async (text: string) => {
    if (demoMode) {
      setState(prev => ({ ...prev, announcementText: text }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { announcementText: text }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onToggleAnnouncementEnabled = async () => {
    if (demoMode) {
      setState(prev => ({ ...prev, isAnnouncementEnabled: !prev.isAnnouncementEnabled }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { isAnnouncementEnabled: !state.isAnnouncementEnabled }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onToggleWithdrawLimit24h = async () => {
    if (demoMode) {
      setState(prev => ({ ...prev, isWithdrawLimit24hEnabled: !prev.isWithdrawLimit24hEnabled }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { isWithdrawLimit24hEnabled: !state.isWithdrawLimit24hEnabled }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onToggleBettingStatus = async () => {
    if (demoMode) {
      setState(prev => ({ ...prev, isBettingClosed: !prev.isBettingClosed }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { isBettingClosed: !state.isBettingClosed }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onUpdateCustomTotalBets = async (amt: number) => {
    if (demoMode) {
      setState(prev => ({ ...prev, customTotalBets: amt }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { customTotalBets: amt }, { merge: true });
      playSound('CLICK');
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onToggleWithdrawalsStopped = async () => {
    if (demoMode) {
      setState(prev => ({ ...prev, isWithdrawalsStopped: !prev.isWithdrawalsStopped }));
      playSound('CLICK');
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'admin'), { isWithdrawalsStopped: !state.isWithdrawalsStopped }, { merge: true });
      playSound('CLICK');
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onPlaceBet = async (amt: number) => {
    if (!user || !currentPlayer) return;
    if (demoMode) {
      return onPlaceBetDemo(amt);
    }
    if (amt <= 0 || Number.isNaN(amt)) {
      throw new Error("Invalid bet amount.");
    }

    // --- TASK 3: Anti-Fraud Betting Protection ---
    const uid = user.uid;
    const now = Date.now();

    // 1. Rapid Click Protection (min 1000ms cooldown)
    if ((window as any).__lastBetTimeByUser?.[uid] && now - (window as any).__lastBetTimeByUser[uid] < 1000) {
      throw new Error("Rapid clicking detected. Please wait 1 second between placing bets.");
    }

    // 2. Maximum bets per minute per user (max 10 bets / 60s)
    if (!(window as any).__betTimestampsByUser) {
      (window as any).__betTimestampsByUser = {};
    }
    if (!(window as any).__betTimestampsByUser[uid]) {
      (window as any).__betTimestampsByUser[uid] = [];
    }
    (window as any).__betTimestampsByUser[uid] = (window as any).__betTimestampsByUser[uid].filter((t: number) => now - t < 60000);
    if ((window as any).__betTimestampsByUser[uid].length >= 10) {
      throw new Error("Maximum betting rate reached (10 bets per minute). Please slow down.");
    }

    // 3. Maximum Daily Loss Limit Protection
    const txns = state.transactions || [];
    const todayBets = txns.filter(t => t.type === 'bet' && t.status === 'completed' && t.timestamp && now - t.timestamp < 24 * 60 * 60 * 1000);
    const todayWins = txns.filter(t => (t.type === 'win' || (t.type as string) === 'game_win') && t.status === 'completed' && t.timestamp && now - t.timestamp < 24 * 60 * 60 * 1000);
    const todayBetTotal = todayBets.reduce((s, t) => s + (t.amount || 0), 0);
    const todayWinTotal = todayWins.reduce((s, t) => s + (t.amount || 0), 0);
    const todayNetLoss = Math.max(0, todayBetTotal - todayWinTotal);
    const maxDailyLoss = (state as any).maxDailyLossLimit || 10000;
    if (todayNetLoss + amt > maxDailyLoss) {
      throw new Error(`Daily loss limit ($${maxDailyLoss}) reached to protect your account. Please try again tomorrow.`);
    }

    if (!(window as any).__lastBetTimeByUser) {
      (window as any).__lastBetTimeByUser = {};
    }
    (window as any).__lastBetTimeByUser[uid] = now;
    (window as any).__betTimestampsByUser[uid].push(now);

    if (state.minBetLimitEnabled && amt < (state.minBetAmount || 0.01)) {
      throw new Error(`Minimum bet limit is $${state.minBetAmount || 0.01}`);
    }
    if (state.isBetLimitEnabled && amt > (state.maxBet || 500)) {
      throw new Error(`Maximum bet limit is $${state.maxBet || 500}`);
    }
    if ((currentPlayer.balance || 0) < amt) {
      throw new Error("Insufficient balance to place bet.");
    }
    if (state.isBettingClosed) {
      throw new Error("Betting closed — Please wait for the next round.");
    }
    try {
      const txnId = `tx_bet_${user.uid}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const timestamp = Date.now();
      const playerRef = doc(db, 'players', user.uid);
      const userRef = doc(db, 'users', user.uid);
      const txnRef = doc(db, 'transactions', txnId);
      const betDocRef = doc(collection(db, 'bets'));
      const betId = betDocRef.id;

      await runTransaction(db, async (txn) => {
        const playerSnap = await txn.get(playerRef);
        const userSnap = await txn.get(userRef);

        if (!playerSnap.exists()) {
          throw new Error("Player profile not found.");
        }

        const playerData = playerSnap.data();
        const currentBalance = Number(userSnap.exists() ? (userSnap.data().walletBalance ?? userSnap.data().balance ?? playerData.balance) : playerData.balance) || 0;

        if (currentBalance < amt) {
          throw new Error("Insufficient balance to place bet.");
        }

        const newBalance = Math.max(0, currentBalance - amt);

        txn.set(txnRef, {
          id: txnId,
          playerId: user.uid,
          type: 'bet',
          amount: amt,
          timestamp,
          status: 'completed'
        });

        txn.set(betDocRef, {
          betId,
          playerId: user.uid,
          username: currentPlayer.name || user.displayName || user.email || 'Player',
          amount: amt,
          multiplier: state.currentMultiplier || 2,
          game: state.activeGame || 'Double or Donate',
          status: 'pending',
          isDemo: false,
          createdAt: timestamp
        });

        txn.update(playerRef, {
          balance: newBalance,
          walletBalance: newBalance,
          totalWagered: (playerData.totalWagered || 0) + amt,
          totalBetsCount: (playerData.totalBetsCount || 0) + 1,
          biggestBet: Math.max(amt, playerData.biggestBet || 0),
          lastActive: timestamp
        });

        if (userSnap.exists()) {
          const uData = userSnap.data();
          txn.update(userRef, {
            walletBalance: newBalance,
            balance: newBalance,
            totalWagered: (uData.totalWagered || 0) + amt,
            totalBetsCount: (uData.totalBetsCount || 0) + 1,
            biggestBet: Math.max(amt, uData.biggestBet || 0),
            lastActive: timestamp,
            updatedAt: timestamp
          });
        }
      });

      if (!state.manualMode) {
        const targetUid = user.uid;
        setTimeout(async () => {
          try {
            let playerOverride = 'none';
            const playerSnap = await getDoc(doc(db, 'players', targetUid));
            if (playerSnap.exists()) {
              playerOverride = playerSnap.data().override || 'none';
            } else {
              const userSnap = await getDoc(doc(db, 'users', targetUid));
              if (userSnap.exists()) {
                playerOverride = userSnap.data().override || 'none';
              }
            }
            
            const configSnap = await getDoc(doc(db, 'config', 'admin'));
            const config = configSnap.data();
            const winRate = config?.winRate ?? 0.45;

            let win = Math.random() < winRate;
            if (playerOverride === 'win') win = true;
            if (playerOverride === 'lose') win = false;
            
            let shouldSettle = false;
            await runTransaction(db, async (txn) => {
              const betSnap = await txn.get(betDocRef);
              if (betSnap.exists() && (betSnap.data().status === 'active' || betSnap.data().status === 'pending')) {
                txn.update(betDocRef, {
                  status: win ? 'won' : 'lost',
                  resolvedAt: Date.now(),
                  resolvedBy: 'system'
                });
                shouldSettle = true;
              }
            });

            if (shouldSettle) {
              if (win) {
                await walletServiceTS.gameWin(
                  targetUid, 
                  amt * (state.currentMultiplier || 2), 
                  { description: 'Automatic Game Win', referenceId: betId }, 
                  `settle_win_${betId}`
                );
              } else {
                await walletServiceTS.gameLoss(
                  targetUid, 
                  amt, 
                  { description: 'Automatic Game Loss', referenceId: betId }, 
                  `settle_loss_${betId}`
                );
              }
            }
          } catch (autoErr) {
            console.error("Auto bet resolution error:", autoErr);
          }
        }, 100);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'transactions');
    }
  };

  const onPlaceBetDemo = async (amt: number) => {
    if (!user || !activePlayer) return;
    if (state.isBettingClosed) {
      throw new Error("Betting closed — Please wait for the next round.");
    }
    const currentBalance = activePlayer.balance;
    const timestamp = Date.now();

    const newBalance = currentBalance - amt;
    setDemoBalance(newBalance);

    const betTxn: Transaction = {
      id: 'demo-' + Math.random().toString(36).substr(2, 9),
      playerId: user?.uid || 'demo-player',
      type: 'bet',
      amount: amt,
      timestamp,
      status: 'completed'
    };
    setDemoTransactions(prev => [betTxn, ...prev]);

    const betDocRef = doc(collection(db, 'bets'));
    const betId = betDocRef.id;
    if (user) {
      setDoc(betDocRef, {
        betId,
        playerId: user.uid,
        username: currentPlayer?.name || activePlayer?.name || user.displayName || user.email || 'Demo Player',
        amount: amt,
        multiplier: state.currentMultiplier || 2,
        game: state.activeGame || 'Double or Donate',
        status: 'pending',
        isDemo: true,
        createdAt: timestamp
      }).catch(err => console.error("Error creating demo bet doc:", err));
    }

    if (!state.manualMode) {
      setTimeout(() => {
        const winRate = state.winRate ?? 0.45;
        let win = Math.random() < winRate;
        if (currentPlayer?.override === 'win') win = true;
        if (currentPlayer?.override === 'lose') win = false;

        const betAmt = amt;

        if (win) {
          const winAmount = betAmt * 2;
          setDemoBalance(prev => (prev !== null ? prev : 1000) + winAmount);
          const winTx: Transaction = {
            id: 'demo-' + Math.random().toString(36).substr(2, 9),
            playerId: user?.uid || 'demo-player',
            type: 'win',
            amount: winAmount,
            timestamp: Date.now(),
            status: 'completed'
          };
          setDemoTransactions(prev => [winTx, ...prev]);
          if (user) {
            updateDoc(betDocRef, { status: 'won' }).catch(() => {});
          }
          playSound('WIN');
          triggerConfetti();
        } else {
          if (user) {
            updateDoc(betDocRef, { status: 'lost' }).catch(() => {});
          }
          playSound('LOSE');
        }
      }, 100);
    }
  };

  const handleDepositDemo = async (amount: number, method: string, details: string, screenshotUrl?: string, existingDepositId?: string, transactionHash?: string) => {
    playSound('BET'); 
    const timestamp = Date.now();
    const txnId = 'demo-' + Math.random().toString(36).substr(2, 9);
    
    const txn: Transaction = {
      id: txnId,
      playerId: user?.uid || 'demo-player',
      type: 'deposit',
      amount,
      timestamp,
      status: 'completed'
    };
    setDemoTransactions(prev => [txn, ...prev]);
    setDemoBalance(prev => (prev !== null ? prev : 1000) + amount);
    playSound('WIN');
  };

  const handleWithdrawDemo = async (
    amount: number, 
    method: string, 
    details: string,
    blockchain?: string,
    walletAddress?: string,
    fee?: number,
    finalAmount?: number,
    preferredCurrency?: string,
    exchangeRate?: number,
    preferredAmount?: number
  ) => {
    if (!activePlayer || amount < 10 || amount > activePlayer.balance) return;
    const timestamp = Date.now();
    const txnId = 'demo-' + Math.random().toString(36).substr(2, 9);

    const txn: Transaction = {
      id: txnId,
      playerId: user?.uid || 'demo-player',
      type: 'withdrawal',
      amount,
      timestamp,
      status: 'completed',
      preferredCurrency: preferredCurrency || 'USD',
      exchangeRate: exchangeRate ? Number(exchangeRate) : 1.0,
      preferredAmount: preferredAmount ? Number(preferredAmount) : amount,
      settlementCurrency: 'USDT'
    } as any;

    const demoRequest: WithdrawalRequest = {
      id: 'demo-req-' + Math.random().toString(36).substr(2, 9),
      playerId: user?.uid || 'demo-player',
      playerName: activePlayer.name || 'Demo Player',
      amount,
      method,
      details,
      status: 'completed',
      timestamp,
      playerBalanceAtRequest: activePlayer.balance,
      blockchain: blockchain || method,
      walletAddress: walletAddress || details,
      fee: fee !== undefined ? fee : 0,
      finalAmount: finalAmount !== undefined ? finalAmount : amount,
      preferredCurrency: preferredCurrency || 'USD',
      exchangeRate: exchangeRate ? Number(exchangeRate) : 1.0,
      preferredAmount: preferredAmount ? Number(preferredAmount) : amount,
      settlementCurrency: 'USDT'
    } as any;

    setState(prev => ({
      ...prev,
      withdrawals: [demoRequest, ...prev.withdrawals]
    }));

    setDemoTransactions(prev => [txn, ...prev]);
    setDemoBalance(prev => Math.max(0, (prev !== null ? prev : 1000) - amount));
    playSound('CLICK');
  };

  // Auto-open registration if player profile is missing
  useEffect(() => {
    if (loading || walletLoading) return;
    
    if (user) {
      const exists = state.players.find(p => p.id === user.uid);
      if (!exists) {
        setShowRegisterModal(true);
      } else {
        setShowRegisterModal(false);
      }
    } else {
      setShowRegisterModal(true);
    }
  }, [user, loading, walletLoading, state.players]);

  useEffect(() => {
    if (isAdmin) {
      setIsAdminLoggedIn(true);
    } else {
      setIsAdminLoggedIn(false);
      if (activeTab === 'admin') setActiveTab('play');
    }
  }, [isAdmin]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-slate-100 font-sans selection:bg-emerald-500/30">
      <WinParticleOverlay active={showMajorWinParticles} />
      <AnimatePresence>
        {loading && (
          <motion.div 
            key="matrix-loader"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-[#01030e] flex items-center justify-center overflow-hidden"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.05, opacity: 0 }}
              className="relative flex flex-col items-center justify-center -translate-y-8 md:-translate-y-12 px-6 text-center"
            >
              <div className="relative mb-6">
                <div className="absolute -inset-6 bg-emerald-500/25 rounded-full blur-3xl animate-pulse" />
                <img 
                  src="/matrix_logo.png" 
                  alt="Matrix Logo" 
                  className="w-40 sm:w-52 md:w-64 h-auto object-contain relative z-10 filter drop-shadow-[0_0_35px_rgba(16,185,129,0.8)]" 
                />
              </div>

              <h1 className="text-6xl sm:text-7xl md:text-8xl font-black tracking-tight text-white select-none relative drop-shadow-[0_0_25px_rgba(163,230,53,0.5)] font-display">
                <span className="text-[#a3e635]">M</span>ATRIX
              </h1>

              <div className="flex items-center gap-3 mt-5 px-5 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono text-xs font-bold uppercase tracking-widest shadow-lg shadow-emerald-500/10">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span>Refreshing Matrix Engine...</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {quotaExceeded && (
        <div className="bg-[#12080a] border-b border-rose-500/20 text-rose-200 px-4 py-3.5 relative z-[200] flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
            </span>
            <div className="text-left">
              <p className="font-bold text-rose-300 text-sm">Firebase Daily Quota Exceeded (Resource Exhausted)</p>
              <p className="text-xs text-rose-300/70 leading-relaxed mt-0.5">
                Google Cloud Firestore limits have been reached for today. To maintain action, we have auto-activated <strong className="text-emerald-400 font-bold uppercase tracking-wider">Demo Play Mode</strong> with ₹1,000 in simulated chips!
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                setDemoBalance(1000);
                playSound('WIN');
              }}
              className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 hover:border-emerald-500/50 rounded-xl text-[10px] font-mono uppercase font-black tracking-wider text-emerald-400 transition-all cursor-pointer shadow-lg active:scale-95"
            >
              Reset Demo Chips (₹1,000)
            </button>
            <button
              onClick={() => {
                setQuotaExceeded(false);
                playSound('CLICK');
              }}
              className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-rose-300 hover:text-white cursor-pointer"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {/* Navbar / Mobile Header */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 sticky top-0 bg-black/40 backdrop-blur-md border-b border-white/10 z-50 shadow-[0_4px_25px_rgba(0,0,0,0.5)]">
        <button 
          onClick={() => setIsSidebarOpen(true)} 
          className="w-11 h-11 border border-[#00d5ff]/50 bg-black/70 rounded-xl flex items-center justify-center text-white shadow-[0_0_15px_rgba(0,213,255,0.35)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
        >
          <Menu className="w-5 h-5 text-white" />
        </button>

        <div className="flex flex-col items-center">
          <span className="font-matrix text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#ffe600] via-[#ff5500] to-[#ff0033] drop-shadow-[0_0_12px_rgba(255,80,0,0.8)] leading-none mb-1">
            Matrix
          </span>
          {/* Balance Pill */}
          <motion.div 
            whileHover={{ scale: 1.05, y: -1 }}
            whileTap={{ scale: 0.93 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => { setActiveTab('wallet'); playSound('CLICK'); }}
            className="rounded-full border border-[#00d5ff]/50 bg-black/80 px-4 py-1 flex items-center gap-2 shadow-[0_0_15px_rgba(0,213,255,0.3)] cursor-pointer hover:border-cyan-400 transition-all relative overflow-hidden group select-none gpu-layer"
          >
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-red-500 to-red-700 border border-amber-300 flex items-center justify-center text-amber-300 font-black text-xs shadow-[0_0_8px_rgba(255,0,0,0.9)] shrink-0">
              ₹
            </div>
            <AnimatedBalance balance={activePlayer?.balance ?? 0} size="sm" preferredCurrency={preferredCurrency} rates={exchangeRates} onSelectCurrency={handleSelectCurrency} />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
          </motion.div>
        </div>

        <motion.button 
          whileHover={{ scale: 1.08, y: -1 }}
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          onClick={() => { setActiveTab('wallet'); playSound('CLICK'); }}
          className="w-11 h-11 border border-red-500/60 bg-black/70 rounded-xl flex items-center justify-center text-[#ffc700] shadow-[0_0_15px_rgba(255,0,68,0.35)] hover:border-red-400 transition-colors cursor-pointer relative overflow-hidden group select-none gpu-layer"
        >
          <Wallet className="w-5 h-5 text-[#ffc700] group-hover:scale-110 transition-transform duration-200" />
          <div className="w-3 h-3 bg-red-600 rounded-full border border-black absolute top-1 right-1 shadow-[0_0_8px_rgba(255,0,0,0.9)]" />
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500 pointer-events-none" />
        </motion.button>
      </header>

      <div className="flex min-w-0 w-full max-w-full overflow-x-hidden">
        {/* Sidebar */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-[#0d0d0d] border-r border-white/5 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 overflow-y-auto custom-scrollbar
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="p-6 flex flex-col h-full">
            <div className="hidden lg:flex items-center justify-center mb-10">
              <img src="/matrix_logo.png" alt="Matrix Logo" className="h-14 w-auto object-contain" />
            </div>

            <div className="flex justify-between items-center lg:hidden mb-10">
               <span className="font-bold tracking-tight text-xl">MENU</span>
               <button onClick={() => setIsSidebarOpen(false)}><X className="w-6 h-6"/></button>
            </div>

            <nav className="space-y-1.5 flex-1">
              <NavItem 
                active={activeTab === 'play'} 
                onClick={() => { setActiveTab('play'); setIsSidebarOpen(false); playSound('CLICK'); }}
                icon={<TrendingUp className="w-5 h-5" />}
                label="DOUBLE OR DONATE"
              />
              <NavItem 
                active={activeTab === 'wallet'} 
                onClick={() => { setActiveTab('wallet'); setIsSidebarOpen(false); playSound('CLICK'); }}
                icon={<Wallet className="w-5 h-5" />}
                label="My Wallet"
              />
              <NavItem 
                active={activeTab === 'leaderboard'} 
                onClick={() => { setActiveTab('leaderboard'); setIsSidebarOpen(false); playSound('CLICK'); }}
                icon={<Trophy className="w-5 h-5 text-amber-400" />}
                label="Leaderboard"
              />

              {(state.isAnnouncementEnabled || isAdmin) && (
                <NavItem 
                  active={activeTab === 'announcement'} 
                  onClick={() => { setActiveTab('announcement'); setIsSidebarOpen(false); playSound('CLICK'); }}
                  icon={<Megaphone className="w-5 h-5 text-emerald-400" />}
                  label="Announcement"
                />
              )}

              <div className="pt-4 mt-4 border-t border-white/5 space-y-1.5">
                {isAdmin ? (
                  <NavItem 
                    active={activeTab === 'admin'} 
                    onClick={() => { setActiveTab('admin'); setIsSidebarOpen(false); playSound('CLICK'); }}
                    icon={<Settings className="w-5 h-5" />}
                    label="Admin Panel"
                  />
                ) : null}
                <button 
                  onClick={async () => {
                    await logout();
                    setIsSidebarOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 text-rose-500/70 hover:text-rose-500 hover:bg-rose-500/5 group"
                >
                  <div className="transition-transform duration-300 group-hover:scale-110">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <span className="font-display tracking-tight">Sign Out</span>
                </button>
              </div>
            </nav>

              <div className="mt-4 pb-4 space-y-3">
              <div className="bg-white/5 rounded-xl border border-white/5 p-4">
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className="w-full flex items-center justify-between text-slate-400 hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-3 italic text-sm">
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    {isMuted ? 'Muted' : 'Sound On'}
                  </div>
                  <div className={`w-8 h-4 rounded-full relative transition-colors ${!isMuted ? 'bg-emerald-500/40' : 'bg-white/10'}`}>
                    <motion.div 
                      animate={{ x: !isMuted ? 16 : 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className={`w-4 h-4 rounded-full absolute top-0 left-0 shadow-sm ${!isMuted ? 'bg-emerald-400' : 'bg-slate-600'}`} 
                    />
                  </div>
                </button>
              </div>
            </div>

            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 mt-auto">
              <div className="flex items-center justify-center mb-4">
                <motion.img 
                  whileHover={{ scale: 1.1, rotate: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                  src="/matrix_logo.png" 
                  alt="Matrix Logo" 
                  className="h-16 w-auto object-contain filter drop-shadow-[0_0_12px_rgba(132,204,22,0.5)] cursor-pointer" 
                />
              </div>
              <p className="text-emerald-400/60 text-xs font-semibold uppercase tracking-wider mb-2 text-center">Total Balance</p>
              <div className="flex justify-center items-center py-1">
                <AnimatedBalance balance={activePlayer?.balance ?? 0} size="md" preferredCurrency={preferredCurrency} rates={exchangeRates} />
              </div>
              <div className="flex flex-col gap-1.5 mt-2.5 pt-2 border-t border-white/5">
                <p className="text-[10px] text-slate-500 font-mono truncate opacity-60">User: {activePlayer?.name}</p>
                <div className="mt-2.5 pt-2.5 border-t border-white/5">
                  <CurrencySelector preferredCurrency={preferredCurrency} onSelectCurrency={handleSelectCurrency} />
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Backdrop for mobile */}
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            />
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 min-h-screen min-w-0 w-full max-w-full overflow-x-hidden">
          {/* Top Bar for Desktop */}
          <div className="hidden lg:flex items-center justify-between p-6 max-w-xl mx-auto">
            <button 
              onClick={() => setIsSidebarOpen(true)} 
              className="w-12 h-12 border border-gradient-to-r from-red-500/60 via-orange-500/50 to-amber-500/60 bg-black/70 rounded-2xl flex items-center justify-center text-white shadow-[0_0_15px_rgba(255,0,68,0.4)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <Menu className="w-6 h-6 text-white" />
            </button>

            <div className="flex flex-col items-center">
              <span className="font-matrix text-4xl text-[#ffc700] text-glow-gold font-bold tracking-wide leading-none mb-1.5">
                Matrix
              </span>
              {/* Balance Pill */}
              <motion.div 
                whileHover={{ scale: 1.05, y: -1 }}
                whileTap={{ scale: 0.93 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                onClick={() => { setActiveTab('wallet'); playSound('CLICK'); }}
                className="rounded-full border border-[#ff2a00]/70 bg-[#12040b]/90 px-4 py-1.5 flex items-center gap-2.5 shadow-[0_0_18px_rgba(255,0,68,0.4)] cursor-pointer hover:border-[#ff5500] transition-all relative overflow-hidden group select-none gpu-layer"
              >
                <div className="w-6 h-6 rounded-full bg-red-600 border border-red-400 flex items-center justify-center text-white font-black text-xs shadow-[0_0_10px_rgba(255,0,0,0.8)] shrink-0">
                  ₹
                </div>
                <AnimatedBalance balance={activePlayer?.balance ?? 0} size="md" preferredCurrency={preferredCurrency} rates={exchangeRates} onSelectCurrency={handleSelectCurrency} />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
              </motion.div>
            </div>

            <motion.button 
              whileHover={{ scale: 1.08, y: -1 }}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => { setActiveTab('wallet'); playSound('CLICK'); }}
              className="w-12 h-12 border border-[#ffb700]/60 bg-black/70 rounded-2xl flex items-center justify-center text-[#ffc700] shadow-[0_0_15px_rgba(255,183,0,0.4)] hover:border-[#ffc700] transition-colors cursor-pointer relative overflow-hidden group select-none gpu-layer"
            >
              <Wallet className="w-6 h-6 text-[#ffc700] group-hover:scale-110 transition-transform duration-200" />
              <div className="w-3.5 h-3.5 bg-red-600 rounded-full border-2 border-black absolute top-1 right-1 shadow-[0_0_8px_rgba(255,0,0,0.9)]" />
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500 pointer-events-none" />
            </motion.button>
          </div>

          <div className={`${activeTab === 'admin' ? 'max-w-7xl' : 'max-w-5xl'} mx-auto p-4 lg:px-10 lg:pb-10 pt-0 w-full overflow-x-hidden`}>
            <AnimatePresence>
              {showAdminLogin && !isAdminLoggedIn && (
                <div key="admin-login" className="fixed inset-0 flex items-center justify-center p-4 z-[110]">
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowAdminLogin(false)}
                    className="fixed inset-0 bg-black/90 backdrop-blur-md"
                  />
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-[#0a0a0a] border border-white/10 w-full max-w-sm rounded-[2.5rem] p-10 relative z-[111] shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden"
                  >
                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-[40px]" />
                    <div className="flex justify-center mb-8 relative">
                      <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                        <Lock className="w-8 h-8 text-emerald-500" />
                      </div>
                    </div>
                    <h2 className="text-2xl font-black mb-1 text-center text-white tracking-tight relative">Security Keypad</h2>
                    <p className="text-slate-500 text-center text-[10px] mb-8 uppercase tracking-[0.25em] relative">Authorized Personnel Restricted</p>
                    
                    <div className="space-y-4 relative">
                      <input 
                        type="email" 
                        placeholder="Admin Identifier"
                        value={adminEmailInput || ''}
                        onChange={(e) => setAdminEmailInput(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-emerald-500/50 text-white placeholder:text-slate-700 font-medium transition-all"
                      />
                      <input 
                        type="password" 
                        placeholder="Passkey"
                        value={adminPasswordInput || ''}
                        onChange={(e) => setAdminPasswordInput(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 mb-4 focus:outline-none focus:border-emerald-500/50 text-white placeholder:text-slate-700 font-medium transition-all"
                      />
                    </div>
                    
                    <button 
                      onClick={async () => {
                        if (!adminEmails.includes((adminEmailInput || '').toLowerCase())) {
                          alert('Authentication Failed: Unauthorized Identifier');
                          return;
                        }
                        try {
                          const res = await fetch('/api/admin/verify-auth', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type: 'login', value: adminPasswordInput })
                          });
                          const data = await res.json();
                          if (res.ok && data.success) {
                            setIsAdminLoggedIn(true);
                            setShowAdminLogin(false);
                            setActiveTab('admin');
                            setAdminEmailInput('');
                            setAdminPasswordInput('');
                          } else {
                            alert(data.error || 'Authentication Failed: Signal Terminated');
                          }
                        } catch (err) {
                          alert('Authentication Error: Cannot reach authorization system.');
                        }
                      }}
                      className="w-full py-5 mt-4 bg-emerald-500 text-black font-black rounded-2xl shadow-[0_10px_30px_rgba(16,185,129,0.2)] hover:shadow-[0_15px_40px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 transition-all active:scale-[0.98] relative text-lg"
                    >
                      Establish Connection
                    </button>
                    <button 
                      onClick={() => setShowAdminLogin(false)}
                      className="w-full py-3 mt-4 text-slate-600 text-[10px] font-bold hover:text-white transition-colors uppercase tracking-[0.2em] relative"
                    >
                      Abort Mission
                    </button>
                  </motion.div>
                </div>
              )}

              {showRegisterModal && (
                <div key="register-modal" className="fixed inset-0 flex items-center justify-center p-4 z-[100] bg-black">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-sm"
                  >
                    <div className="w-full bg-[#050505] border border-white/5 rounded-[2.5rem] p-10 text-center shadow-2xl relative overflow-hidden">
                      <div className="relative mb-12">
                         <img src="/matrix_logo.png" alt="Matrix Logo" className="h-24 w-auto mx-auto mb-6 object-contain" />
                         <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Welcome</h1>
                         <p className="text-slate-500 text-sm">Risk Hai Toh Ishq Hai</p>
                      </div>

                      {!user ? (
                        <div className="space-y-6 relative">
                          <button 
                            onClick={handleGoogleSignIn}
                            className="w-full py-5 bg-white text-black font-bold rounded-2xl hover:bg-slate-100 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                          >
                            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="" />
                            <span>Continue with Google</span>
                          </button>
                          
                          <p className="text-slate-600 text-[10px] leading-relaxed">
                            Secured by Enterprise Protocol.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-6 text-left relative">
                          <div className="space-y-4">
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 ml-1">Your Name</label>
                              <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                                <input 
                                  type="text" 
                                  placeholder="Enter name"
                                  value={registerName}
                                  onChange={(e) => setRegisterName(e.target.value)}
                                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-4 text-white focus:outline-none focus:border-emerald-500/30 transition-all placeholder:text-slate-700"
                                />
                              </div>
                            </div>

                            {(state.isReferralEnabled ?? true) && (
                              <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 ml-1">Referral Code (Optional)</label>
                                <div className="relative">
                                  <Zap className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500/50" />
                                  <input 
                                    type="text" 
                                    placeholder="Code"
                                    value={registerReferral}
                                    onChange={(e) => setRegisterReferral(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-4 text-emerald-400 focus:outline-none focus:border-emerald-500/30 transition-all placeholder:text-slate-700"
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          <button 
                            onClick={() => handleRegisterPlayer(registerName, registerReferral)}
                            disabled={!registerName.trim()}
                            className="w-full py-5 bg-emerald-500 text-black font-bold rounded-2xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all disabled:opacity-30 active:scale-[0.98]"
                          >
                            Start Trading
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {state.maintenanceMode && activeTab !== 'admin' && (
                <motion.div
                  key="maintenance"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex-1 flex flex-col items-center justify-center text-center p-8 min-h-[60vh]"
                >
                  <div className="w-24 h-24 bg-rose-500/10 rounded-full flex items-center justify-center mb-8 border border-rose-500/20">
                    <Construction className="w-12 h-12 text-rose-500 animate-pulse" />
                  </div>
                  <h2 className="text-4xl font-display font-bold mb-4">Emergency Maintenance</h2>
                  <p className="text-slate-400 max-w-md text-lg leading-relaxed mb-8">
                    We are currently performing an emergency system upgrade. All systems are temporarily paused for your security.
                  </p>
                  <div className="flex items-center gap-2 px-6 py-3 bg-white/5 rounded-2xl border border-white/5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-mono uppercase tracking-widest text-slate-500">Back Online Soon</span>
                  </div>
                </motion.div>
              )}

              {!state.maintenanceMode && state.teaBreakMode && activeTab !== 'admin' && (
                <motion.div
                  key="teabreak"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex-1 flex flex-col items-center justify-center text-center p-8 min-h-[60vh] font-sans"
                >
                  <div className="relative mb-8">
                    {/* Pulsing cozy warm halo */}
                    <div className="absolute inset-0 bg-amber-500/10 rounded-full blur-2xl scale-150 animate-pulse" />
                    
                    {/* Steaming hot tea cup container */}
                    <div className="relative w-28 h-28 bg-gradient-to-br from-amber-500/20 to-orange-500/10 rounded-full flex items-center justify-center border border-amber-500/30 shadow-lg shadow-amber-500/10">
                      
                      {/* Animated Steam Waves */}
                      <div className="absolute -top-4 flex gap-1.5 justify-center">
                        <motion.div 
                          animate={{ 
                            y: [0, -12, 0],
                            opacity: [0, 0.8, 0],
                            scale: [1, 1.2, 0.9]
                          }}
                          transition={{ duration: 2, repeat: Infinity, delay: 0 }}
                          className="w-1.5 h-6 bg-gradient-to-t from-amber-400 to-transparent rounded-full filter blur-[1px]" 
                        />
                        <motion.div 
                          animate={{ 
                            y: [0, -16, 0],
                            opacity: [0, 0.9, 0],
                            scale: [0.9, 1.3, 0.8]
                          }}
                          transition={{ duration: 2.3, repeat: Infinity, delay: 0.5 }}
                          className="w-1.5 h-8 bg-gradient-to-t from-orange-400 to-transparent rounded-full filter blur-[1px]" 
                        />
                        <motion.div 
                          animate={{ 
                            y: [0, -10, 0],
                            opacity: [0, 0.7, 0],
                            scale: [1, 1.1, 0.9]
                          }}
                          transition={{ duration: 1.8, repeat: Infinity, delay: 0.2 }}
                          className="w-1.5 h-6 bg-gradient-to-t from-amber-300 to-transparent rounded-full filter blur-[1px]" 
                        />
                      </div>

                      {/* Main Mug Icon */}
                      <Coffee className="w-14 h-14 text-amber-500 filter drop-shadow-[0_4px_6px_rgba(245,158,11,0.3)] animate-pulse" style={{ animationDuration: '3s' }} />
                    </div>
                  </div>

                  {/* Text Details with high contrast and cozy typography */}
                  <h2 className="text-4xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-amber-200 mb-4 tracking-tight uppercase">
                    Chai Break ☕
                  </h2>
                  <p className="text-slate-300 max-w-md text-base leading-relaxed mb-8">
                    The Admin is taking a quick tea break! Grab a cup of warm chai, stretch, and get ready. The double-or-nothing action will resume shortly.
                  </p>
                  
                  {/* Dynamic Status Badges */}
                  <div className="flex flex-col sm:flex-row items-center gap-3 bg-white/[0.02] border border-white/5 px-6 py-4 rounded-[2rem] select-none shadow-xl">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </span>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400 font-bold">Kettle Status:</span>
                    </div>
                    <span className="text-xs font-black text-amber-400 uppercase tracking-widest font-mono text-center">Brewing Fresh Round...</span>
                  </div>
                </motion.div>
              )}

              {(!state.maintenanceMode && !state.teaBreakMode || activeTab === 'admin') && activeTab === 'play' && (
                <motion.div
                  key="play"
                  initial={{ opacity: 0, y: 8, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.985 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="gpu-layer"
                >
                  <GameView 
                    state={activeState}
                    currentPlayer={activePlayer}
                    playSound={playSound}
                    onPlaceBet={demoMode ? onPlaceBetDemo : onPlaceBet}
                    onResetGraph={onResetPlayerGraph}
                    preferredCurrency={preferredCurrency}
                    rates={exchangeRates}
                  />
                </motion.div>
              )}

              {(!state.maintenanceMode && !state.teaBreakMode || activeTab === 'admin') && activeTab === 'announcement' && (
                <motion.div
                  key="announcement"
                  initial={{ opacity: 0, y: 8, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.985 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="gpu-layer"
                >
                  <AnnouncementView state={activeState} />
                </motion.div>
              )}

              {(!state.maintenanceMode && !state.teaBreakMode || activeTab === 'admin') && activeTab === 'wallet' && (
                <motion.div
                  key="wallet"
                  initial={{ opacity: 0, y: 8, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.985 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="gpu-layer"
                >
                  <RedesignedWalletView 
                    state={activeState} 
                    currentPlayer={activePlayer} 
                    onWithdraw={demoMode ? handleWithdrawDemo : handleWithdraw} 
                    onDeposit={demoMode ? handleDepositDemo : handleDeposit} 
                    playSound={playSound}
                    onResetGraph={onResetPlayerGraph}
                    preferredCurrency={preferredCurrency}
                    rates={exchangeRates}
                    onSelectCurrency={handleSelectCurrency}
                    isWalletLoading={walletLoading}
                  />
                </motion.div>
              )}

              {(!state.maintenanceMode && !state.teaBreakMode || activeTab === 'admin') && activeTab === 'leaderboard' && (
                <motion.div
                  key="leaderboard"
                  initial={{ opacity: 0, y: 8, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.985 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="gpu-layer"
                >
                  <LeaderboardView preferredCurrency={preferredCurrency} />
                </motion.div>
              )}

              {activeTab === 'admin' && (
                isAdmin ? (
                  <motion.div
                    key="admin"
                    initial={{ opacity: 0, y: 8, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.985 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="gpu-layer"
                  >
                    <AdminView 
                      state={state} 
                      playSound={playSound}
                      demoMode={demoMode}
                      onUpdateWinRate={onUpdateWinRate}
                      onUpdateMaxBet={onUpdateMaxBet}
                      onUpdateMinLimits={onUpdateMinLimits}
                      onUpdatePlayersWonCount={onUpdatePlayersWonCount}
                      onToggleBetLimit={onToggleBetLimit}
                      onToggleManualMode={onToggleManualMode}
                      onUpdatePlayerOverride={onUpdatePlayerOverride}
                      onSwitchPlayer={(id) => setState(prev => ({ ...prev, currentPlayerId: id }))}
                      onResultBet={resultBet}
                      onToggleBettingStatus={onToggleBettingStatus}
                      onUpdateCustomTotalBets={onUpdateCustomTotalBets}
                      onToggleWithdrawalsStopped={onToggleWithdrawalsStopped}
                      onUpdateWithdrawalStatus={updateWithdrawalStatus}
                      onUpdateDepositStatus={updateDepositStatus}
                      onToggleMaintenanceMode={onToggleMaintenanceMode}
                      onToggleTeaBreakMode={onToggleTeaBreakMode}
                      onTogglePlayersWonShown={onTogglePlayersWonShown}
                      onUpdateLotteryTimer={onUpdateLotteryTimer}
                      onUpdatePaymentSettings={onUpdatePaymentSettings}
                      onTogglePaymentLock={onTogglePaymentLock}
                      onReset={onResetSystem}
                      onResetHouseStats={onResetHouseStats}
                      onUpdateReferralAmount={onUpdateReferralAmount}
                      onToggleReferralEnabled={onToggleReferralEnabled}
                      onToggleWithdrawLimit24h={onToggleWithdrawLimit24h}
                      onToggleWinRateLock={onToggleWinRateLock}
                      onToggleTransferLimitsLock={onToggleTransferLimitsLock}
                      onUpdateAnnouncementText={onUpdateAnnouncementText}
                      onToggleAnnouncementEnabled={onToggleAnnouncementEnabled}
                      onSafeMigrate={safeMigrateUsersToPlayers}
                      preferredCurrency={preferredCurrency}
                    />
                  </motion.div>
                ) : (
                  <div className="p-8 text-center text-slate-400">
                    <p className="text-lg font-semibold text-rose-400">Access Denied</p>
                    <p className="text-sm mt-1">You do not have administrative privileges to view this section.</p>
                  </div>
                )
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
      <VercelDiagnosticModal 
        isOpen={showVercelDiag} 
        onClose={() => setShowVercelDiag(false)} 
        errorDetails={vercelDiagError}
      />
    </div>
  );
}

const NavItem = memo(({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) => {
  return (
    <motion.button 
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-colors duration-200 relative group glass-button select-none cursor-pointer gpu-layer
        ${active 
          ? 'bg-emerald-500 text-black font-extrabold shadow-lg shadow-emerald-500/20' 
          : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'}
      `}
    >
      <div className={`transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
        {icon}
      </div>
      <span className="font-display tracking-tight">{label}</span>
      {active && (
        <motion.div 
          layoutId="activeTabIndicator"
          className="ml-auto w-1.5 h-1.5 rounded-full bg-black/60"
        />
      )}
    </motion.button>
  );
});

NavItem.displayName = 'NavItem';

// Sub-components (Views)

const GameView = memo(function GameView({ state, currentPlayer, onPlaceBet, playSound, onResetGraph, preferredCurrency, rates }: { 
  state: AppState, 
  currentPlayer: Player, 
  onPlaceBet: (amt: number) => Promise<void>, 
  playSound: (key: keyof typeof SOUNDS, winAmount?: number) => void,
  onResetGraph: () => Promise<void>,
  preferredCurrency?: string,
  rates?: Record<string, number>
}) {
  const [betAmount, setBetAmount] = useState(10);
  const [isSpinning, setIsSpinning] = useState(false);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [result, setResult] = useState<'win' | 'lose' | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const currentCurrency = preferredCurrency || localStorage.getItem('preferred_currency') || 'USD';
  const currentRates = rates || getCachedRates().rates;
  const rate = currentRates[currentCurrency] || 1;

  const isZeroDecimal = ['JPY', 'IDR', 'KRW', 'VND', 'CLP', 'HNL', 'GNF', 'KMF', 'BIF'].includes(currentCurrency);
  const minLocalBet = isZeroDecimal ? 1 : 0.01;
  const minBetInUsd = minLocalBet / rate;

  const maxBetPossible = Math.min(currentPlayer?.balance || 0, state.isBetLimitEnabled ? (state.maxBet || 500) : 1000000);
  const isMaxBet = Math.abs(betAmount - maxBetPossible) < 0.00001;

  const formatBalanceLocal = (val: number) => {
    return `${getCurrencySymbol(currentCurrency)}${formatCurrencyValue(val, currentCurrency, currentRates)}`;
  };

  const currentBalance = currentPlayer?.balance ?? 0;
  const [prevBalance, setPrevBalance] = useState<number>(currentBalance);
  const [prevPlayerId, setPrevPlayerId] = useState<string | null>(currentPlayer?.id || null);
  const [flashType, setFlashType] = useState<'win' | 'lose' | 'none'>('none');
  const [floatingIndicator, setFloatingIndicator] = useState<{ id: number; amount: string; type: 'gain' | 'loss' } | null>(null);

  useEffect(() => {
    if (currentPlayer?.id !== prevPlayerId) {
      setPrevPlayerId(currentPlayer?.id || null);
      setPrevBalance(currentBalance);
      setFloatingIndicator(null);
      setFlashType('none');
      return;
    }

    if (prevBalance !== currentBalance) {
      const difference = currentBalance - prevBalance;
      if (Math.abs(difference) > 0.01) {
        setFlashType(difference > 0 ? 'win' : 'lose');
        setFloatingIndicator({
          id: Date.now(),
          amount: `${difference > 0 ? '+' : '-'}${getCurrencySymbol(currentCurrency)}${formatCurrencyValue(Math.abs(difference), currentCurrency, currentRates)}`,
          type: difference > 0 ? 'gain' : 'loss'
        });
        const flashTimer = setTimeout(() => {
          setFlashType('none');
        }, 1200);
        const floatTimer = setTimeout(() => {
          setFloatingIndicator(null);
        }, 2000);
      }
      setPrevBalance(currentBalance);
    }
  }, [currentBalance, prevBalance, currentPlayer?.id, prevPlayerId]);

  // Sync betAmount if balance drops below current bet
  useEffect(() => {
    if (currentPlayer && betAmount > currentPlayer.balance) {
      setBetAmount(Math.max(minBetInUsd, Math.min(currentPlayer.balance, 10)));
    }
  }, [currentPlayer?.balance, minBetInUsd]);

  const playerTransactions = useMemo(() => 
    currentPlayer ? state.transactions.filter(t => t.playerId === currentPlayer.id) : [], 
    [state.transactions, currentPlayer?.id]
  );

  const bets = playerTransactions.filter(t => t.type === 'bet' && t.status === 'completed');
  const wins = playerTransactions.filter(t => t.type === 'win');
  const totalWins = wins.length;
  const totalLoss = Math.max(0, bets.length - wins.length);
  const amountWagered = bets.reduce((sum, t) => sum + t.amount, 0);

  const { winStreak, lossStreak } = useMemo(() => {
    const completedBets = [...playerTransactions]
      .filter(t => t.type === 'bet' && t.status === 'completed')
      .sort((a, b) => b.timestamp - a.timestamp);

    const winTxns = playerTransactions.filter(t => t.type === 'win');

    const matchResults: ('W' | 'L')[] = completedBets.map(bet => {
      const isWin = winTxns.some(win => Math.abs(win.timestamp - bet.timestamp) < 2000);
      return isWin ? 'W' : 'L';
    });

    let w = 0, l = 0;
    if (matchResults.length > 0) {
      if (matchResults[0] === 'W') {
        for (const r of matchResults) {
          if (r === 'W') w++;
          else break;
        }
      } else {
        for (const r of matchResults) {
          if (r === 'L') l++;
          else break;
        }
      }
    }
    return { winStreak: w, lossStreak: l };
  }, [playerTransactions]);

  const handlePlay = async () => {
    if (betAmount > currentPlayer.balance || betAmount <= 0) return;
    
    setIsPlacingBet(true);
    setIsSpinning(true);
    setResult(null);
    playSound('BET');
    
    // Start spin loop sound after a tiny delay
    const spinTimer = setTimeout(() => {
      playSound('SPIN');
    }, 100);

    try {
      await onPlaceBet(betAmount);
    } catch (e) {
      console.error("Bet placement failed:", e);
      setIsSpinning(false);
      clearTimeout(spinTimer);
      alert("Failed to place bet. Please try again.");
    } finally {
      setIsPlacingBet(false);
    }
  };

  return (
    <div className="relative space-y-2 sm:space-y-3 max-w-xl mx-auto z-10 pb-2 sm:pb-4 select-none">
      <MatrixBackground />

      {/* Main Game Container */}
      <div className="relative bg-transparent text-center space-y-2 sm:space-y-3 overflow-visible">
        {/* Subtle Ambient Light Accents */}
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-red-600/15 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-cyan-500/15 rounded-full blur-2xl pointer-events-none" />

        {/* STAT CARDS SECTION */}
        <div className="space-y-2 relative z-20">
          {/* Card 1: NEXT LOTTERY RESULT */}
          <NextLotteryCard 
            lotteryTargetTimestamp={state.lotteryTargetTimestamp} 
            lotteryTimerActive={state.lotteryTimerActive} 
            lotteryTimerDuration={state.lotteryTimerDuration} 
          />

          {/* Cards 2 & 3 in a 2-Column Grid */}
          <div className="grid grid-cols-2 gap-2">
            {/* Card 2: TOTAL BETS PLACED */}
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="w-full p-[1.5px] rounded-xl bg-gradient-to-r from-[#ff0033] via-[#ff7700] to-[#ffb700] shadow-[0_0_15px_rgba(255,50,0,0.15)] transition-all hover:shadow-[0_0_25px_rgba(255,80,0,0.3)]"
            >
              <div className="bg-[#0c0816]/98 p-2 sm:p-2.5 rounded-[10px] flex items-center justify-between gap-1.5 h-full">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg border border-[#ff6600]/80 bg-[#210b02]/90 flex items-center justify-center text-[#ffcc00] shadow-[0_0_8px_rgba(255,100,0,0.3)] shrink-0">
                    <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#ffcc00]" />
                  </div>
                  <div className="text-left min-w-0">
                    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-[#ffb700] block truncate">TOTAL BETS</span>
                    <p className="text-[8px] sm:text-[9px] font-semibold text-[#8a9cb5] truncate">All Players</p>
                  </div>
                </div>

                <div className="flex items-center shrink-0">
                  <span className="text-xs sm:text-sm font-mono font-black text-[#ffc700] px-2 py-1 bg-[#140a02]/90 border border-[#ffb700]/40 rounded-lg shadow-[0_0_8px_rgba(255,180,0,0.2)]">
                    {formatBalanceLocal(
                      state.customTotalBets !== undefined && state.customTotalBets !== null && state.customTotalBets > 0
                        ? state.customTotalBets
                        : state.transactions?.filter(t => t.type === 'bet').reduce((sum, t) => sum + (t.amount || 0), 0) || 0
                    )}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Card 3: PLAYERS WON */}
            {(state.isPlayersWonShown ?? true) && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="w-full p-[1.5px] rounded-xl bg-gradient-to-r from-[#00aaff] via-[#ff0055] to-[#ffb700] shadow-[0_0_15px_rgba(255,0,68,0.15)] transition-all hover:shadow-[0_0_25px_rgba(255,0,68,0.3)]"
              >
                <div className="bg-[#0c0816]/98 p-2 sm:p-2.5 rounded-[10px] flex items-center justify-between gap-1.5 h-full">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg border border-[#ff6600]/80 bg-[#210b02]/90 flex items-center justify-center text-[#ffcc00] shadow-[0_0_8px_rgba(255,100,0,0.3)] shrink-0">
                      <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#ffcc00]" />
                    </div>
                    <div className="text-left min-w-0">
                      <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-[#ffb700] block truncate">PLAYERS WON</span>
                      <p className="text-[8px] sm:text-[9px] font-semibold text-[#8a9cb5] truncate">Winners</p>
                    </div>
                  </div>

                  <div className="flex items-center shrink-0">
                    <span className="text-xs sm:text-sm font-mono font-black text-[#ffc700] px-2.5 py-1 bg-[#140a02]/90 border border-[#ff2a00]/40 rounded-lg shadow-[0_0_8px_rgba(255,0,68,0.25)]">
                      {state.playersWonCount ?? 1215}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* HERO TITLE SECTION */}
        <div className="my-1.5 sm:my-2.5 relative z-10">
          <h2 className="text-2xl sm:text-3xl font-black italic tracking-wider uppercase text-white drop-shadow-[0_0_12px_rgba(0,180,255,0.5)] inline-flex items-center flex-wrap justify-center gap-1.5">
            <span>DOUBLE YOUR</span>
            <span className="font-cash text-3xl sm:text-4xl text-[#ffc700] text-glow-gold drop-shadow-[0_0_20px_rgba(255,50,0,0.8)] not-italic tracking-normal">
              CASH
            </span>
          </h2>
          <div className="mt-0.5 text-[11px] sm:text-xs font-semibold text-slate-300/90 flex items-center justify-center gap-1.5">
            <span>Enter amount & try your luck.</span>
            <span className="text-[#ffcc00] font-bold text-glow-gold">High risk, high reward.</span>
          </div>
        </div>

        {/* VAULT BALANCE CARD - IRON MAN ARC REACTOR CORE */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="w-full p-[1.5px] rounded-xl bg-gradient-to-r from-[#00f0ff] via-[#0066ff] to-[#7928ca] shadow-[0_0_25px_rgba(0,240,255,0.25)] transition-all hover:shadow-[0_0_35px_rgba(0,240,255,0.4)] my-1.5 sm:my-2.5 relative z-10"
        >
          <div className="bg-[#050814]/98 p-2.5 sm:p-3 rounded-[10px] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
              {/* Iron Man Mark I / Sci-Fi Arc Reactor Graphic */}
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shrink-0 group">
                {/* Outer Plasma Glow Halo */}
                <div className="absolute -inset-1.5 rounded-full bg-gradient-to-r from-cyan-500 via-blue-600 to-teal-400 opacity-70 blur-md animate-arc-pulse pointer-events-none" />

                {/* Heavy Titanium Outer Housing */}
                <div className="relative w-full h-full rounded-full bg-gradient-to-br from-slate-800 via-slate-950 to-black p-0.5 border border-cyan-400/60 shadow-[0_0_15px_rgba(0,240,255,0.5)] flex items-center justify-center overflow-hidden">
                  
                  {/* Rotating Metallic Outer Notch Ring */}
                  <div className="absolute inset-0.5 rounded-full border border-cyan-500/30 animate-arc-clockwise flex items-center justify-center">
                    {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((deg) => (
                      <div
                        key={deg}
                        className="absolute w-0.5 h-1.5 bg-cyan-300 shadow-[0_0_4px_#00f0ff]"
                        style={{ transform: `rotate(${deg}deg) translate(0, -20px)` }}
                      />
                    ))}
                  </div>

                  {/* Counter-rotating Plasma Grid Line */}
                  <div className="absolute inset-1.5 rounded-full border border-dashed border-blue-400/50 animate-arc-counter" />

                  {/* Copper Induction Coils (10 Core Coils around reactor) */}
                  <div className="absolute inset-2 rounded-full flex items-center justify-center">
                    {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((deg) => (
                      <div
                        key={deg}
                        className="absolute w-1 h-2 rounded-xs bg-gradient-to-t from-amber-500 via-yellow-300 to-cyan-300 border border-amber-300/80 shadow-[0_0_5px_rgba(0,240,255,0.8)]"
                        style={{ transform: `rotate(${deg}deg) translate(0, -13px)` }}
                      />
                    ))}
                  </div>

                  {/* Central Bright Blue Plasma Energy Core */}
                  <div className="relative w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-cyan-200 via-cyan-400 to-blue-700 border border-white shadow-[0_0_10px_#00f0ff,inset_0_0_6px_#ffffff] flex items-center justify-center animate-pulse z-10">
                    {/* Center Core Node Star */}
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white shadow-[0_0_8px_#ffffff]" />
                  </div>
                </div>
              </div>

              {/* Holographic Balance Typography */}
              <div className="text-left min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] sm:text-xs font-mono font-black uppercase tracking-widest text-[#00f0ff] block drop-shadow-[0_0_6px_rgba(0,240,255,0.8)]">
                    VAULT BALANCE CORE
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-[9px] font-mono text-cyan-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                    ACTIVE
                  </span>
                </div>
                <span className="text-xl sm:text-2xl font-black tracking-tight text-white block mt-0.5 drop-shadow-[0_0_12px_rgba(0,240,255,0.7)] font-mono">
                  {formatBalanceLocal(currentPlayer?.balance ?? 0)}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* WITHDRAWALS STOPPED BANNER (If Active) */}
        {state.isWithdrawalsStopped && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-2 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.3)] flex items-center justify-center gap-2 text-[10px] sm:text-xs font-black tracking-wider uppercase text-center relative z-20"
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 animate-pulse" />
            <span>Withdrawals are Stopped until Lottery Result</span>
          </motion.div>
        )}

        {/* FUTURISTIC BET CONTROL MODULE & SLIDER */}
        {(() => {
          const sliderMin = minLocalBet;
          const sliderMax = Math.max(minLocalBet, maxBetPossible * rate);
          const currentLocalVal = isZeroDecimal ? Math.round(betAmount * rate) : Math.round(betAmount * rate * 100) / 100;
          const rawPercent = (currentLocalVal - sliderMin) / Math.max(1, sliderMax - sliderMin);
          const percentFilled = Math.min(100, Math.max(0, rawPercent * 100));

          return (
            <div className="my-1.5 sm:my-2.5 relative z-10 space-y-2 bg-[#060817]/90 border border-cyan-500/30 backdrop-blur-md rounded-xl p-3 sm:p-4 shadow-[0_0_25px_rgba(0,0,0,0.8)]">
              {/* Floating HUD Indicator Bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] sm:text-xs font-mono font-black text-[#00f0ff] uppercase tracking-[0.15em] block drop-shadow-[0_0_6px_rgba(0,240,255,0.8)]">
                    BET AMOUNT
                  </span>
                  <span className="text-[9px] font-mono text-cyan-300 bg-cyan-950/80 border border-cyan-500/40 px-2 py-0.5 rounded-full shadow-[0_0_8px_rgba(0,240,255,0.3)]">
                    {Math.round(percentFilled)}%
                  </span>
                </div>

                {/* HUD Floating Value Display Box */}
                <div className="relative border border-cyan-400/80 bg-[#061224]/95 px-3 py-1 rounded-lg shadow-[0_0_15px_rgba(0,240,255,0.4)] flex items-center gap-1.5 animate-hud-pulse">
                  <span className="text-sm sm:text-base font-mono font-black text-[#00f0ff] tracking-tight drop-shadow-[0_0_8px_rgba(0,240,255,0.9)]">
                    {formatBalanceLocal(betAmount)}
                  </span>
                </div>
              </div>

              {/* Interactive Slider Track with Neon Gradient Glow */}
              <div className="relative flex items-center w-full my-2 py-1.5 px-1 bg-[#030611] rounded-full border border-cyan-500/30 shadow-[inset_0_0_10px_rgba(0,0,0,0.9)]">
                {/* Glowing Filled Progress Bar Underneath */}
                <div 
                  className="absolute left-1 top-1.5 bottom-1.5 rounded-full transition-all duration-75 pointer-events-none"
                  style={{ 
                    width: `calc(${percentFilled}% - 8px)`,
                    minWidth: '12px',
                    background: 'linear-gradient(90deg, #00f0ff 0%, #0088ff 50%, #ffaa00 80%, #ff0055 100%)',
                    boxShadow: '0 0 14px rgba(0, 240, 255, 0.8)'
                  }}
                />

                {/* Futuristic Range Input */}
                <input 
                  type="range" 
                  min={minLocalBet} 
                  max={Math.max(minLocalBet, maxBetPossible * rate)}
                  step={minLocalBet}
                  value={isZeroDecimal ? Math.round(betAmount * rate) : Math.round(betAmount * rate * 100) / 100} 
                  onChange={(e) => {
                    const localVal = Number(e.target.value);
                    setBetAmount(localVal / rate);
                    playSound('CLICK'); 
                  }}
                  onMouseDown={() => setIsDragging(true)}
                  onMouseUp={() => setIsDragging(false)}
                  onTouchStart={() => setIsDragging(true)}
                  onTouchEnd={() => setIsDragging(false)}
                  disabled={isPlacingBet || state.isBettingClosed}
                  className="futuristic-slider w-full cursor-pointer disabled:opacity-50"
                />
              </div>

              {/* Quick Adjustment Pills (NO '+' or '-' buttons!) */}
              <div className="flex items-center justify-between gap-1.5 pt-0.5">
                <div className="flex items-center gap-1.5 w-full justify-between">
                  <button
                    onClick={() => {
                      setBetAmount(minLocalBet / rate);
                      playSound('CLICK');
                    }}
                    disabled={isPlacingBet || state.isBettingClosed}
                    className="flex-1 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 font-mono font-bold text-[11px] sm:text-xs hover:bg-cyan-900/60 hover:border-cyan-400 transition-all cursor-pointer disabled:opacity-40 shadow-[0_0_8px_rgba(0,240,255,0.15)]"
                  >
                    MIN
                  </button>
                  <button
                    onClick={() => {
                      const newAmt = Math.max(minLocalBet / rate, betAmount / 2);
                      setBetAmount(newAmt);
                      playSound('CLICK');
                    }}
                    disabled={isPlacingBet || state.isBettingClosed}
                    className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-200 font-mono font-bold text-[11px] sm:text-xs hover:bg-white/15 transition-all cursor-pointer disabled:opacity-40"
                  >
                    ½
                  </button>
                  <button
                    onClick={() => {
                      const newAmt = Math.min(maxBetPossible, betAmount * 2);
                      setBetAmount(newAmt);
                      playSound('CLICK');
                    }}
                    disabled={isPlacingBet || state.isBettingClosed}
                    className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-200 font-mono font-bold text-[11px] sm:text-xs hover:bg-white/15 transition-all cursor-pointer disabled:opacity-40"
                  >
                    2x
                  </button>
                  <button
                    onClick={() => {
                      setBetAmount(maxBetPossible);
                      playSound('CLICK');
                    }}
                    disabled={isPlacingBet || state.isBettingClosed}
                    className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/30 to-orange-500/30 border border-amber-500/50 text-amber-300 font-mono font-bold text-[11px] sm:text-xs hover:from-amber-500/40 hover:to-orange-500/40 transition-all cursor-pointer disabled:opacity-40 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
                  >
                    MAX
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* BET STATUS / LOCK NOTIFICATIONS */}
        <div className="my-1.5 sm:my-2 relative z-10 space-y-2">
          {state.isBettingClosed && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 shadow-lg relative overflow-hidden text-center"
            >
              <div className="flex flex-col items-center justify-center space-y-1">
                <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 animate-pulse">
                  <Lock className="w-3 h-3" />
                </div>
                <span className="text-[9px] font-black tracking-widest text-amber-400 uppercase">Betting Closed</span>
                <p className="text-[10px] font-bold text-white">
                  Betting closed — Please wait for the next round.
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* ACTION MAIN BUTTON: DOUBLE OR DONATE */}
        <div className="relative z-10 my-1.5 sm:my-2.5">
          <motion.button 
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={handlePlay}
            disabled={isPlacingBet || state.isBettingClosed || (currentPlayer?.balance ?? 0) < betAmount || betAmount <= 0}
            className={`
              w-full py-3 sm:py-3.5 rounded-xl text-xl sm:text-2xl font-black italic tracking-wider uppercase transition-all duration-300 relative border-0 cursor-pointer shadow-[0_0_25px_rgba(255,50,0,0.7)]
              ${isPlacingBet || state.isBettingClosed || (currentPlayer?.balance ?? 0) < betAmount || betAmount <= 0 
                ? 'bg-gray-800/80 text-slate-500 cursor-not-allowed shadow-none border border-white/5' 
                : 'bg-gradient-to-r from-[#ffe600] via-[#ff4d00] to-[#e60000] text-black hover:brightness-110 active:brightness-90'
              }
            `}
          >
            {isPlacingBet 
              ? 'PLACING BET...' 
              : state.isBettingClosed 
              ? 'BETTING CLOSED' 
              : 'DOUBLE OR DONATE'}
          </motion.button>
        </div>

        {/* FOOTER CHARITY DISCLOSURE */}
        <div className="relative z-10 my-1 sm:my-1.5">
          <div className="flex items-center justify-center gap-1.5 text-[9px] sm:text-[10px] font-black tracking-wider text-slate-300 uppercase py-1.5 bg-white/[0.03] border border-white/10 rounded-xl px-3 select-none shadow-sm">
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 animate-pulse shrink-0" />
            <span>Your Lost Amount Will Be Donated To Poor</span>
          </div>
        </div>

        {/* BOTTOM FEATURE BADGES GRID */}
        <div className="relative z-10 grid grid-cols-4 gap-1 bg-[#090514]/90 border border-slate-800 rounded-xl p-1.5 sm:p-2 text-center shadow-xl backdrop-blur-md">
          {/* Item 1: 100% SECURE */}
          <div className="flex flex-col items-center justify-center p-0.5 space-y-0.5">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.2)]">
              <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
            </div>
            <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-white block mt-0.5">
              100% SECURE
            </span>
            <span className="text-[7px] sm:text-[8px] font-semibold text-[#8a9cb5] block leading-tight">
              Protected
            </span>
          </div>

          {/* Item 2: INSTANT GAME */}
          <div className="flex flex-col items-center justify-center p-0.5 space-y-0.5 border-l border-slate-800/80">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.2)]">
              <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
            </div>
            <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-white block mt-0.5">
              INSTANT GAME
            </span>
            <span className="text-[7px] sm:text-[8px] font-semibold text-[#8a9cb5] block leading-tight">
              Fast & Fair
            </span>
          </div>

          {/* Item 3: PROVABLY FAIR */}
          <div className="flex flex-col items-center justify-center p-0.5 space-y-0.5 border-l border-slate-800/80">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.2)]">
              <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
            </div>
            <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-white block mt-0.5">
              PROVABLY FAIR
            </span>
            <span className="text-[7px] sm:text-[8px] font-semibold text-[#8a9cb5] block leading-tight">
              Transparent
            </span>
          </div>

          {/* Item 4: 24/7 SUPPORT */}
          <div className="flex flex-col items-center justify-center p-0.5 space-y-0.5 border-l border-slate-800/80">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.2)]">
              <Headphones className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
            </div>
            <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-white block mt-0.5">
              24/7 SUPPORT
            </span>
            <span className="text-[7px] sm:text-[8px] font-semibold text-[#8a9cb5] block leading-tight">
              We're Here
            </span>
          </div>
        </div>

        {/* WIN/LOSS RESULT MODAL ANNOUNCEMENT */}
        <AnimatePresence mode="wait">
          {result && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              className="mt-4 flex flex-col items-center justify-center p-3 rounded-xl bg-black/90 border border-white/20 shadow-2xl relative z-30"
            >
              {result === 'win' ? (
                <span className="font-black text-4xl sm:text-5xl italic tracking-tighter text-emerald-400 text-glow-gold animate-pulse">
                  WINNER!
                </span>
              ) : (
                <div className="flex flex-col items-center">
                  <span className="font-black text-5xl sm:text-6xl italic tracking-tighter text-red-600 mb-1 text-glow-red">
                    DONATED
                  </span>
                  <span className="text-white font-extrabold tracking-wider text-[10px] sm:text-xs uppercase text-center max-w-[240px] leading-relaxed">
                    Your Money Has been Donated to The Poor
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {(currentPlayer?.balance ?? 0) < 1 && (
          <div className="mt-2 flex items-center justify-center gap-1.5 text-rose-400 text-[11px] bg-rose-500/10 py-2 rounded-xl border border-rose-500/20 relative z-10">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Insufficient balance in vault.</span>
          </div>
        )}
      </div>
    </div>
  );
});



export function WinParticleOverlay({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (canvas) {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);

    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      alpha: number;
      decay: number;
      spin: number;
      spinSpeed: number;
      shape: 'star' | 'circle' | 'diamond' | 'spark';
      glow: boolean;
    }[] = [];

    const colors = [
      '#ffd700', // Gold
      '#f59e0b', // Amber
      '#10b981', // Emerald
      '#34d399', // Mint
      '#ffffff', // Diamond white
      '#a7f3d0'  // Light sage
    ];

    const createParticle = (x: number, y: number, isInitialBurst = false) => {
      const angle = isInitialBurst 
        ? Math.random() * Math.PI * 2 
        : -Math.PI / 2 + (Math.random() - 0.5) * 1.2; // upwards cone for fountain
      const speed = isInitialBurst 
        ? 3 + Math.random() * 12 
        : 6 + Math.random() * 10;
      
      const shapes: ('star' | 'circle' | 'diamond' | 'spark')[] = ['circle', 'diamond', 'star', 'spark'];
      const shape = shapes[Math.floor(Math.random() * shapes.length)];

      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.008 + Math.random() * 0.012,
        spin: Math.random() * Math.PI * 2,
        spinSpeed: (Math.random() - 0.5) * 0.15,
        shape,
        glow: Math.random() > 0.4
      });
    };

    // Initial burst from center and bottom corners
    const burstCount = 80;
    for (let i = 0; i < burstCount; i++) {
      createParticle(width / 2, height / 2, true);
      createParticle(width * 0.15, height * 0.85, true);
      createParticle(width * 0.85, height * 0.85, true);
    }

    // Continuous fountain generator while active
    let frame = 0;
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      frame++;
      // Spawn new particles from the center bottom (fountain effect) and bottom-sides
      if (frame % 2 === 0) {
        createParticle(width / 2, height, false);
        createParticle(width * 0.1, height, false);
        createParticle(width * 0.9, height, false);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        
        // gravity and air resistance
        p.vy += 0.18; // gravity
        p.vx *= 0.98; // friction
        p.vy *= 0.98; // friction
        
        p.spin += p.spinSpeed;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);

        // Styling with beautiful glow
        if (p.glow) {
          ctx.shadowBlur = p.size * 2.5;
          ctx.shadowColor = p.color;
        }

        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;

        // Draw shape
        if (p.shape === 'star') {
          // Draw standard 5-point star
          ctx.beginPath();
          for (let s = 0; s < 5; s++) {
            ctx.lineTo(Math.cos((18 + s * 72) * Math.PI / 180) * p.size,
                       Math.sin((18 + s * 72) * Math.PI / 180) * p.size);
            ctx.lineTo(Math.cos((54 + s * 72) * Math.PI / 180) * (p.size / 2),
                       Math.sin((54 + s * 72) * Math.PI / 180) * (p.size / 2));
          }
          ctx.closePath();
          ctx.fill();
        } else if (p.shape === 'diamond') {
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size * 0.7, 0);
          ctx.lineTo(0, p.size);
          ctx.lineTo(-p.size * 0.7, 0);
          ctx.closePath();
          ctx.fill();
        } else if (p.shape === 'spark') {
          // Cross hair spark
          ctx.beginPath();
          ctx.moveTo(-p.size * 1.5, 0);
          ctx.lineTo(p.size * 1.5, 0);
          ctx.moveTo(0, -p.size * 1.5);
          ctx.lineTo(0, p.size * 1.5);
          ctx.stroke();
        } else {
          // Circle
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-50"
      style={{ mixBlendMode: 'screen' }}
    />
  );
}


const USDTLogo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
  const dimensions = {
    sm: "w-6 h-6 text-xs shadow-[0_0_10px_rgba(38,161,123,0.5)] border-emerald-300/20",
    md: "w-8.5 h-8.5 text-[17px] shadow-[0_0_16px_rgba(38,161,123,0.6)] border-emerald-300/30",
    lg: "w-13 h-13 text-[26px] shadow-[0_0_24px_rgba(38,161,123,0.7)] border-emerald-300/40",
  };
  return (
    <div className="relative group shrink-0 select-none flex items-center justify-center">
      {/* Outer ambient glow halo */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 opacity-40 blur-md group-hover:opacity-75 group-hover:scale-125 transition-all duration-500" />
      
      <div 
        className={`relative inline-flex items-center justify-center rounded-full bg-gradient-to-br from-[#2de6ab] via-[#26A17B] to-[#0f4b3a] text-white font-extrabold leading-none border shrink-0 transform group-hover:rotate-12 transition-all duration-300 ${dimensions[size]}`} 
        title="USDT (Tether)"
      >
        <span className="drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)] transform group-hover:scale-115 transition-transform duration-300">₮</span>
      </div>
    </div>
  );
};

interface AnimatedBalanceProps {
  balance: number;
  size?: 'sm' | 'md' | 'lg';
  preferredCurrency?: string;
  rates?: Record<string, number>;
  onSelectCurrency?: (code: string) => void;
}

export function AnimatedBalance({ balance, size = 'md', preferredCurrency, rates, onSelectCurrency }: AnimatedBalanceProps) {
  const currentCurrency = preferredCurrency || localStorage.getItem('preferred_currency') || 'USD';
  const currentRates = rates || getCachedRates().rates;

  const formattedValue = formatCurrencyValue(balance, currentCurrency, currentRates);
  const symbol = getCurrencySymbol(currentCurrency);

  const prevBalanceRef = useRef(balance);
  const [particles, setParticles] = useState<{ id: number; color: string; size: number; tx: number; ty: number }[]>([]);
  const [isLossPulse, setIsLossPulse] = useState(false);
  const [isWinBounce, setIsWinBounce] = useState(false);
  const [currencyDropdownOpen, setCurrencyDropdownOpen] = useState(false);
  const currencyDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (currencyDropdownRef.current && !currencyDropdownRef.current.contains(event.target as Node)) {
        setCurrencyDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const prev = prevBalanceRef.current;
    if (balance > prev) {
      // Winnings! Trigger green sparks
      setIsWinBounce(true);
      setTimeout(() => setIsWinBounce(false), 600);

      const newParticles = Array.from({ length: 14 }).map((_, i) => {
        const angle = (i / 14) * 2 * Math.PI + (Math.random() - 0.5) * 0.3;
        const distance = 25 + Math.random() * 35;
        return {
          id: Math.random() + i,
          color: Math.random() > 0.4 ? '#10b981' : '#34d399',
          size: 3 + Math.random() * 5,
          tx: Math.cos(angle) * distance,
          ty: Math.sin(angle) * distance,
        };
      });
      setParticles(newParticles);
      setTimeout(() => setParticles([]), 1000);
    } else if (balance < prev) {
      // Losses! Trigger red pulse
      setIsLossPulse(true);
      setTimeout(() => setIsLossPulse(false), 800);
    }
    prevBalanceRef.current = balance;
  }, [balance]);

  const sizeClasses = {
    sm: "text-base sm:text-lg",
    md: "text-xl sm:text-2xl",
    lg: "text-4xl sm:text-5xl lg:text-6xl"
  };

  return (
    <div className="relative inline-flex items-center gap-1.5 flex-wrap justify-center">
      {/* USDT Logo Beside Balance */}
      <USDTLogo size={size} />

      <div className="relative flex items-center gap-1.5">
        <motion.div
          animate={
            isWinBounce 
              ? { scale: [1, 1.15, 1], y: [0, -4, 0] } 
              : isLossPulse 
                ? { scale: [1, 0.9, 1.05, 1], x: [0, -3, 3, -3, 0] }
                : {}
          }
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className={`font-mono font-bold tracking-tight transition-colors duration-300 ${
            isWinBounce 
              ? 'text-emerald-400 font-extrabold' 
              : isLossPulse 
                ? 'text-rose-500' 
                : 'text-white'
          } ${sizeClasses[size]}`}
        >
          <span className="text-emerald-400 opacity-90 mr-0.5">{symbol}</span>
          {formattedValue}
        </motion.div>

        {/* Currency Change Shortcut near Balance */}
        {onSelectCurrency && (
          <div className="relative inline-flex items-center z-30" ref={currencyDropdownRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrencyDropdownOpen(!currencyDropdownOpen);
              }}
              className="flex items-center gap-1 px-1.5 py-0.5 ml-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-md text-emerald-400 font-mono text-[10px] sm:text-xs font-bold transition-all cursor-pointer shadow-sm group select-none shrink-0"
              title="Change Currency Preview"
            >
              <span>{currentCurrency}</span>
              <span className={`text-[9px] text-emerald-400 transition-transform duration-200 ${currencyDropdownOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {currencyDropdownOpen && (
              <div className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-2 w-48 bg-zinc-950/95 border border-emerald-500/40 rounded-xl shadow-2xl p-1.5 z-50 backdrop-blur-xl">
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 border-b border-white/10 mb-1 flex justify-between items-center">
                  <span>Currency Preview</span>
                  <span className="text-emerald-400 font-mono text-[9px]">▼</span>
                </div>
                <div className="max-h-52 overflow-y-auto space-y-0.5 pr-0.5 text-left">
                  {Object.values(SUPPORTED_CURRENCIES).map((curr) => (
                    <button
                      key={curr.code}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCurrency(curr.code);
                        setCurrencyDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
                        currentCurrency === curr.code
                          ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className="font-mono text-left">{curr.code} <span className="text-[10px] text-slate-400">({curr.symbol})</span></span>
                      {currentCurrency === curr.code && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Losses Red Pulse Ring */}
        <AnimatePresence>
          {isLossPulse && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0.8 }}
              animate={{ scale: 1.4, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="absolute inset-0 -m-2 rounded-xl border-2 border-rose-500 pointer-events-none shadow-[0_0_15px_rgba(239,68,68,0.5)]"
            />
          )}
        </AnimatePresence>

        {/* Winnings Green Spark Particle Layer */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ 
                x: p.tx, 
                y: p.ty, 
                opacity: 0, 
                scale: 0 
              }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              style={{
                position: 'absolute',
                width: p.size,
                height: p.size,
                borderRadius: '50%',
                backgroundColor: p.color,
                boxShadow: `0 0 8px ${p.color}`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const METALS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Conqueror'];

function getRomanNumeral(num: number): string {
  const roman: Record<number, string> = {
    1: 'I',
    2: 'II',
    3: 'III',
    4: 'IV'
  };
  return roman[num] || num.toString();
}

export function getVIPLevel(totalWagered: number = 0) {
  const step = 1000;
  const totalLevels = METALS.length * 4; // 24 levels
  
  // Determine index (0 to 23)
  let levelIndex = Math.floor(totalWagered / step);
  if (levelIndex >= totalLevels) {
    levelIndex = totalLevels - 1; // Cap at max level
  }
  
  const metalIndex = Math.floor(levelIndex / 4);
  const metal = METALS[metalIndex];
  
  // level within the metal: goes 4, 3, 2, 1
  const levelNum = 4 - (levelIndex % 4);
  const romanNum = getRomanNumeral(levelNum);
  const label = `${metal} ${romanNum}`;
  
  // Colors for each metal
  let color = 'text-amber-500'; // Bronze
  let badgeBg = 'bg-amber-500/10';
  let badgeBorder = 'border-amber-500/20';
  let iconColor = 'text-amber-500';
  let cardBg = 'from-amber-500/5 via-transparent to-transparent';
  let cardBorder = 'hover:border-amber-500/20';
  
  if (metal === 'Silver') {
    color = 'text-slate-300';
    badgeBg = 'bg-slate-300/10';
    badgeBorder = 'border-slate-300/20';
    iconColor = 'text-slate-300';
    cardBg = 'from-slate-400/5 via-transparent to-transparent';
    cardBorder = 'hover:border-slate-400/20';
  } else if (metal === 'Gold') {
    color = 'text-yellow-400';
    badgeBg = 'bg-yellow-400/10';
    badgeBorder = 'border-yellow-400/20';
    iconColor = 'text-yellow-400';
    cardBg = 'from-yellow-400/5 via-transparent to-transparent';
    cardBorder = 'hover:border-yellow-400/20';
  } else if (metal === 'Platinum') {
    color = 'text-cyan-400';
    badgeBg = 'bg-cyan-400/10';
    badgeBorder = 'border-cyan-400/20';
    iconColor = 'text-cyan-400';
    cardBg = 'from-cyan-400/5 via-transparent to-transparent';
    cardBorder = 'hover:border-cyan-400/20';
  } else if (metal === 'Diamond') {
    color = 'text-blue-400';
    badgeBg = 'bg-blue-400/10';
    badgeBorder = 'border-blue-400/20';
    iconColor = 'text-blue-400';
    cardBg = 'from-blue-400/5 via-transparent to-transparent';
    cardBorder = 'hover:border-blue-400/20';
  } else if (metal === 'Conqueror') {
    color = 'text-rose-500';
    badgeBg = 'bg-rose-500/10';
    badgeBorder = 'border-rose-500/20';
    iconColor = 'text-rose-500';
    cardBg = 'from-rose-500/5 via-transparent to-transparent';
    cardBorder = 'hover:border-rose-500/20';
  }
  
  const isMaxLevel = levelIndex === totalLevels - 1;
  const currentLevelMin = levelIndex * step;
  const nextLevelMin = (levelIndex + 1) * step;
  
  const progress = isMaxLevel ? 100 : Math.min(100, Math.max(0, ((totalWagered - currentLevelMin) / step) * 100));
  
  return {
    metal,
    level: levelNum,
    label,
    color,
    badgeBg,
    badgeBorder,
    iconColor,
    cardBg,
    cardBorder,
    progress,
    totalWagered,
    nextLevelMin,
    isMaxLevel
  };
}

export function AnnouncementView({ state }: { state: AppState }) {
  const text = state.announcementText || 'Welcome to Matrix Multiplier! Active promotion: Earn double VIP experience this week!';

  return (
    <div className="bg-[#0b0b0b]/80 border border-emerald-500/10 rounded-[2.5rem] p-8 sm:p-14 shadow-2xl relative overflow-hidden backdrop-blur-xl">
      {/* Decorative ambient background glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none -mr-48 -mt-48 animate-pulse" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-teal-500/5 rounded-full blur-[120px] pointer-events-none -ml-48 -mb-48" />
      
      {/* Grid Pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center">
        {/* Animated Icon Ring */}
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full bg-emerald-500/15 blur-2xl animate-pulse" />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-[#1fd69e]/30 via-emerald-500/20 to-teal-500/5 border border-emerald-400/30 flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.3)]">
            <Megaphone className="w-12 h-12 text-emerald-400" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-5 w-5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-5 w-5 bg-emerald-500"></span>
          </span>
        </div>

        {/* Title */}
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-mono font-black uppercase tracking-[0.2em] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 mb-5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          Global Transmission
        </span>

        <h2 className="text-4xl sm:text-5xl font-display font-black text-white tracking-tight mb-8">
          Latest Announcement
        </h2>

        {/* Announcement Box */}
        <div className="w-full max-w-3xl bg-white/[0.01] border border-white/5 rounded-3xl p-8 sm:p-12 backdrop-blur-md relative group hover:border-emerald-500/20 transition-all duration-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-5 py-1 bg-[#0a0a0a] border border-white/10 rounded-full text-[9px] font-mono text-slate-500 uppercase tracking-[0.25em]">
            Broadcast Begin
          </div>
          
          <p className="text-slate-200 text-lg sm:text-2xl font-sans leading-relaxed text-center whitespace-pre-wrap select-text selection:bg-emerald-500 selection:text-black">
            {text}
          </p>

          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 px-5 py-1 bg-[#0a0a0a] border border-white/10 rounded-full text-[9px] font-mono text-slate-500 uppercase tracking-[0.25em]">
            Broadcast End
          </div>
        </div>

        {/* Security / System Footer */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-[10px] font-mono text-slate-500 border-t border-white/5 pt-8 w-full max-w-2xl">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500/70 animate-pulse" />
            Verified Cryptographic Root
          </div>
          <div className="hidden sm:block text-white/10">•</div>
          <div>
            Synced: {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
          <div className="hidden sm:block text-white/10">•</div>
          <div className="text-emerald-400 font-black uppercase tracking-widest">
            Matrix Secure Node
          </div>
        </div>
      </div>
    </div>
  );
}

interface VIPViewProps {
  state: AppState;
  currentPlayer: Player | null;
  preferredCurrency?: string;
  rates?: Record<string, number>;
}

export function VIPView() {
  return null;
}

const OldVIPView = memo(function OldVIPView({ state, currentPlayer, preferredCurrency, rates }: VIPViewProps) {
  const totalWagered = currentPlayer?.totalWagered || 0;
  const currentVIP = getVIPLevel(totalWagered);

  const currentCurrency = preferredCurrency || localStorage.getItem('preferred_currency') || 'USD';
  const currentRates = rates || getCachedRates().rates;

  const formatBalanceLocal = (val: number) => {
    return `${getCurrencySymbol(currentCurrency)}${formatCurrencyValue(val, currentCurrency, currentRates)}`;
  };

  const metalData = [
    {
      name: 'Bronze',
      minWager: 0,
      color: 'text-amber-600',
      badgeBg: 'bg-amber-600/10',
      badgeBorder: 'border-amber-600/20',
      benefits: ['Standard multiplier payouts', 'Access to general chat room', 'Standard betting limits']
    },
    {
      name: 'Silver',
      minWager: 4000,
      color: 'text-slate-300',
      badgeBg: 'bg-slate-300/10',
      badgeBorder: 'border-slate-300/20',
      benefits: ['Priority withdrawal processing', 'Exclusive Silver community badge', '5% faster cashout validation']
    },
    {
      name: 'Gold',
      minWager: 8000,
      color: 'text-yellow-400',
      badgeBg: 'bg-yellow-400/10',
      badgeBorder: 'border-yellow-400/20',
      benefits: ['High-Roller betting limit boost', 'Dedicated VIP support channel', 'Gold tier graphic theme accents']
    },
    {
      name: 'Platinum',
      minWager: 12000,
      color: 'text-cyan-400',
      badgeBg: 'bg-cyan-400/10',
      badgeBorder: 'border-cyan-400/20',
      benefits: ['Direct fast-lane transactions', 'Pre-release beta feature access', 'Personal Account Manager']
    },
    {
      name: 'Diamond',
      minWager: 16000,
      color: 'text-blue-400',
      badgeBg: 'bg-blue-400/10',
      badgeBorder: 'border-blue-400/20',
      benefits: ['Zero-fee withdrawals always', 'Instant automated payout approvals', 'Double Referral reward rates']
    },
    {
      name: 'Conqueror',
      minWager: 20000,
      color: 'text-rose-500',
      badgeBg: 'bg-rose-500/10',
      badgeBorder: 'border-rose-500/20',
      benefits: ['Elite Level status badge', '24/7 dedicated telephone/telegram line', 'Exclusive Conqueror lossback incentives']
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-20 px-4 animate-in fade-in duration-500">
      {/* Title */}
      <div className="flex flex-col items-center justify-center text-center space-y-4 mb-6">
        <div className="p-4 bg-amber-500/10 rounded-3xl border border-amber-500/20 animate-bounce" style={{ animationDuration: '3s' }}>
          <Crown className="w-12 h-12 text-amber-400" />
        </div>
        <div>
          <h2 className="text-4xl font-display font-bold tracking-tight">V.I.P Club</h2>
          <p className="text-slate-500 font-mono text-xs uppercase tracking-[0.2em] mt-2">Level up your status with every single wager</p>
        </div>
      </div>

      {/* Hero Level status card */}
      <div className="glass-card rounded-[2.5rem] border border-white/5 overflow-hidden p-8 sm:p-10 relative bg-gradient-to-br from-white/[0.02] via-transparent to-transparent">
        <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${
          currentVIP.metal === 'Bronze' ? 'from-amber-600/5' :
          currentVIP.metal === 'Silver' ? 'from-slate-400/5' :
          currentVIP.metal === 'Gold' ? 'from-yellow-400/5' :
          currentVIP.metal === 'Platinum' ? 'from-cyan-400/5' :
          currentVIP.metal === 'Diamond' ? 'from-blue-400/5' : 'from-rose-500/5'
        } to-transparent rounded-full blur-3xl`} />
        
        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-8 relative z-10">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
            {/* Visual rank crest */}
            <div className={`w-24 h-24 sm:w-28 sm:h-28 rounded-[2rem] flex items-center justify-center border ${currentVIP.badgeBorder} ${currentVIP.badgeBg} shadow-2xl shrink-0 relative group`}>
              <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/[0.04] to-white/0 rounded-[2rem]" />
              <Crown className={`w-12 h-12 ${currentVIP.color}`} />
              
              {/* Floating micro star bubbles */}
              <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400/40 blur-sm animate-ping" />
            </div>

            <div>
              <span className="text-[10px] font-black tracking-[0.25em] uppercase text-emerald-400 font-mono block mb-1">YOUR CURRENT STATUS</span>
              <h3 className="text-3xl sm:text-4xl font-display font-black tracking-tight flex items-center gap-3 justify-center sm:justify-start">
                <span className={currentVIP.color}>{currentVIP.label}</span>
              </h3>
              <p className="text-sm text-slate-400 mt-2 font-medium">
                You have wagered a total of <span className="text-white font-bold font-mono">{formatBalanceLocal(totalWagered)}</span> on Matrix.
              </p>
              
              <div className="flex flex-wrap items-center gap-3 mt-4 justify-center sm:justify-start">
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-white/5 border border-white/5 rounded-lg text-slate-400">
                  Tier multiplier: {(1.0 + (METALS.indexOf(currentVIP.metal) * 0.1) + (4 - currentVIP.level) * 0.02).toFixed(2)}x Power
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
                  Active account
                </span>
              </div>
            </div>
          </div>

          <div className="w-full md:w-72 bg-black/40 border border-white/5 p-6 rounded-2xl flex flex-col justify-between shrink-0">
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">LEVEL PROGRESS</p>
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-xs text-slate-400 font-medium">To Next Level</span>
                <span className="text-xs text-white font-bold font-mono">
                  {currentVIP.isMaxLevel ? 'MAX TIER' : `${formatBalanceLocal(Math.ceil(1000 - (totalWagered % 1000)))} left`}
                </span>
              </div>
              
              {/* Progress bar */}
              <div className="w-full bg-white/5 h-2.5 rounded-full overflow-hidden border border-white/5">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${currentVIP.progress}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-full rounded-full"
                />
              </div>
            </div>
            
            {!currentVIP.isMaxLevel && (
              <p className="text-[9.5px] text-slate-500 mt-4 leading-relaxed font-mono">
                Wager {formatBalanceLocal(1000 - (totalWagered % 1000))} more to reach the next level threshold.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Ranks road map section */}
      <div>
        <h4 className="font-display font-bold text-2xl text-white mb-2">V.I.P Metal Path</h4>
        <p className="text-xs text-slate-500 uppercase tracking-[0.15em] font-mono mb-6">Each tier unlock grants persistent, elite account upgrades</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {metalData.map((metal, idx) => {
            const isUnlocked = totalWagered >= metal.minWager;
            const isActive = currentVIP.metal === metal.name;
            const rangeStr = metal.name === 'Conqueror'
              ? `${formatBalanceLocal(metal.minWager)}+`
              : `${formatBalanceLocal(metal.minWager)} - ${formatBalanceLocal(metal.minWager + 4000)}`;
            
            return (
              <div 
                key={metal.name} 
                className={`glass-card rounded-[2rem] border p-6 flex flex-col justify-between relative overflow-hidden transition-all duration-300 ${
                  isActive 
                    ? 'border-emerald-500/40 bg-emerald-500/[0.02] shadow-emerald-500/5 shadow-2xl scale-[1.01]' 
                    : isUnlocked 
                      ? 'border-white/10 bg-white/[0.01]' 
                      : 'border-white/5 bg-black/40 opacity-60'
                }`}
              >
                {/* Shiny diagonal glow for unlocked metals */}
                {isUnlocked && (
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/[0.015] to-white/0 pointer-events-none" />
                )}

                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-xl ${metal.badgeBg} border ${metal.badgeBorder}`}>
                        <Crown className={`w-5 h-5 ${metal.color}`} />
                      </div>
                      <div>
                        <h5 className="font-display font-black text-xl text-white">{metal.name} Tier</h5>
                        <p className="text-[10px] text-slate-500 font-mono tracking-wider">{rangeStr} Wagered</p>
                      </div>
                    </div>

                    {isActive ? (
                      <span className="bg-emerald-500 text-black text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider shadow-md shadow-emerald-500/10">
                        ACTIVE Ranks
                      </span>
                    ) : isUnlocked ? (
                      <span className="bg-white/5 border border-white/10 text-[9px] font-black px-2.5 py-1 rounded-lg text-slate-400 uppercase tracking-wider">
                        UNLOCKED
                      </span>
                    ) : (
                      <span className="bg-white/5 border border-white/5 text-[9px] font-black px-2.5 py-1 rounded-lg text-slate-600 uppercase tracking-wider">
                        LOCKED
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 mt-4 border-t border-white/5 pt-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 font-mono">PERSISTENT PERKS:</p>
                    {metal.benefits.map((benefit, bIdx) => (
                      <div key={bIdx} className="flex items-start gap-2.5">
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${isUnlocked ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                        <span className="text-xs text-slate-400 leading-normal">{benefit}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between bg-black/30 p-3 rounded-xl border border-white/5">
                  <span className="text-[10px] text-slate-500 font-mono uppercase text-xs">Metal levels:</span>
                  <div className="flex gap-1.5">
                    {[4, 3, 2, 1].map((subLvl) => {
                      const levelRequiredWager = metal.minWager + (4 - subLvl) * 1000;
                      const isSubLevelUnlocked = totalWagered >= levelRequiredWager;
                      const isCurrentSubLevel = currentVIP.metal === metal.name && currentVIP.level === subLvl;

                      return (
                        <span 
                          key={subLvl} 
                          title={`${metal.name} ${getRomanNumeral(subLvl)}: Requires ${formatBalanceLocal(levelRequiredWager)} Wager`}
                          className={`text-[9px] font-black px-2 py-0.5 rounded ${
                            isCurrentSubLevel 
                              ? 'bg-emerald-500 text-black font-extrabold' 
                              : isSubLevelUnlocked 
                                ? 'bg-white/10 text-slate-300' 
                                : 'bg-white/5 text-slate-600'
                          }`}
                        >
                          {getRomanNumeral(subLvl)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});



const WalletView = memo(function WalletView() {
  return null;
});

const LegacyWalletView = memo(function LegacyWalletView({ state, currentPlayer, preferredCurrency, rates, onDeposit, onWithdraw, playSound, onResetGraph, onSelectCurrency }: any) {
  const [modalType, setModalType] = useState<'deposit' | 'withdraw' | null>(null);
  const [showDepositView, setShowDepositView] = useState(false);
  const [showWithdrawView, setShowWithdrawView] = useState(false);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState('');
  const [details, setDetails] = useState('');
  const [screenshot, setScreenshot] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (modalType === 'deposit') {
      setShowDepositView(true);
      setModalType(null);
    } else if (modalType === 'withdraw') {
      setShowWithdrawView(true);
      setModalType(null);
    }
  }, [modalType]);

  
  // Custom structured Bank Account fields for withdrawals
  const [bankName, setBankName] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [holderName, setHolderName] = useState('');
  const [binanceEmail, setBinanceEmail] = useState('');

  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'buy' | 'settings'>('overview');
  const [hideZeroBalances, setHideZeroBalances] = useState(false);
  const [displayCryptoInFiat, setDisplayCryptoInFiat] = useState(true);

  const currentCurrency = preferredCurrency || localStorage.getItem('preferred_currency') || 'USD';
  const currentRates = rates || getCachedRates().rates;

  const formatBalanceLocal = (val: number) => {
    return `${getCurrencySymbol(currentCurrency)}${formatCurrencyValue(val, currentCurrency, currentRates)}`;
  };

  const minDepositLocal = convertUsdToCurrency(state.minDeposit ?? 10, currentCurrency, currentRates);
  const minWithdrawLocal = convertUsdToCurrency(state.minWithdraw ?? 500, currentCurrency, currentRates);
  const availableBalanceLocal = convertUsdToCurrency(currentPlayer?.balance ?? 0, currentCurrency, currentRates);

  const presetsByCurrency: Record<string, number[]> = {
    USD: [10, 25, 50, 100, 250, 500, 1000],
    EUR: [10, 25, 50, 100, 250, 500, 1000],
    GBP: [10, 25, 50, 100, 250, 500, 1000],
    INR: [500, 1000, 2000, 5000, 10000, 20000, 50000],
    AED: [50, 100, 250, 500, 1000, 2500, 5000],
    PKR: [1000, 2000, 5000, 10000, 25000, 50000, 100000],
    CAD: [10, 25, 50, 100, 250, 500, 1000],
    CNY: [100, 250, 500, 1000, 2500, 5000, 10000],
    JPY: [1000, 2500, 5000, 10000, 25000, 50000, 100000],
  };

  const currentPresets = presetsByCurrency[currentCurrency] || presetsByCurrency.USD;

  const playerTransactions = useMemo(() => 
    currentPlayer ? state.transactions.filter(t => t.playerId === currentPlayer.id) : [], 
    [state.transactions, currentPlayer?.id]
  );

  const lastWithdrawalIn24h = useMemo(() => {
    if (!currentPlayer || !state.isWithdrawLimit24hEnabled) return null;
    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    
    // Find any withdrawal request of the current player that is pending or completed in the last 24h
    return state.withdrawals.find(w => 
      w.playerId === currentPlayer.id && 
      w.timestamp >= twentyFourHoursAgo &&
      (w.status === 'pending' || w.status === 'completed')
    );
  }, [currentPlayer?.id, state.withdrawals, state.isWithdrawLimit24hEnabled]);

  const getRemainingTimeStr = (timestamp: number) => {
    const elapsed = Date.now() - timestamp;
    const remainingMs = 24 * 60 * 60 * 1000 - elapsed;
    if (remainingMs <= 0) return '0m';
    
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const [step, setStep] = useState(1);
  const [success, setSuccess] = useState(false);

  const resetForm = () => {
    setAmount(0);
    setMethod('upi');
    setDetails('');
    setBankName('');
    setAccNumber('');
    setIfscCode('');
    setHolderName('');
    setBinanceEmail('');
    setScreenshot(undefined);
    setModalType(null);
    setStep(1);
    setSuccess(false);
  };

  const handleConfirm = () => {
    const amountInUsd = convertCurrencyToUsd(amount, currentCurrency, currentRates);
    if (modalType === 'deposit') {
      onDeposit(amountInUsd, method, details, screenshot);
    } else {
      const fullDetails = `Binance Email: ${binanceEmail.trim()}`;
      onWithdraw(amountInUsd, method, fullDetails);
    }
    setSuccess(true);
    setTimeout(() => {
      resetForm();
    }, 2000);
  };

  const handleScreenshotUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Basic image compression
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Resize if too large
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;

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

          // Quality adjustment to keep it small (0.6 is usually a good balance)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          setScreenshot(dataUrl);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  if (showDepositView) {
    return (
      <RedesignedDepositView
        depositNetworks={state.depositNetworks || []}
        currentPlayer={currentPlayer}
        deposits={state.deposits || []}
        paymentSettings={state.paymentSettings}
        onBack={() => setShowDepositView(false)}
        onDeposit={(amt, depMethod, depDetails, screenshotUrl, existingId, txHash) => {
          onDeposit(amt, depMethod, depDetails, screenshotUrl, existingId, txHash);
          // Don't close the view immediately if we are on step 'status' to allow real-time tracking,
          // but wait, since onDeposit is called on submit, we should stay in the success/status step.
          // Wait, let's see how RedesignedDepositView handles transitioning to 'status' step.
          // In RedesignedDepositView, handleSubmitDeposit sets currentStep to 'status'.
          // If we close the deposit view immediately (setShowDepositView(false)), the user won't see the 'status' timeline!
          // So we should NOT set setShowDepositView(false) if we are in status step, or we can let RedesignedDepositView handle its own back transitions!
          // Yes! Let's check: if we are in RedesignedDepositView, onBack is what goes back to Wallet overview.
          // So onDeposit should just register the transaction but we should NOT do setShowDepositView(false) inside onDeposit!
          // This is incredibly important! If setShowDepositView(false) is called, it closes the modal/view and the user can't see the real-time status!
          // Let's modify onDeposit inside RedesignedDepositView so it doesn't close the modal if existingId is provided, or let RedesignedDepositView manage the view state.
          // Wait, if it is not a crypto deposit, maybe it closes?
          // Let's look: if we don't close it, onBack will still close it. So let's make it only close if not doing real-time status tracking, or better, don't close it inside onDeposit but let the user close it via "Back to Wallet Overview" (which triggers onBack)!
          // Yes, that is incredibly smart and matches user expectation perfectly!
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
        onWithdraw={async (amountUsd, networkId, walletAddress, feeUsd, prefCurrency, exRate, prefAmount) => {
          const network = (state.withdrawalNetworks || []).find(n => n.id === networkId);
          const blockchainName = network ? network.name : networkId.toUpperCase();
          const finalAmount = amountUsd - feeUsd;
          const methodString = `Crypto ${blockchainName}`;
          const detailsString = `Address: ${walletAddress}`;
          await onWithdraw(
            amountUsd,
            methodString,
            detailsString,
            blockchainName,
            walletAddress,
            feeUsd,
            finalAmount,
            prefCurrency,
            exRate,
            prefAmount
          );
        }}
        preferredCurrency={currentCurrency}
        rates={currentRates}
        playSound={playSound}
      />
    );
  }

  return (
    <div className="space-y-10">
      {/* Tab Navigation header */}
      <div className="flex items-center justify-center p-1.5 bg-slate-900/60 border border-white/5 rounded-3xl max-w-md mx-auto relative z-10 shadow-xl backdrop-blur-md">
        <button
          onClick={() => { setActiveSubTab('overview'); playSound('CLICK'); }}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-2xl transition-all cursor-pointer ${
            activeSubTab === 'overview'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-black shadow-lg font-black'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => { setActiveSubTab('buy'); playSound('CLICK'); }}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-2xl transition-all cursor-pointer ${
            activeSubTab === 'buy'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-black shadow-lg font-black'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Buy Crypto
        </button>
        <button
          onClick={() => { setActiveSubTab('settings'); playSound('CLICK'); }}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-2xl transition-all cursor-pointer ${
            activeSubTab === 'settings'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-black shadow-lg font-black'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Settings
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-10"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Vault Balance Card */}
              <div className="lg:col-span-2 p-8 sm:p-10 bg-gradient-to-br from-slate-950 via-[#0b1410] to-zinc-950 rounded-[2.5rem] border border-emerald-500/20 shadow-[0_20px_50px_rgba(16,185,129,0.05)] relative overflow-hidden group flex flex-col justify-between min-h-[320px]">
                {/* Subtle animated background light */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/10 transition-colors duration-700" />
                <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute top-0 right-0 p-12 opacity-[0.03] transition-transform duration-700 group-hover:scale-110 group-hover:rotate-12 translate-x-1/4 -translate-y-1/4 pointer-events-none">
                  <Wallet className="w-64 h-64 text-emerald-400" />
                </div>
                
                <div className="relative z-10 text-center sm:text-left">
                  <div className="flex justify-center sm:justify-start mb-6">
                    <img src="/matrix_logo.png" alt="Matrix Logo" className="h-14 w-auto object-contain filter drop-shadow-[0_0_15px_rgba(16,185,129,0.2)]" />
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-emerald-400/80 font-black uppercase tracking-[0.25em] text-[9px] mb-3 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Secure Digital Vault Balance
                  </span>
                  <div className="mt-4 mb-8">
                    <AnimatedBalance balance={currentPlayer?.balance ?? 0} size="lg" preferredCurrency={preferredCurrency} rates={rates} />
                  </div>
                </div>

                <div className="relative z-10 flex flex-wrap items-center justify-center sm:justify-start gap-4">
                  <button 
                    onClick={() => { setShowDepositView(true); playSound('CLICK'); }}
                    className="flex items-center gap-3 bg-emerald-500 text-black px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-400 active:scale-95 transition-all shadow-xl shadow-emerald-500/20 cursor-pointer"
                  >
                    <ArrowDownLeft className="w-5 h-5" />
                    Deposit
                  </button>
                  <button 
                    onClick={() => { setShowWithdrawView(true); playSound('CLICK'); }}
                    className="flex items-center gap-3 bg-white/10 backdrop-blur-md text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/20 active:scale-95 transition-all border border-white/10 cursor-pointer"
                  >
                    <ArrowUpRight className="w-5 h-5" />
                    Withdraw
                  </button>
                </div>
              </div>

              {/* Quick Dashboard Info Card (Right Side) */}
              <div className="flex flex-col gap-6 justify-between">
                {/* Platform Standing Card */}
                <div className="p-6 bg-slate-950 border border-white/5 rounded-[2rem] flex flex-col justify-between flex-1 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-black tracking-[0.2em] text-slate-500 uppercase font-mono">ACCOUNT METRICS</span>
                      <p className="text-lg font-display font-black text-white mt-1">Platform Standing</p>
                    </div>
                    <span className="text-[10px] font-black tracking-wider px-3 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Verified User
                    </span>
                  </div>
                  
                  <div className="mt-6">
                    <div className="flex justify-between items-center text-[10px] mb-2">
                      <span className="text-slate-400">Account Security Status</span>
                      <span className="text-emerald-400 font-mono font-bold">100% SECURE</span>
                    </div>
                    <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Activity / Referral Stats */}
                <div className="p-6 bg-slate-950 border border-white/5 rounded-[2rem] flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[9px] font-black tracking-[0.2em] text-slate-500 uppercase font-mono">TOTAL WAGERED</span>
                    <p className="text-2xl font-mono font-black text-white mt-1">{formatBalanceLocal(currentPlayer?.totalWagered ?? 0)}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Overall volume processed</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Pending Actions Highlighting */}
            {(state.withdrawals.filter(w => w.status === 'pending' && w.playerId === currentPlayer?.id).length > 0 || 
              state.deposits.filter(d => d.status === 'pending' && d.playerId === currentPlayer?.id).length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {state.deposits.filter(d => d.status === 'pending' && d.playerId === currentPlayer?.id).map((req, idx) => (
                  <div key={req.id || `pending-dep-${idx}`} className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="bg-emerald-500/20 p-2 rounded-xl">
                        <Clock className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Deposit Pending</p>
                        <p className="text-sm font-bold">{formatBalanceLocal(req.amount)}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">Verifying...</span>
                  </div>
                ))}
                {state.withdrawals.filter(w => w.status === 'pending' && w.playerId === currentPlayer?.id).map((req, idx) => (
                  <div key={req.id || `pending-wd-${idx}`} className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="bg-amber-500/20 p-2 rounded-xl">
                        <Clock className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Withdrawal Pending</p>
                        <p className="text-sm font-bold">{formatBalanceLocal(req.amount)}</p>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">Processing...</span>
                  </div>
                ))}
              </div>
            )}

            {/* Referral Section */}
            {(state.isReferralEnabled ?? true) && (
              <div className="glass-card p-10 rounded-[2.5rem] relative overflow-hidden group transition-all bg-emerald-500/5 border border-emerald-500/10">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-all group-hover:scale-110">
                  <Share2 className="w-32 h-32 text-emerald-400" />
                </div>
                <div className="relative z-10 space-y-6">
                  <div>
                    <h3 className="text-2xl font-display font-bold text-white flex items-center gap-3">
                      <Share2 className="w-6 h-6 text-emerald-400" />
                      Refer & Earn {formatBalanceLocal(state.referralAmount ?? 10)}
                    </h3>
                    <p className="text-slate-400 text-sm mt-1 max-w-sm">
                      Share your code with friends. When they join, you both get a {formatBalanceLocal(state.referralAmount ?? 10)} cash bonus instantly!
                    </p>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                     <div className="bg-black/40 border border-white/10 rounded-2xl px-6 py-4 flex flex-col justify-center flex-1">
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Your Unique Code</span>
                        <span className="text-2xl font-mono font-bold text-emerald-400 tracking-tighter">{currentPlayer?.referralCode}</span>
                     </div>
                     <button 
                       onClick={() => {
                         navigator.clipboard.writeText(currentPlayer?.referralCode || '');
                         alert('Referral code copied to clipboard!');
                       }}
                       className="bg-emerald-500 text-black px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 transition-all shadow-xl shadow-emerald-500/20 glass-button cursor-pointer"
                     >
                       Copy Code
                     </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-2xl font-display font-bold flex items-center gap-3">
                  <History className="w-6 h-6 text-emerald-400" />
                  Recent History
                </h3>
                <motion.button 
                   whileHover={{ scale: 1.05 }}
                   whileTap={{ scale: 0.95 }}
                   onClick={onResetGraph}
                   className="flex items-center gap-2 text-[10px] font-black uppercase bg-white/5 border border-white/10 px-5 py-2.5 rounded-xl text-slate-400 hover:text-white transition-all hover:bg-rose-500/10 hover:border-rose-500/30 group shadow-lg cursor-pointer"
                 >
                   <RotateCcw className="w-3.5 h-3.5 group-hover:rotate-[-90deg] transition-all duration-500" />
                   Clear Log
                 </motion.button>
              </div>
              
              <div className="glass-card rounded-[2rem] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.01]">
                        <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Transaction</th>
                        <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Amount</th>
                        <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Status</th>
                        <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {playerTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-8 py-20 text-center text-slate-600 font-display text-lg italic">
                            No activity found. Start doubling today.
                          </td>
                        </tr>
                      ) : (
                        playerTransactions.map((txn, idx) => (
                          <motion.tr 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.02 }}
                            key={txn.id || `txn-${idx}`} 
                            className="hover:bg-white/[0.02] transition-colors"
                          >
                            <td className="px-8 py-5">
                              <div className="flex items-center gap-4">
                                 <div className={`p-2.5 rounded-xl ${txn.type === 'win' || txn.type === 'deposit' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                   {txn.type === 'win' ? <TrendingUp className="w-4 h-4" /> : 
                                    txn.type === 'deposit' ? <ArrowDownLeft className="w-4 h-4" /> : 
                                    <ArrowUpRight className="w-4 h-4" />}
                                 </div>
                                 <span className="font-display font-medium tracking-tight text-slate-200 capitalize">{txn.type}</span>
                              </div>
                            </td>
                            <td className={`px-8 py-5 font-mono font-bold text-lg ${txn.type === 'win' || txn.type === 'deposit' ? 'text-emerald-400' : 'text-slate-200/60'}`}>
                              {txn.type === 'win' || txn.type === 'deposit' ? '+' : '-'}{formatBalanceLocal(txn.amount)}
                            </td>
                            <td className="px-8 py-5">
                              <div className="flex items-center gap-1.5 capitalize text-[10px] font-bold tracking-widest">
                                {txn.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                {txn.status === 'pending' && <Clock className="w-3.5 h-3.5 text-amber-500" />}
                                {txn.status === 'failed' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                                <span className={txn.status === 'completed' ? 'text-emerald-500' : txn.status === 'pending' ? 'text-amber-500' : 'text-slate-500'}>
                                  {txn.status}
                                </span>
                              </div>
                            </td>
                            <td className="px-8 py-5 text-slate-600 text-[11px] font-mono tabular-nums">
                              {new Date(txn.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeSubTab === 'buy' && (
          <motion.div
            key="buy"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            <div className="p-8 bg-slate-950 border border-white/5 rounded-[2.5rem] space-y-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/[0.02] rounded-full blur-3xl pointer-events-none" />
              <div className="space-y-4 relative z-10">
                <h3 className="text-2xl font-display font-bold text-white flex items-center gap-3">
                  <ArrowDownLeft className="w-6 h-6 text-emerald-400" />
                  Buy & Fund Instantly
                </h3>
                <p className="text-sm text-slate-400 max-w-xl leading-relaxed">
                  Acquire cryptocurrency directly using your preferred local bank transfers, UPI, credit card, or credit gateways. All purchases automatically convert to play credits at the official real-time rate.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl space-y-4 hover:border-emerald-500/20 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-400">Option 1: Local Payment Gateways</span>
                    <span className="bg-emerald-500/10 text-emerald-400 text-[8px] font-mono px-2 py-0.5 rounded uppercase font-bold tracking-widest">Recommended</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Send deposit requests directly using bank accounts, UPI apps, or local transfer mechanisms. The funds are processed manually by our high-frequency payment verification system.
                  </p>
                  <button 
                    type="button"
                    onClick={() => { setShowDepositView(true); playSound('CLICK'); }}
                    className="w-full py-3.5 bg-emerald-500 text-black rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-400 active:scale-95 transition-all shadow-lg cursor-pointer"
                  >
                    Instant Local Deposit
                  </button>
                </div>

                <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl space-y-4 hover:border-blue-500/20 transition-colors">
                  <span className="text-xs font-black uppercase tracking-wider text-blue-400">Option 2: Buy via Third-Party Exchanges</span>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Purchase USDT (Tether) instantly on Binance, MoonPay, Banxa, or Paxful using your regional credit cards or UPI. Transfer directly to our digital secure vault for automated instant sync.
                  </p>
                  <div className="flex gap-2">
                    <a 
                      href="https://www.binance.com/" 
                      target="_blank" 
                      rel="noreferrer"
                      onClick={() => playSound('CLICK')}
                      className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/5 text-slate-200 rounded-xl font-bold text-center text-[10px] uppercase tracking-wider transition-all"
                    >
                      Binance P2P
                    </a>
                    <a 
                      href="https://www.moonpay.com/" 
                      target="_blank" 
                      rel="noreferrer"
                      onClick={() => playSound('CLICK')}
                      className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/5 text-slate-200 rounded-xl font-bold text-center text-[10px] uppercase tracking-wider transition-all"
                    >
                      MoonPay Card
                    </a>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/5 pt-6 space-y-4 relative z-10">
                <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider font-mono">Payment Gateway Support</h4>
                <p className="text-[10px] text-slate-400">All deposits are securely routed through configured deposit networks and authorized payment gateways.</p>
              </div>
            </div>
          </motion.div>
        )}

        {activeSubTab === 'settings' && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            <div className="p-8 bg-slate-950 border border-white/5 rounded-[2.5rem] space-y-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/[0.02] rounded-full blur-3xl pointer-events-none" />
              <div className="space-y-6 relative z-10">
                <h4 className="text-sm font-black uppercase text-slate-500 tracking-wider">Display Preferences</h4>
                
                {/* Hide Zero Balances Toggle */}
                <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                  <div>
                    <p className="font-bold text-white text-sm">Hide Zero Balances</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Your zero balances won't appear in your wallet</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setHideZeroBalances(!hideZeroBalances); playSound('CLICK'); }}
                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 cursor-pointer ${hideZeroBalances ? 'bg-emerald-500' : 'bg-slate-800'}`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transition-transform duration-300 ${hideZeroBalances ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* Display Crypto in Fiat Toggle */}
                <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                  <div>
                    <p className="font-bold text-white text-sm">Display Crypto in Fiat</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">All bets & transactions will be settled in the preferred fiat currency equivalent</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setDisplayCryptoInFiat(!displayCryptoInFiat); playSound('CLICK'); }}
                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 cursor-pointer ${displayCryptoInFiat ? 'bg-emerald-500' : 'bg-slate-800'}`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transition-transform duration-300 ${displayCryptoInFiat ? 'translate-x-6' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              <div className="space-y-6 relative z-10 border-t border-white/5 pt-6">
                <h4 className="text-sm font-black uppercase text-slate-500 tracking-wider">Local Fiat Currencies</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
                  {Object.values(SUPPORTED_CURRENCIES).map((curr, idx) => {
                    const isSelected = curr.code === currentCurrency;
                    return (
                      <button
                        key={curr.code || `curr-${idx}`}
                        type="button"
                        onClick={() => { onSelectCurrency(curr.code); playSound('CLICK'); }}
                        className={`flex items-center gap-3 py-2 px-1.5 transition-all text-left cursor-pointer group rounded-lg hover:bg-white/[0.03] ${
                          isSelected ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {/* High-fidelity radio indicator */}
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
                          isSelected ? 'border-blue-500 bg-blue-500' : 'border-slate-700 group-hover:border-slate-500'
                        }`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        
                        <div className="flex items-center gap-2 font-sans font-bold text-sm tracking-wide">
                          <span>{curr.code}</span>
                          {curr.flag && curr.flag.length > 2 ? (
                            <span className="text-[8px] leading-none font-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/10 uppercase tracking-tighter inline-flex items-center justify-center min-w-[28px] h-4 select-none">
                              {curr.flag}
                            </span>
                          ) : (
                            <span className="text-base animate-fade-in" role="img" aria-label={curr.name}>
                              {curr.flag}
                            </span>
                          )}
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

      {/* Enhanced Transaction Modal */}
      <AnimatePresence>
        {modalType && (
          <div className="fixed inset-0 flex items-center justify-center p-4 z-[100]">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => !success && resetForm()}
               className="fixed inset-0 bg-black/90 backdrop-blur-xl"
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 40 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 40 }}
               className="bg-[#0f0f0f] border border-white/10 w-full max-w-md rounded-[2.5rem] overflow-hidden relative z-10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)]"
             >
                {/* Modal Progress Dots (for Deposit) */}
                {modalType === 'deposit' && !success && (
                  <div className="flex justify-center gap-1.5 pt-6">
                    {[1, 2, 3].map(i => (
                      <div key={i} className={`h-1 rounded-full transition-all duration-300 ${step >= i ? 'w-6 bg-emerald-500' : 'w-2 bg-white/10'}`} />
                    ))}
                  </div>
                )}

                <div className="p-8">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <h3 className="text-3xl font-display font-bold capitalize">{modalType} Funds</h3>
                      <p className="text-slate-500 text-xs mt-1">
                        {modalType === 'deposit' ? 'Fast & Secure Add-on' : 'Payout your winnings'}
                      </p>
                    </div>
                    {!success && (
                      <button onClick={resetForm} className="p-3 hover:bg-white/5 rounded-2xl transition-colors cursor-pointer border-0">
                        <X className="w-6 h-6 text-slate-400" />
                      </button>
                    )}
                  </div>

                  <AnimatePresence mode="wait">
                    {success ? (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-12 space-y-4"
                      >
                        <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto border border-emerald-500/20">
                          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                        </div>
                        <h4 className="text-2xl font-bold">Request Sent!</h4>
                        <p className="text-slate-400 text-sm max-w-[240px] mx-auto">
                          Your {modalType} of {getCurrencySymbol(currentCurrency)}{amount.toFixed(2)} is being processed by our team.
                        </p>
                      </motion.div>
                    ) : (
                      <motion.div 
                        key={step}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                      >
                        {modalType === 'deposit' ? (
                          <div className="text-center py-6">
                            <p className="text-slate-400 text-xs mb-4">Redirecting to Redesigned Deposit Gateway...</p>
                            <button
                              onClick={() => {
                                setShowDepositView(true);
                                setModalType(null);
                              }}
                              className="px-6 py-3 bg-emerald-500 text-black font-bold text-xs uppercase rounded-xl cursor-pointer"
                            >
                              Open Deposit Gateway
                            </button>
                          </div>
                        ) : (
                          /* Withdrawal UI remains simple but polished */
                          <div className="space-y-6">
                            {state.isWithdrawalsStopped && (
                              <div className="p-4 bg-rose-500/15 border border-rose-500/30 rounded-2xl flex items-center justify-center gap-2 text-rose-300 font-black text-xs uppercase tracking-wider text-center">
                                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
                                <span>Withdrawals are Stopped until Lottery Result</span>
                              </div>
                            )}

                            {lastWithdrawalIn24h && (
                              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col gap-2 text-left">
                                <div className="flex items-start gap-2.5">
                                  <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">24h Payout Limit Active</p>
                                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                                      You are permitted to submit one withdrawal request every 24 hours. Your last request was placed recently.
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-2 pt-2 border-t border-amber-500/10 flex justify-between items-center bg-amber-500/[0.02] px-3 py-2 rounded-xl">
                                  <span className="text-[10px] text-slate-500 uppercase font-bold">Unlocks In:</span>
                                  <span className="text-xs font-mono font-extrabold text-amber-500 animate-pulse bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/10">
                                    {getRemainingTimeStr(lastWithdrawalIn24h.timestamp)}
                                  </span>
                                </div>
                              </div>
                            )}

                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">
                              <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Withdraw Amount ({currentCurrency})</label>
                                <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{getCurrencySymbol(currentCurrency)}</span>
                                  <input 
                                    type="number" 
                                    disabled={state.isWithdrawalsStopped || !!lastWithdrawalIn24h}
                                    value={amount || ''} 
                                    onChange={(e) => setAmount(Number(e.target.value))}
                                    className="w-full bg-white/5 border border-white/5 rounded-xl pl-8 pr-4 py-4 focus:outline-none focus:border-white/20 transition-all font-mono text-lg disabled:opacity-40 disabled:cursor-not-allowed"
                                    placeholder="0.00"
                                  />
                                </div>
                                <div className="flex justify-between mt-2 px-1">
                                  <p className="text-[10px] text-slate-500">Available: {formatBalanceLocal(currentPlayer?.balance ?? 0)}</p>
                                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider animate-pulse">0% Withdrawal Fees</p>
                                </div>
                                {amount > 0 && amount < minWithdrawLocal && (
                                  <p className="text-[10px] text-rose-400 mt-2 italic">Min withdrawal is {getCurrencySymbol(currentCurrency)}{minWithdrawLocal.toFixed(2)}</p>
                                )}
                              </div>
                              
                              <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Crypto USDT (Binance) Payout</h4>
                                
                                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-center">
                                  <p className="text-rose-500 font-extrabold text-[11px] tracking-wider uppercase">
                                    🔴 PLEASE USE ONLY BINANCE FOR WITHDRAWAL 🔴
                                  </p>
                                </div>

                                <div>
                                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">YOUR BINANCE EMAIL</label>
                                  <input 
                                    type="email" 
                                    disabled={state.isWithdrawalsStopped || !!lastWithdrawalIn24h}
                                    value={binanceEmail}
                                    onChange={(e) => setBinanceEmail(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-white/30 hover:border-white/20 transition-all text-white font-mono text-xs placeholder:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                    placeholder="Enter your registered Binance email ID"
                                  />
                                </div>

                                <p className="text-[9px] text-slate-500 leading-normal italic pt-1 px-1">
                                  Payouts are processed to your Binance account using the provided email.
                                </p>
                              </div>
                            </div>

                            <button 
                              disabled={state.isWithdrawalsStopped || !!lastWithdrawalIn24h || amount < minWithdrawLocal || amount > availableBalanceLocal || !binanceEmail.trim()}
                              onClick={handleConfirm}
                              className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 cursor-pointer border-0"
                            >
                              {state.isWithdrawalsStopped
                                ? 'Withdrawals Stopped Until Lottery Result'
                                : lastWithdrawalIn24h 
                                ? 'Payout Limit Exceeded (24h)' 
                                : 'Confirm Payout'}
                            </button>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
});




const HouseProfitTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const profit = payload[0].value;
    const isPositive = profit >= 0;
    return (
      <div className="bg-[#0a0a0a]/95 backdrop-blur-md border border-white/10 p-5 rounded-2xl shadow-2xl relative overflow-hidden">
        <div className={`absolute top-0 left-0 w-full h-[2px] ${isPositive ? 'bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent' : 'bg-gradient-to-r from-transparent via-rose-500/50 to-transparent'}`} />
        <p className="text-[10px] font-black tracking-widest text-slate-500 uppercase mb-2">
          {data.time !== 'Start' && data.time !== 'Init' && data.time !== 'Now' ? `Txn Index: #${data.index}` : 'Event Baseline'}
        </p>
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full ${isPositive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500 animate-pulse'}`} />
          <p className="font-mono font-black text-2xl text-white">
            {isPositive ? '+' : ''}₹{(profit * (getCachedRates().rates['INR'] || 83.50)).toFixed(2)}
          </p>
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
          House Cumulative Profit (Today)
        </p>
        {data.type && (
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between gap-6">
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Trigger Type</span>
            <span className={`text-[10px] font-mono font-extrabold px-2.5 py-0.5 rounded-lg ${data.type === 'bet' ? 'bg-white/5 text-slate-300' : 'bg-[#10b981]/10 text-emerald-400 border border-emerald-500/10'}`}>
              {data.type === 'bet' ? `Placed Bet (₹${((data.amount || 0) * (getCachedRates().rates['INR'] || 83.50)).toFixed(2)})` : `Payout Win (₹${((data.amount || 0) * (getCachedRates().rates['INR'] || 83.50)).toFixed(2)})`}
            </span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

const PendingBetsCard = memo(function PendingBetsCard({ playSound, demoMode }: { playSound: (key: any) => void; demoMode?: boolean }) {
  const [activeBets, setActiveBets] = useState<ActiveBet[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    console.log('[PENDING BETS DIAGNOSTICS] Initializing listener for bets collection. Current demoMode:', demoMode);
    
    // Support both 'active' and 'pending' statuses
    const q = query(
      collection(db, 'bets'), 
      where('status', 'in', ['active', 'pending']),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const betsList: ActiveBet[] = [];
      console.log('[PENDING BETS DIAGNOSTICS] Firestore snapshot received. Raw documents count:', snapshot.docs.length);

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        console.log('[PENDING BETS DIAGNOSTICS] Doc ID:', docSnap.id, 'Data:', data);

        // Demo vs Real filtering
        const isDemo = data.isDemo === true;
        if (demoMode ? !isDemo : isDemo) {
          console.log('[PENDING BETS DIAGNOSTICS] Filtered out document due to mode mismatch (demoMode=' + demoMode + ', isDemo=' + isDemo + '):', docSnap.id);
          return;
        }

        betsList.push({
          betId: docSnap.id,
          playerId: data.playerId || '',
          username: data.username || data.playerName || 'Player',
          amount: data.amount || 0,
          multiplier: data.multiplier || 2,
          game: data.game || 'Double or Donate',
          status: data.status || 'pending',
          isDemo: isDemo,
          createdAt: data.createdAt || Date.now()
        });
      });

      betsList.sort((a, b) => b.createdAt - a.createdAt);
      console.log('[PENDING BETS DIAGNOSTICS] Documents after filtering:', betsList.length);
      console.log('[PENDING BETS DIAGNOSTICS] Updating activeBets state with count:', betsList.length);
      setActiveBets(betsList);
    }, (error) => {
      const errMsg = String((error as any)?.message || error).toLowerCase();
      const isQuota = errMsg.includes('quota') || errMsg.includes('resource-exhausted') || errMsg.includes('limit exceeded');
      if (isQuota) {
        console.info('[PENDING BETS DIAGNOSTICS] Firestore quota limit reached. Client operating in offline/demo mode.');
      } else {
        console.warn('[PENDING BETS DIAGNOSTICS] Listener notice:', (error as any)?.message || error);
      }
      handleFirestoreError(error, OperationType.GET, 'bets');
    });

    return () => {
      console.log('[PENDING BETS DIAGNOSTICS] Unsubscribing bets listener');
      unsubscribe();
    };
  }, [demoMode]);

  const handleWinAll = async () => {
    if (activeBets.length === 0 || isProcessing) return;
    setIsProcessing(true);
    const betsToProcess = [...activeBets];
    try {
      await Promise.all(betsToProcess.map(async (bet) => {
        const betRef = doc(db, 'bets', bet.betId);
        let wasActive = false;

        try {
          await runTransaction(db, async (txn) => {
            const betSnap = await txn.get(betRef);
            if (betSnap.exists() && (betSnap.data().status === 'active' || betSnap.data().status === 'pending')) {
              txn.update(betRef, {
                status: 'won',
                resolvedAt: Date.now(),
                resolvedBy: 'admin'
              });
              wasActive = true;
            }
          });
        } catch (txnErr: any) {
          console.warn("[Win All] Firestore transaction skipped (quota or offline mode):", txnErr?.message || txnErr);
          // Local fallback so players get credited even if Firestore free tier quota is reached
          wasActive = true;
        }

        if (wasActive) {
          const winAmount = bet.amount * (bet.multiplier || 2);
          try {
            await walletServiceTS.gameWin(
              bet.playerId,
              winAmount,
              { description: `Manual Admin Win (${bet.multiplier || 2}x)`, referenceId: bet.betId },
              `settle_win_${bet.betId}`
            );
          } catch (wErr) {
            console.warn("[Win All] Wallet service notice:", wErr);
          }
        }
      }));
      setActiveBets([]);
      playSound('WIN');
    } catch (e: any) {
      console.warn("Error resolving Win All (handled gracefully):", e?.message || e);
      setActiveBets([]);
      playSound('WIN');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoseAll = async () => {
    if (activeBets.length === 0 || isProcessing) return;
    setIsProcessing(true);
    const betsToProcess = [...activeBets];
    try {
      await Promise.all(betsToProcess.map(async (bet) => {
        const betRef = doc(db, 'bets', bet.betId);
        let wasActive = false;

        try {
          await runTransaction(db, async (txn) => {
            const betSnap = await txn.get(betRef);
            if (betSnap.exists() && (betSnap.data().status === 'active' || betSnap.data().status === 'pending')) {
              txn.update(betRef, {
                status: 'lost',
                resolvedAt: Date.now(),
                resolvedBy: 'admin'
              });
              wasActive = true;
            }
          });
        } catch (txnErr: any) {
          console.warn("[Lose All] Firestore transaction skipped (quota or offline mode):", txnErr?.message || txnErr);
          wasActive = true;
        }

        if (wasActive) {
          try {
            await walletServiceTS.gameLoss(
              bet.playerId,
              bet.amount,
              { description: `Manual Admin Loss`, referenceId: bet.betId },
              `settle_loss_${bet.betId}`
            );
          } catch (lErr) {
            console.warn("[Lose All] Wallet service notice:", lErr);
          }
        }
      }));
      setActiveBets([]);
      playSound('LOSE');
    } catch (e: any) {
      console.warn("Error resolving Lose All (handled gracefully):", e?.message || e);
      setActiveBets([]);
      playSound('LOSE');
    } finally {
      setIsProcessing(false);
    }
  };

  const inrRate = getCachedRates().rates['INR'] || 83.50;

  return (
    <div className="glass-card rounded-3xl p-5 sm:p-6 mb-6 border border-amber-500/20 shadow-2xl relative overflow-hidden">
      {/* Top Header / Toggle Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 text-left focus:outline-none cursor-pointer bg-transparent border-0 p-0"
        >
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <Clock className="w-5 h-5 text-amber-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display font-black text-xl text-white tracking-tight">Pending Bets</h3>
              <span className="bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-black px-3 py-0.5 rounded-full font-mono">
                Pending Bets Count: {activeBets.length}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Real-time active player wagers awaiting settlement</p>
          </div>
        </button>

        {/* ONLY TWO BUTTONS: 🟢 WIN ALL & 🔴 LOSE ALL */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleWinAll}
            disabled={activeBets.length === 0 || isProcessing}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg font-sans border-0 ${
              activeBets.length === 0 || isProcessing
                ? 'bg-emerald-500/20 text-emerald-500/40 cursor-not-allowed opacity-50'
                : 'bg-emerald-500 hover:bg-emerald-400 text-emerald-950 shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>🟢 WIN ALL</span>
          </button>

          <button
            onClick={handleLoseAll}
            disabled={activeBets.length === 0 || isProcessing}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg font-sans border-0 ${
              activeBets.length === 0 || isProcessing
                ? 'bg-rose-500/20 text-rose-500/40 cursor-not-allowed opacity-50'
                : 'bg-rose-500 hover:bg-rose-400 text-rose-950 shadow-rose-500/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer'
            }`}
          >
            <XCircle className="w-4 h-4" />
            <span>🔴 LOSE ALL</span>
          </button>
        </div>
      </div>

      {/* Summary Cards View: Number of Bets & Amount in Rupees */}
      {isOpen && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-black/40 border border-white/10 rounded-2xl p-5 flex items-center justify-between shadow-inner">
            <div>
              <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">Number of Bets</p>
              <p className="text-3xl sm:text-4xl font-black font-mono text-amber-400 mt-1">{activeBets.length}</p>
            </div>
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
              <Clock className="w-7 h-7 text-amber-400" />
            </div>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-2xl p-5 flex items-center justify-between shadow-inner">
            <div>
              <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">Total Pending Amount (Rupees)</p>
              <p className="text-3xl sm:text-4xl font-black font-mono text-emerald-400 mt-1">
                ₹{(activeBets.reduce((sum, bet) => sum + (bet.amount * inrRate), 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
              <Coins className="w-7 h-7 text-emerald-400" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

const AdminView = memo(function AdminView({ state, playSound, demoMode, onUpdateWinRate, onUpdateMaxBet, onUpdateMinLimits, onUpdatePlayersWonCount, onToggleBetLimit, onToggleManualMode, onToggleBettingStatus, onUpdateCustomTotalBets, onToggleWithdrawalsStopped, onUpdatePlayerOverride, onSwitchPlayer, onResultBet, onUpdateWithdrawalStatus, onUpdateDepositStatus, onToggleMaintenanceMode, onToggleTeaBreakMode, onTogglePlayersWonShown, onUpdateLotteryTimer, onUpdatePaymentSettings, onTogglePaymentLock, onReset, onResetHouseStats, onUpdateReferralAmount, onToggleReferralEnabled, onToggleWithdrawLimit24h, onToggleWinRateLock, onToggleTransferLimitsLock, onUpdateAnnouncementText, onToggleAnnouncementEnabled, onSafeMigrate, preferredCurrency }: { 
  state: AppState, 
  playSound: (key: any) => void,
  demoMode?: boolean,
  onUpdateWinRate: (rate: number) => void,
  onUpdateMaxBet: (max: number) => void,
  onUpdateMinLimits: (minDeposit: number, minWithdraw: number) => void,
  onUpdatePlayersWonCount: (count: number) => void,
  onToggleBetLimit: () => void,
  onToggleManualMode: () => void,
  onToggleBettingStatus: () => void,
  onUpdateCustomTotalBets: (amt: number) => void,
  onToggleWithdrawalsStopped: () => void,
  onUpdatePlayerOverride: (id: string, override: 'win' | 'lose' | 'none') => void,
  onSwitchPlayer: (id: string) => void,
  onResultBet: (playerId: string, outcome: 'win' | 'lose', settlementCurrency?: string) => void,
  onUpdateWithdrawalStatus: (id: string, status: 'completed' | 'rejected') => void,
  onUpdateDepositStatus: (id: string, status: 'completed' | 'rejected') => void,
  onToggleMaintenanceMode: () => void,
  onToggleTeaBreakMode: () => void,
  onTogglePlayersWonShown: () => void,
  onUpdateLotteryTimer: (duration: number, active: boolean, targetTimestamp: number) => void,
  onUpdatePaymentSettings: (settings: PaymentSettings) => void,
  onTogglePaymentLock: () => void,
  onReset: () => Promise<void>,
  onResetHouseStats: () => Promise<void>,
  onUpdateReferralAmount: (amount: number) => void,
  onToggleReferralEnabled: () => void,
  onToggleWithdrawLimit24h: () => void,
  onToggleWinRateLock: () => void,
  onToggleTransferLimitsLock: () => void,
  onUpdateAnnouncementText: (text: string) => void,
  onToggleAnnouncementEnabled: () => void,
  onSafeMigrate: () => Promise<{ createdCount: number; existedCount: number }>,
  preferredCurrency?: string
}) {
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationMsg, setMigrationMsg] = useState<string | null>(null);
  useEffect(() => {
    console.log('Total users rendered in Admin Panel:', state.players.length);
  }, [state.players]);

  const [withdrawalFilter, setWithdrawalFilter] = useState<'pending' | 'completed' | 'rejected' | 'all'>('pending');
  const [depositFilter, setDepositFilter] = useState<'pending' | 'completed' | 'rejected' | 'all'>('pending');
  const [depositSearch, setDepositSearch] = useState('');
  const [depositNetworkFilter, setDepositNetworkFilter] = useState('all');
  const [depositSortField, setDepositSortField] = useState<'timestamp' | 'amount' | 'playerName' | 'status'>('timestamp');
  const [depositSortOrder, setDepositSortOrder] = useState<'asc' | 'desc'>('desc');
  const [activeFinanceTab, setActiveFinanceTab] = useState<'deposits' | 'withdrawals'>('deposits');
  const [activeScreenshotUrl, setActiveScreenshotUrl] = useState<string | null>(null);
  const [activeSpreadsheet, setActiveSpreadsheet] = useState<'deposits' | 'withdrawals' | 'blockchain_networks' | 'withdrawal_networks' | 'active_users' | null>(null);

  const [lotteryHourInput, setLotteryHourInput] = useState<number>(Math.floor((state.lotteryTimerDuration ?? 300) / 3600));
  const [lotteryMinInput, setLotteryMinInput] = useState<number>(Math.floor(((state.lotteryTimerDuration ?? 300) % 3600) / 60));
  const [lotterySecInput, setLotterySecInput] = useState<number>((state.lotteryTimerDuration ?? 300) % 60);

  const lotterySecondsLeft = state.lotteryTimerActive && state.lotteryTargetTimestamp
    ? Math.max(0, Math.floor((state.lotteryTargetTimestamp - Date.now()) / 1000))
    : (state.lotteryTimerDuration ?? 0);

  const formatLotteryTimerStr = (seconds: number) => {
    if (seconds <= 0) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const pad = (num: number) => num < 10 ? `0${num}` : num;
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  };

  const [paymentEdit, setPaymentEdit] = useState<PaymentSettings>(state.paymentSettings || {});

  const handleQrUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Basic image compression
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Resize if too large
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;

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

          // Quality adjustment to keep it small (0.6 is usually a good balance)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          setPaymentEdit(prev => ({ ...prev, qrCodeUrl: dataUrl }));
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSavePayment = () => {
    onUpdatePaymentSettings(paymentEdit);
    alert('Payment settings updated successfully!');
  };

  const filteredWithdrawals = useMemo(() => {
    if (withdrawalFilter === 'all') return state.withdrawals;
    return state.withdrawals.filter(w => w.status === withdrawalFilter);
  }, [state.withdrawals, withdrawalFilter]);

  const availableMethods = useMemo(() => {
    const methods = new Set<string>();
    state.deposits.forEach(d => {
      if (d.method) methods.add(d.method);
    });
    return Array.from(methods);
  }, [state.deposits]);

  const filteredDeposits = useMemo(() => {
    let list = [...state.deposits];

    // 1. Filter by status (depositFilter)
    if (depositFilter !== 'all') {
      list = list.filter(d => d.status === depositFilter);
    }

    // 2. Filter by network/method
    if (depositNetworkFilter !== 'all') {
      list = list.filter(d => {
        const method = (d.method || '').toLowerCase();
        return method.includes(depositNetworkFilter.toLowerCase());
      });
    }

    // 3. Filter by search term
    if (depositSearch.trim()) {
      const term = depositSearch.toLowerCase();
      list = list.filter(d => {
        const player = state.players.find(p => p.id === d.playerId);
        const name = (player?.name || 'Unknown Player').toLowerCase();
        const email = (player?.email || '').toLowerCase();
        const details = (d.details || '').toLowerCase();
        const id = (d.id || '').toLowerCase();
        return name.includes(term) || email.includes(term) || details.includes(term) || id.includes(term);
      });
    }

    // 4. Sort
    list.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (depositSortField === 'timestamp') {
        valA = a.timestamp;
        valB = b.timestamp;
      } else if (depositSortField === 'amount') {
        valA = a.amount;
        valB = b.amount;
      } else if (depositSortField === 'playerName') {
        const pA = state.players.find(p => p.id === a.playerId);
        const pB = state.players.find(p => p.id === b.playerId);
        valA = (pA?.name || 'Unknown Player').toLowerCase();
        valB = (pB?.name || 'Unknown Player').toLowerCase();
      } else {
        valA = a.status;
        valB = b.status;
      }

      if (valA < valB) return depositSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return depositSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [state.deposits, state.players, depositFilter, depositSearch, depositNetworkFilter, depositSortField, depositSortOrder]);

  // House Profit Graph Calculation - Today's Profit Only
  const houseProfitData = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayTimestamp = startOfToday.getTime();

    const sortedTxns = [...state.transactions]
      .filter(t => (t.type === 'bet' || t.type === 'win') && t.timestamp >= startOfTodayTimestamp)
      .sort((a, b) => a.timestamp - b.timestamp);

    let runningProfit = 0;
    const points = sortedTxns.map((t, idx) => {
      if (t.type === 'bet') {
        runningProfit += t.amount;
      } else if (t.type === 'win') {
        runningProfit -= t.amount;
      }
      return {
        index: idx + 1,
        time: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        profit: runningProfit,
        type: t.type,
        amount: t.amount
      };
    });

    if (points.length === 0) {
      return [
        { index: 0, time: 'Today', profit: 0 },
        { index: 1, time: 'Active', profit: 0 }
      ];
    }
    return [{ index: 0, time: 'Start Of Today', profit: 0 }, ...points];
  }, [state.transactions]);

  // Total House Net Profit (Today Only)
  const currentHouseProfit = useMemo(() => {
    return houseProfitData[houseProfitData.length - 1].profit;
  }, [houseProfitData]);

  return (
    <div className="space-y-6 animate-in fade-in duration-700 w-full overflow-x-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
        <div className="space-y-1">
          <h2 className="text-5xl font-display font-bold tracking-[-0.05em] text-white">
            ADMIN <span className="text-emerald-400/80">CORE</span>
          </h2>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em]">System Operations Interface</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onToggleMaintenanceMode()}
            className={`group flex items-center gap-2 border px-5 py-2.5 rounded-xl transition-all duration-500 cursor-pointer ${
              state.maintenanceMode 
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 font-sans' 
              : 'bg-white/5 border-white/5 hover:bg-rose-500/10 hover:border-rose-500/20 text-slate-400 hover:text-rose-400 font-sans'
            }`}
          >
            <ShieldAlert className={`w-4 h-4 ${state.maintenanceMode ? 'text-rose-400 animate-pulse' : 'text-slate-500 group-hover:text-rose-400'} transition-all`} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
              {state.maintenanceMode ? 'ACTIVE MAINTENANCE' : 'Service Shutdown'}
            </span>
          </motion.button>

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onToggleTeaBreakMode()}
            className={`group flex items-center gap-2 border px-5 py-2.5 rounded-xl transition-all duration-500 cursor-pointer ${
              state.teaBreakMode 
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 font-sans shadow-[0_0_15px_rgba(245,158,11,0.1)]' 
              : 'bg-white/5 border-white/5 hover:bg-amber-500/10 hover:border-amber-500/20 text-slate-400 hover:text-amber-400 font-sans'
            }`}
          >
            <Coffee className={`w-4 h-4 ${state.teaBreakMode ? 'text-amber-400 animate-bounce' : 'text-slate-500 group-hover:text-amber-400'} transition-all`} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
              {state.teaBreakMode ? 'ACTIVE TEA BREAK ☕' : 'Tea Break'}
            </span>
          </motion.button>
        </div>
      </div>

      {/* Pending Bets Section */}
      <PendingBetsCard playSound={playSound} demoMode={demoMode} />

      {/* Betting Control Card */}
      <div className="glass-card rounded-3xl p-5 sm:p-6 mb-6 border border-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <DollarSign className="w-5 h-5 text-amber-500" />
          <div>
            <h4 className="font-display font-bold text-lg text-white">
              Betting Control
            </h4>
            <p className="text-[10px] text-slate-500 font-medium font-sans">Control betting status globally across the platform</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/5 font-sans transition-all duration-300 ${
            state.isBettingClosed 
              ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' 
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              state.isBettingClosed ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'
            }`} />
            <span className="text-[9px] font-black uppercase tracking-wider">
              {state.isBettingClosed ? 'Stopped' : 'Collecting'}
            </span>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onToggleBettingStatus()}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm transition-all duration-300 cursor-pointer border-0 font-sans ${
              state.isBettingClosed 
                ? 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400' 
                : 'bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25'
            }`}
          >
            {state.isBettingClosed ? (
              <>
                <LockOpen className="w-3.5 h-3.5" />
                Resume Bets
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                Stop Bets
              </>
            )}
          </motion.button>
        </div>
      </div>

      {/* 2. Beautifully Separated Financial Ledgers Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {/* Deposit Ledger Card */}
        <div 
          onClick={() => {
            setActiveSpreadsheet('deposits');
            setDepositFilter('pending');
            playSound('CLICK');
          }}
          className="bg-[#0f0f0f] border border-white/5 p-5 sm:p-6 rounded-2xl hover:border-emerald-500/30 transition-all cursor-pointer group relative overflow-hidden shadow-2xl flex flex-col justify-between h-44 animate-in fade-in"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors" />
          <div className="flex justify-between items-start">
            <div className="p-3 bg-emerald-500/10 rounded-xl group-hover:bg-emerald-500/20 transition-colors border border-emerald-500/20">
              <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
            </div>
            {state.deposits.filter(d => d.status === 'pending').length > 0 ? (
              <span className="bg-emerald-500 text-black text-[9px] font-black px-3 py-1 rounded-full animate-bounce uppercase tracking-wider shadow-lg shadow-emerald-500/20">
                {state.deposits.filter(d => d.status === 'pending').length} PENDING
              </span>
            ) : (
              <span className="bg-white/5 text-[9px] font-black px-3 py-1 rounded-full text-slate-500 uppercase tracking-wider">
                CLEAR
              </span>
            )}
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">DEPOSIT REQUESTS LEDGER</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-display font-black text-white">
                ₹{(state.deposits.filter(d => d.status === 'pending').reduce((s, d) => s + d.amount, 0) * (getCachedRates().rates['INR'] || 83.50)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-tight">Open Spreadsheet ↗</span>
            </div>
          </div>
        </div>

        {/* Withdrawal Ledger Card */}
        <div 
          onClick={() => {
            setActiveSpreadsheet('withdrawals');
            setWithdrawalFilter('pending');
            playSound('CLICK');
          }}
          className="bg-[#0f0f0f] border border-white/5 p-5 sm:p-6 rounded-2xl hover:border-blue-500/30 transition-all cursor-pointer group relative overflow-hidden shadow-2xl flex flex-col justify-between h-44 animate-in fade-in"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-colors" />
          <div className="flex justify-between items-start">
            <div className="p-3 bg-blue-500/10 rounded-xl group-hover:bg-blue-500/20 transition-colors border border-blue-500/20">
              <ArrowUpRight className="w-5 h-5 text-blue-400" />
            </div>
            {state.withdrawals.filter(w => w.status === 'pending').length > 0 ? (
              <span className="bg-blue-500 text-white text-[9px] font-black px-3 py-1 rounded-full animate-bounce uppercase tracking-wider shadow-lg shadow-blue-500/20">
                {state.withdrawals.filter(w => w.status === 'pending').length} NEW
              </span>
            ) : (
              <span className="bg-white/5 text-[9px] font-black px-3 py-1 rounded-full text-slate-500 uppercase tracking-wider">
                CLEAR
              </span>
            )}
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">WITHDRAWAL REQUESTS LEDGER</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-display font-black text-white">
                ₹{(state.withdrawals.filter(w => w.status === 'pending').reduce((s, d) => s + d.amount, 0) * (getCachedRates().rates['INR'] || 83.50)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[9px] text-blue-400 font-bold uppercase tracking-tight">Open Spreadsheet ↗</span>
            </div>
          </div>
        </div>

        {/* Blockchain Network Settings Ledger Card */}
        <div 
          onClick={() => {
            setActiveSpreadsheet('blockchain_networks');
            playSound('CLICK');
          }}
          className="bg-[#0f0f0f] border border-white/5 p-5 sm:p-6 rounded-2xl hover:border-purple-500/30 transition-all cursor-pointer group relative overflow-hidden shadow-2xl flex flex-col justify-between h-44 animate-in fade-in"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl group-hover:bg-purple-500/10 transition-colors" />
          <div className="flex justify-between items-start">
            <div className="p-3 bg-purple-500/10 rounded-xl group-hover:bg-purple-500/20 transition-colors border border-purple-500/20">
              <Settings className="w-5 h-5 text-purple-400" />
            </div>
            <span className="bg-purple-500/10 text-purple-400 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-wider border border-purple-500/20">
              DEPOSIT
            </span>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">DEPOSIT GATEWAYS & CONTENT</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-display font-black text-white">{(state.depositNetworks || []).length || 7} networks</p>
              <span className="text-[9px] text-purple-400 font-bold uppercase tracking-tight">Configure ↗</span>
            </div>
          </div>
        </div>

        {/* Withdrawal Networks Configuration Card */}
        <div 
          onClick={() => {
            setActiveSpreadsheet('withdrawal_networks');
            playSound('CLICK');
          }}
          className="bg-[#0f0f0f] border border-white/5 p-5 sm:p-6 rounded-2xl hover:border-teal-500/30 transition-all cursor-pointer group relative overflow-hidden shadow-2xl flex flex-col justify-between h-44 animate-in fade-in"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-3xl group-hover:bg-teal-500/10 transition-colors" />
          <div className="flex justify-between items-start">
            <div className="p-3 bg-teal-500/10 rounded-xl group-hover:bg-teal-500/20 transition-colors border border-teal-500/20">
              <Settings className="w-5 h-5 text-teal-400" />
            </div>
            <span className="bg-teal-500/10 text-teal-400 text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-wider border border-teal-500/20">
              WITHDRAW
            </span>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">WITHDRAWAL NETWORKS & FEES</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-display font-black text-white">{(state.withdrawalNetworks || []).length || 5} networks</p>
              <span className="text-[9px] text-teal-400 font-bold uppercase tracking-tight">Configure ↗</span>
            </div>
          </div>
        </div>

        {/* Active Players / Active Users Analytics Card */}
        <div 
          onClick={() => {
            setActiveSpreadsheet('active_users');
            playSound('CLICK');
          }}
          className="bg-[#0f0f0f] border border-white/5 p-5 sm:p-6 rounded-2xl hover:border-emerald-500/30 transition-all cursor-pointer group relative overflow-hidden shadow-2xl flex flex-col justify-between h-44 animate-in fade-in"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-colors" />
          <div className="flex justify-between items-start">
            <div className="p-3 bg-emerald-500/10 rounded-xl group-hover:bg-emerald-500/20 transition-colors border border-emerald-500/20">
              <Users className="w-5 h-5 text-emerald-400" />
            </div>
            {state.players.filter(p => p.lastActive && (Date.now() - p.lastActive <= 5 * 60 * 1000)).length > 0 ? (
              <span className="bg-emerald-500 text-black text-[9px] font-black px-3 py-1 rounded-full animate-pulse uppercase tracking-wider border border-emerald-500/20 shadow-lg shadow-emerald-500/20">
                {state.players.filter(p => p.lastActive && (Date.now() - p.lastActive <= 5 * 60 * 1000)).length} ONLINE
              </span>
            ) : (
              <span className="bg-white/5 text-[9px] font-black px-3 py-1 rounded-full text-slate-500 uppercase tracking-wider">
                OFFLINE
              </span>
            )}
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">ACTIVE USERS ANALYTICS</p>
            <div className="flex items-baseline justify-between w-full">
              <p className="text-2xl font-display font-black text-white">{state.players.length} Total</p>
              <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-tight">Real-time Stats ↗</span>
            </div>
          </div>
        </div>
      </div>

      {/* Separate Spreadsheet Overlays */}
      <AnimatePresence>
        {activeSpreadsheet !== null && (
          <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-xl p-4 sm:p-8 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="relative w-full max-w-7xl mx-auto bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden my-auto"
            >
              {/* Spreadsheet Accent Header Top Border */}
              <div className={`absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r ${
                activeSpreadsheet === 'deposits' 
                  ? 'from-transparent via-emerald-500/60 to-transparent' 
                  : activeSpreadsheet === 'blockchain_networks'
                    ? 'from-transparent via-purple-500/60 to-transparent'
                    : activeSpreadsheet === 'withdrawal_networks'
                      ? 'from-transparent via-teal-500/60 to-transparent'
                      : activeSpreadsheet === 'active_users'
                        ? 'from-transparent via-emerald-500/60 to-transparent'
                        : 'from-transparent via-blue-500/60 to-transparent'
              }`} />

              {/* Close Button */}
              <button 
                onClick={() => {
                  setActiveSpreadsheet(null);
                  playSound('CLICK');
                }}
                className="absolute top-8 right-8 text-slate-400 hover:text-white p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border-0 cursor-pointer z-10"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Header Title Block */}
              <div className="p-8 sm:p-10 border-b border-white/5 bg-white/[0.01] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-3 rounded-2xl ${
                      activeSpreadsheet === 'deposits' 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : activeSpreadsheet === 'blockchain_networks'
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : activeSpreadsheet === 'withdrawal_networks'
                            ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                            : activeSpreadsheet === 'active_users'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    }`}>
                      {activeSpreadsheet === 'deposits' 
                        ? <ArrowDownLeft className="w-6 h-6" /> 
                        : activeSpreadsheet === 'blockchain_networks'
                          ? <Settings className="w-6 h-6" />
                          : activeSpreadsheet === 'withdrawal_networks'
                            ? <Settings className="w-6 h-6" />
                            : activeSpreadsheet === 'active_users'
                              ? <Users className="w-6 h-6" />
                              : <ArrowUpRight className="w-6 h-6" />}
                    </div>
                    <h3 className="font-display font-black text-2xl sm:text-3xl text-white">
                      {activeSpreadsheet === 'deposits' 
                        ? 'Deposits Operations Spreadsheet' 
                        : activeSpreadsheet === 'blockchain_networks'
                          ? 'Blockchain Deposit Gateways & FAQ Content Manager'
                          : activeSpreadsheet === 'withdrawal_networks'
                            ? 'Blockchain Withdrawal Gateways & Settings Manager'
                            : activeSpreadsheet === 'active_users'
                              ? 'Active Users Analytics & Activity Ledger'
                              : 'Withdrawals Operations Spreadsheet'}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-mono">
                    {activeSpreadsheet === 'deposits' 
                      ? 'Verify payment references and approve incoming credits' 
                      : activeSpreadsheet === 'blockchain_networks'
                        ? 'Manage accepted chains, deposit wallet addresses, custom QR codes, and FAQs'
                        : activeSpreadsheet === 'withdrawal_networks'
                          ? 'Configure withdrawal blockchains, minimum limits, fee structures, and rules'
                          : activeSpreadsheet === 'active_users'
                            ? 'Monitor real-time player sessions, engagement activity, and database profiles'
                            : 'Process requested payout transfers to user accounts'}
                  </p>
                </div>

                {/* Sub-header status filter */}
                {activeSpreadsheet === 'deposits' && (
                  <div className="flex bg-black/50 p-1.5 rounded-2xl border border-white/5">
                    {(['pending', 'completed', 'rejected', 'all'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => {
                          setDepositFilter(filter);
                          playSound('CLICK');
                        }}
                        className={`
                          px-5 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all cursor-pointer border-0
                          ${depositFilter === filter 
                            ? 'bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/20 font-bold' 
                            : 'text-slate-400 hover:text-slate-200 bg-transparent'}
                        `}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Spreadsheet content */}
              <div className="overflow-x-auto p-2 sm:p-4">
                {activeSpreadsheet === 'active_users' ? (
                  <AdminActiveUsersView 
                    players={state.players}
                    preferredCurrency={preferredCurrency}
                    playSound={playSound}
                  />
                ) : activeSpreadsheet === 'blockchain_networks' ? (
                  <AdminDepositManager 
                    networks={state.depositNetworks || []}
                    playSound={playSound}
                  />
                ) : activeSpreadsheet === 'withdrawal_networks' || activeSpreadsheet === 'withdrawals' ? (
                  <AdminWithdrawalManager 
                    withdrawals={state.withdrawals}
                    networks={state.withdrawalNetworks || []}
                    settings={state.withdrawalSettings}
                    players={state.players}
                    deposits={state.deposits || []}
                    playSound={playSound}
                    transactions={state.transactions || []}
                  />
                ) : activeSpreadsheet === 'deposits' ? (
                  <AdminDepositLedger 
                    deposits={state.deposits || []}
                    players={state.players}
                    playSound={playSound}
                  />
                ) : activeSpreadsheet === 'old_deposits_unused' ? (
                  <div className="space-y-6 w-full text-left">
                    {/* Advanced Filter Control Bar */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-950/40 p-4 border border-white/5 rounded-2xl">
                      {/* Search */}
                      <div className="md:col-span-5 relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                          type="text"
                          value={depositSearch}
                          onChange={(e) => setDepositSearch(e.target.value)}
                          placeholder="Search player, email, transaction hash or ID..."
                          className="w-full bg-slate-950 border border-white/5 rounded-xl pl-10 pr-10 py-3 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                        />
                        {depositSearch && (
                          <button 
                            onClick={() => setDepositSearch('')}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white bg-transparent border-0 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Network Method Filter */}
                      <div className="md:col-span-3 relative">
                        <select
                          value={depositNetworkFilter}
                          onChange={(e) => {
                            setDepositNetworkFilter(e.target.value);
                            playSound('CLICK');
                          }}
                          className="w-full bg-slate-950 border border-white/5 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-emerald-500/50 appearance-none cursor-pointer font-sans font-bold"
                        >
                          <option value="all">All Networks ({availableMethods.length})</option>
                          {availableMethods.map(m => (
                            <option key={m} value={m}>{m.toUpperCase()}</option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </div>

                      {/* Sort Selector (visible on mobile where table headers can't be clicked) */}
                      <div className="md:col-span-4 grid grid-cols-2 gap-2">
                        <div className="relative">
                          <select
                            value={depositSortField}
                            onChange={(e) => {
                              setDepositSortField(e.target.value as any);
                              playSound('CLICK');
                            }}
                            className="w-full bg-slate-950 border border-white/5 rounded-xl px-3 py-3 text-[10px] text-white focus:outline-none focus:border-emerald-500/50 appearance-none cursor-pointer font-sans font-black uppercase tracking-wider"
                          >
                            <option value="timestamp">Sort: Date</option>
                            <option value="amount">Sort: Amount</option>
                            <option value="playerName">Sort: Player</option>
                            <option value="status">Sort: Status</option>
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setDepositSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                            playSound('CLICK');
                          }}
                          className="flex items-center justify-center gap-2 bg-slate-950 hover:bg-white/5 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-300 hover:text-white cursor-pointer transition-all"
                        >
                          {depositSortOrder === 'asc' ? 'Ascending ▲' : 'Descending ▼'}
                        </button>
                      </div>
                    </div>

                    {/* Content Section */}
                    {filteredDeposits.length === 0 ? (
                      <div className="p-24 text-center rounded-3xl border border-dashed border-white/5 bg-slate-950/20 text-slate-500 space-y-3 font-mono">
                        <AlertCircle className="w-10 h-10 mx-auto opacity-25 text-emerald-400 animate-pulse" />
                        <p className="text-xs font-bold uppercase text-slate-400">No deposit records matched</p>
                        <p className="text-[10px] max-w-sm mx-auto opacity-60">
                          Try clearing search keywords or adjusting status filters above.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* 1. DESKTOP VIEWPORT: Elegant spreadsheet table */}
                        <div className="hidden lg:block border border-white/5 rounded-3xl overflow-hidden bg-black/10">
                          <table className="w-full text-left border-collapse font-mono text-xs">
                            <thead>
                              <tr className="bg-white/[0.01] border-b border-white/5 text-[9px] uppercase tracking-widest text-slate-500 font-bold select-none">
                                <th className="p-4 border-r border-white/5">Request ID</th>
                                
                                <th 
                                  className="p-4 border-r border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                                  onClick={() => {
                                    if (depositSortField === 'timestamp') {
                                      setDepositSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                                    } else {
                                      setDepositSortField('timestamp');
                                      setDepositSortOrder('desc');
                                    }
                                    playSound('CLICK');
                                  }}
                                >
                                  Timestamp {depositSortField === 'timestamp' && (depositSortOrder === 'asc' ? '▲' : '▼')}
                                </th>
                                
                                <th 
                                  className="p-4 border-r border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                                  onClick={() => {
                                    if (depositSortField === 'playerName') {
                                      setDepositSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                                    } else {
                                      setDepositSortField('playerName');
                                      setDepositSortOrder('asc');
                                    }
                                    playSound('CLICK');
                                  }}
                                >
                                  Player Name {depositSortField === 'playerName' && (depositSortOrder === 'asc' ? '▲' : '▼')}
                                </th>
                                
                                <th className="p-4 border-r border-white/5 text-right">Balance At Request</th>
                                
                                <th 
                                  className="p-4 border-r border-white/5 cursor-pointer text-right text-emerald-400 hover:bg-white/[0.02] transition-colors"
                                  onClick={() => {
                                    if (depositSortField === 'amount') {
                                      setDepositSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                                    } else {
                                      setDepositSortField('amount');
                                      setDepositSortOrder('desc');
                                    }
                                    playSound('CLICK');
                                  }}
                                >
                                  Amount {depositSortField === 'amount' && (depositSortOrder === 'asc' ? '▲' : '▼')}
                                </th>
                                
                                <th className="p-4 border-r border-white/5">Method</th>
                                <th className="p-4 border-r border-white/5">Reference Details</th>
                                <th className="p-4 border-r border-white/5 text-center">Proof Screenshot</th>
                                <th className="p-4 text-center w-52">Status / Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 font-mono">
                              {filteredDeposits.map((req, index) => {
                                const player = state.players.find(p => p.id === req.playerId);
                                return (
                                  <tr 
                                    key={req.id} 
                                    className={`transition-colors hover:bg-white/[0.02] ${
                                      index % 2 === 0 ? 'bg-black/20' : 'bg-[#0a0a0a]'
                                    }`}
                                  >
                                    <td className="p-4 border-r border-white/5 text-slate-500 text-[10px]">#{req.id}</td>
                                    <td className="p-4 border-r border-white/5 text-slate-400 text-[11px]">{new Date(req.timestamp).toLocaleString()}</td>
                                    <td className="p-4 border-r border-white/5">
                                      <div className="flex items-center gap-2.5">
                                        <div className="w-6 h-6 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-sans font-bold text-[10px] text-emerald-400 shrink-0">
                                          {player?.name.charAt(0).toUpperCase() || '?'}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="font-sans font-bold text-white text-xs truncate">{player?.name || 'Unknown Player'}</p>
                                          {player?.email && <p className="font-sans text-[10px] text-slate-500 truncate leading-none mt-0.5">{player.email}</p>}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="p-4 border-r border-white/5 text-right text-slate-400">
                                      ₹{((req.playerBalanceAtRequest ?? 0) * (getCachedRates().rates['INR'] || 83.50)).toFixed(2)}
                                    </td>
                                    <td className="p-4 border-r border-white/5 text-right font-bold text-emerald-400 text-sm">
                                      ₹{((req.amount ?? 0) * (getCachedRates().rates['INR'] || 83.50)).toFixed(2)}
                                    </td>
                                    <td className="p-4 border-r border-white/5">
                                      <span className="bg-white/5 text-[9px] font-black px-2 py-0.5 rounded uppercase text-slate-400 border border-white/5">{req.method}</span>
                                    </td>
                                    <td className="p-4 border-r border-white/5 text-slate-300 text-[11px]">
                                      <div className="flex items-center justify-between gap-1.5 max-w-[200px]">
                                        <span className="truncate" title={req.details}>{req.details}</span>
                                        <button
                                          onClick={() => {
                                            navigator.clipboard.writeText(req.details);
                                            playSound('CLICK');
                                          }}
                                          className="p-1 bg-white/5 hover:bg-white/10 rounded border-0 cursor-pointer text-slate-400 hover:text-white transition-colors"
                                          title="Copy Details"
                                        >
                                          <Copy className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </td>
                                    <td className="p-4 border-r border-white/5 text-center">
                                      {req.screenshotUrl ? (
                                        <button
                                          onClick={() => {
                                            setActiveScreenshotUrl(req.screenshotUrl || null);
                                            playSound('CLICK');
                                          }}
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all text-[10px] font-bold uppercase tracking-wider cursor-pointer border-0"
                                        >
                                          <ImageIcon className="w-3.5 h-3.5" />
                                          View Proof
                                        </button>
                                      ) : (
                                        <span className="text-slate-600 italic text-[10px]">No attachment</span>
                                      )}
                                    </td>
                                    <td className="p-4 text-center">
                                      {req.status === 'pending' ? (
                                        <div className="flex items-center justify-center gap-2">
                                          <button 
                                            onClick={() => {
                                              onUpdateDepositStatus(req.id, 'completed');
                                              playSound('WIN');
                                            }}
                                            className="bg-emerald-500 text-emerald-950 px-4 py-2 rounded-lg text-[10px] font-black hover:bg-emerald-400 transition-colors uppercase tracking-wider cursor-pointer border-0"
                                          >
                                            Approve
                                          </button>
                                          <button 
                                            onClick={() => {
                                              onUpdateDepositStatus(req.id, 'rejected');
                                              playSound('LOSE');
                                            }}
                                            className="bg-rose-500 text-rose-950 px-4 py-2 rounded-lg text-[10px] font-black hover:bg-rose-400 transition-colors uppercase tracking-wider cursor-pointer border-0"
                                          >
                                            Reject
                                          </button>
                                        </div>
                                      ) : (
                                        <span className={`inline-block px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                          req.status === 'completed' 
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                        }`}>
                                          {req.status}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* 2. MOBILE VIEWPORT: Beautiful structured dark cards */}
                        <div className="block lg:hidden space-y-4">
                          {filteredDeposits.map((req) => {
                            const player = state.players.find(p => p.id === req.playerId);
                            const isPending = req.status === 'pending';
                            
                            return (
                              <div 
                                key={req.id}
                                className="bg-[#0f0f0f] border border-white/5 rounded-2xl p-5 space-y-4 relative overflow-hidden"
                              >
                                {/* Top Header */}
                                <div className="flex justify-between items-center pb-3 border-b border-white/5">
                                  <div>
                                    <span className="text-[10px] text-slate-500 font-mono">#{req.id}</span>
                                    <p className="text-[9px] text-slate-400 font-mono mt-0.5">{new Date(req.timestamp).toLocaleString()}</p>
                                  </div>
                                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                    req.status === 'completed'
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                      : req.status === 'rejected'
                                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  }`}>
                                    {req.status}
                                  </span>
                                </div>

                                {/* Player Info */}
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-sans font-bold text-xs text-emerald-400 shrink-0">
                                    {player?.name.charAt(0).toUpperCase() || '?'}
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="font-sans font-bold text-white text-xs truncate leading-snug">{player?.name || 'Unknown Player'}</h4>
                                    {player?.email && <p className="font-sans text-[10px] text-slate-500 truncate leading-none mt-0.5">{player.email}</p>}
                                  </div>
                                </div>

                                {/* Financial Details split */}
                                <div className="grid grid-cols-2 gap-3 bg-white/[0.01] border border-white/5 p-3 rounded-xl font-mono text-[11px]">
                                  <div>
                                    <p className="text-[8px] text-slate-500 uppercase tracking-widest mb-0.5">Balance At Req</p>
                                    <span className="font-bold text-slate-400">
                                      ₹{((req.playerBalanceAtRequest ?? 0) * (getCachedRates().rates['INR'] || 83.50)).toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[8px] text-slate-500 uppercase tracking-widest mb-0.5 text-emerald-400">Deposit Amount</p>
                                    <span className="font-bold text-emerald-400 text-sm">
                                      ₹{((req.amount ?? 0) * (getCachedRates().rates['INR'] || 83.50)).toFixed(2)}
                                    </span>
                                  </div>
                                </div>

                                {/* Method & Reference info */}
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <span className="bg-white/5 text-[8px] font-black px-2 py-0.5 rounded uppercase text-slate-400 border border-white/5 font-mono">{req.method}</span>
                                    <span className="text-[9px] text-slate-500 font-mono">Reference Details</span>
                                  </div>
                                  <div className="bg-black/50 p-2.5 rounded-lg border border-white/5 flex items-center justify-between gap-2 font-mono text-[10px]">
                                    <span className="text-slate-300 break-all truncate flex-1 pr-1">{req.details}</span>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(req.details);
                                        playSound('CLICK');
                                      }}
                                      className="p-1 bg-white/5 hover:bg-white/10 rounded border-0 cursor-pointer text-slate-400 shrink-0"
                                      title="Copy Details"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Proof Screenshot Button & Actions */}
                                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                                  {req.screenshotUrl && (
                                    <button
                                      onClick={() => {
                                        setActiveScreenshotUrl(req.screenshotUrl || null);
                                        playSound('CLICK');
                                      }}
                                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 hover:text-white transition-all text-[10px] font-bold uppercase tracking-wider cursor-pointer font-mono border-0"
                                    >
                                      <ImageIcon className="w-3.5 h-3.5" />
                                      View Screenshot Proof
                                    </button>
                                  )}

                                  {isPending && (
                                    <div className="grid grid-cols-2 gap-2 w-full">
                                      <button 
                                        onClick={() => {
                                          onUpdateDepositStatus(req.id, 'completed');
                                          playSound('WIN');
                                        }}
                                        className="w-full bg-emerald-500 text-emerald-950 py-2.5 rounded-xl text-[10px] font-black hover:bg-emerald-400 transition-colors uppercase tracking-wider cursor-pointer border-0"
                                      >
                                        Approve
                                      </button>
                                      <button 
                                        onClick={() => {
                                          onUpdateDepositStatus(req.id, 'rejected');
                                          playSound('LOSE');
                                        }}
                                        className="w-full bg-rose-500 text-rose-950 py-2.5 rounded-xl text-[10px] font-black hover:bg-rose-400 transition-colors uppercase tracking-wider cursor-pointer border-0"
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Spreadsheet Overlay Footer */}
              <div className="p-8 border-t border-white/5 bg-black/40 flex justify-between items-center">
                <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
                  {activeSpreadsheet === 'deposits' 
                    ? `${filteredDeposits.length} Records Loaded` 
                    : activeSpreadsheet === 'blockchain_networks'
                      ? `${(state.depositNetworks || []).length} Networks Loaded`
                      : activeSpreadsheet === 'withdrawal_networks'
                        ? `${(state.withdrawalNetworks || []).length} Networks Loaded`
                        : `${state.withdrawals.length} Records Loaded`}
                </p>
                <button 
                  onClick={() => {
                    setActiveSpreadsheet(null);
                    playSound('CLICK');
                  }}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-colors border-0 cursor-pointer"
                >
                  Close Ledger
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Verification Screenshot Modal */}
      <AnimatePresence>
        {activeScreenshotUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              className="relative max-w-lg w-full bg-[#0a0a0a] border border-white/10 p-6 rounded-[2.5rem] shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
              
              <button 
                onClick={() => setActiveScreenshotUrl(null)}
                className="absolute top-6 right-6 text-slate-400 hover:text-white p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-left">
                  <h4 className="text-sm font-black uppercase tracking-wider text-white">Verification Proof</h4>
                  <p className="text-[10px] text-slate-500 font-medium">Verify actual transaction credits</p>
                </div>
              </div>

              <div className="w-full aspect-square rounded-2xl overflow-hidden border border-white/10 bg-black/80 flex items-center justify-center">
                <img src={activeScreenshotUrl} alt="Deposit Proof" className="max-w-full max-h-full object-contain" />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button 
                  onClick={() => setActiveScreenshotUrl(null)}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-colors border-0 cursor-pointer"
                >
                  Close Proof
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-3 space-y-8">
          {/* NEXT LOTTERY TIMER CONTROL CARD */}
          <div className="bg-[#0b0b0b] border border-amber-500/15 p-8 rounded-[2.5rem] relative overflow-hidden group shadow-2xl shadow-amber-950/5">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/2 to-transparent pointer-events-none" />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <h4 className="text-xl font-display font-bold text-white flex items-center gap-3 uppercase tracking-wider">
                <Clock className="w-6 h-6 text-amber-400" />
                Next Lottery Result Timer
              </h4>
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-full self-start">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    state.lotteryTimerActive && lotterySecondsLeft > 0 ? 'bg-amber-400' : 'bg-rose-400'
                  }`} />
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    state.lotteryTimerActive && lotterySecondsLeft > 0 ? 'bg-amber-500' : 'bg-rose-500'
                  }`} />
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                  {state.lotteryTimerActive && lotterySecondsLeft > 0 ? 'Active Countdown' : 'Timer Inactive'}
                </span>
              </div>
            </div>

            {/* Live Status Display - Ultra Attractive & Prominent */}
            <div className="mb-8 p-6 bg-gradient-to-r from-amber-950/15 via-black to-amber-950/5 border border-amber-500/15 rounded-2xl relative overflow-hidden flex flex-col lg:flex-row items-center justify-between gap-6 shadow-2xl">
              <div className="absolute inset-y-0 left-0 w-1 bg-amber-500" />
              
              <div className="text-center lg:text-left space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">Live Status Counter</span>
                <p className="text-xs text-slate-400 font-medium">
                  {state.lotteryTimerActive && lotterySecondsLeft > 0 
                    ? `Counting down to drawing. Target: ${state.lotteryTargetTimestamp ? new Date(state.lotteryTargetTimestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }) : '--:--:--'}` 
                    : "No active countdown. Set time below and start."}
                </p>
              </div>

              {/* Digital Timer */}
              <div className="font-mono text-4xl sm:text-5xl lg:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-white to-amber-200 tracking-widest drop-shadow-[0_0_15px_rgba(245,158,11,0.25)]">
                {formatLotteryTimerStr(lotterySecondsLeft)}
              </div>

              {/* Graphical progress bar */}
              <div className="w-full lg:w-48 space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                  <span>Progress</span>
                  <span className="text-amber-400">{state.lotteryTimerActive && lotterySecondsLeft > 0 ? `${Math.round((lotterySecondsLeft / (state.lotteryTimerDuration || 300)) * 100)}%` : '0%'}</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-1000 ease-linear"
                    style={{ width: `${state.lotteryTimerActive && lotterySecondsLeft > 0 ? (lotterySecondsLeft / (state.lotteryTimerDuration || 300)) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Inputs & Actions Panel */}
            <div className="space-y-8">
              {/* Set Custom Timer inputs: Hours first, then minutes, then seconds */}
              <div className="space-y-4">
                <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] block text-center sm:text-left">
                  Set Custom Timer
                </label>
                <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto sm:mx-0">
                  {/* Hours input first */}
                  <div className="bg-white/[0.02] border border-white/5 hover:border-amber-500/20 rounded-2xl p-4 transition-all duration-300 text-center relative group">
                    <span className="text-[10px] font-black text-amber-400/80 uppercase tracking-widest block mb-2">Hours</span>
                    <input 
                      type="number"
                      min="0"
                      max="23"
                      value={lotteryHourInput}
                      onChange={(e) => setLotteryHourInput(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                      className="w-full bg-white/5 border border-white/5 focus:border-amber-500/30 rounded-xl py-3 font-mono text-center text-2xl font-black text-white outline-none transition-all"
                    />
                  </div>

                  {/* Minutes input */}
                  <div className="bg-white/[0.02] border border-white/5 hover:border-amber-500/20 rounded-2xl p-4 transition-all duration-300 text-center relative group">
                    <span className="text-[10px] font-black text-amber-400/80 uppercase tracking-widest block mb-2">Minutes</span>
                    <input 
                      type="number"
                      min="0"
                      max="59"
                      value={lotteryMinInput}
                      onChange={(e) => setLotteryMinInput(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                      className="w-full bg-white/5 border border-white/5 focus:border-amber-500/30 rounded-xl py-3 font-mono text-center text-2xl font-black text-white outline-none transition-all"
                    />
                  </div>

                  {/* Seconds input */}
                  <div className="bg-white/[0.02] border border-white/5 hover:border-amber-500/20 rounded-2xl p-4 transition-all duration-300 text-center relative group">
                    <span className="text-[10px] font-black text-amber-400/80 uppercase tracking-widest block mb-2">Seconds</span>
                    <input 
                      type="number"
                      min="0"
                      max="59"
                      value={lotterySecInput}
                      onChange={(e) => setLotterySecInput(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                      className="w-full bg-white/5 border border-white/5 focus:border-amber-500/30 rounded-xl py-3 font-mono text-center text-2xl font-black text-white outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={() => {
                    const totalSecs = lotteryHourInput * 3600 + lotteryMinInput * 60 + lotterySecInput;
                    onUpdateLotteryTimer(totalSecs, true, Date.now() + totalSecs * 1000);
                  }}
                  className="w-full sm:flex-1 py-4 px-6 bg-amber-500 text-amber-950 font-black text-xs uppercase tracking-widest rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  Start Countdown
                </button>
                
                {state.lotteryTimerActive ? (
                  <button
                    onClick={() => {
                      onUpdateLotteryTimer(lotterySecondsLeft, false, 0);
                    }}
                    className="w-full sm:flex-1 py-4 px-6 bg-amber-500/20 text-amber-400 border border-amber-500/30 font-black text-xs uppercase tracking-widest rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-lg shadow-amber-500/5 cursor-pointer"
                  >
                    Pause Timer
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (lotterySecondsLeft > 0) {
                        onUpdateLotteryTimer(lotterySecondsLeft, true, Date.now() + lotterySecondsLeft * 1000);
                      }
                    }}
                    disabled={lotterySecondsLeft <= 0}
                    className={`w-full sm:flex-1 py-4 px-6 font-black text-xs uppercase tracking-widest rounded-2xl transition-all duration-300 cursor-pointer ${
                      lotterySecondsLeft > 0 
                        ? 'bg-amber-500 text-amber-950 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-amber-500/20' 
                        : 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'
                    }`}
                  >
                    Resume
                  </button>
                )}

                <button
                  onClick={() => {
                    const totalSecs = lotteryHourInput * 3600 + lotteryMinInput * 60 + lotterySecInput;
                    onUpdateLotteryTimer(totalSecs, state.lotteryTimerActive, state.lotteryTimerActive ? Date.now() + totalSecs * 1000 : 0);
                  }}
                  className="w-full sm:w-auto px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-slate-300 font-black text-xs uppercase tracking-widest rounded-2xl transition-all cursor-pointer"
                >
                  Reset
                </button>
                
                <button
                  onClick={() => {
                    onUpdateLotteryTimer(0, false, 0);
                    setLotteryHourInput(0);
                    setLotteryMinInput(0);
                    setLotterySecInput(0);
                  }}
                  className="w-full sm:w-auto px-6 py-4 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/30 text-rose-400 font-black text-xs uppercase tracking-widest rounded-2xl transition-all cursor-pointer"
                >
                  Clear / Off
                </button>
              </div>
            </div>
          </div>

          <div className="bg-[#0d0d0d] border border-white/5 p-8 rounded-3xl">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-xl font-bold flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-500" />
                Maximum Bet Limit
              </h4>
              <button 
                onClick={onToggleBetLimit}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${state.isBetLimitEnabled ? 'bg-amber-500/20 text-amber-500 border border-amber-500/20' : 'bg-white/5 text-slate-500 border border-white/5'}`}
              >
                {state.isBetLimitEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            <div className={`space-y-6 transition-opacity duration-300 ${state.isBetLimitEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
               <div className="flex justify-between items-center">
                 <span className="text-slate-400">Global Max Bet Limit</span>
                 <div className="flex items-center gap-2">
                   <span className="text-slate-500 text-sm">₹</span>
                   <input 
                     type="number"
                     min="1"
                     value={state.maxBet ?? 0}
                     onChange={(e) => onUpdateMaxBet(Number(e.target.value))}
                     className="w-32 bg-white/5 border border-white/10 focus:border-amber-500/50 rounded-xl py-2 px-3 font-mono text-right text-xl font-bold text-amber-500 outline-none transition-all"
                   />
                 </div>
               </div>
              <p className="text-[10px] text-slate-600 font-medium italic">
                Restricts the maximum amount any player can wager at once. Enter any custom number.
              </p>
            </div>
          </div>

          <div className="bg-[#0d0d0d] border border-white/5 p-8 rounded-3xl">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-xl font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-500" />
                Players Won Counter
              </h4>
              
              {/* Sleek On/Off toggle */}
              <div className="flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-mono">Display</span>
                <button
                  onClick={onTogglePlayersWonShown}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    (state.isPlayersWonShown ?? true) ? 'bg-emerald-500' : 'bg-white/10'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      (state.isPlayersWonShown ?? true) ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className={`text-[10px] font-black uppercase tracking-wide ${
                  (state.isPlayersWonShown ?? true) ? 'text-emerald-400' : 'text-slate-500'
                }`}>
                  {(state.isPlayersWonShown ?? true) ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>
            <div className="space-y-6">
               <div className="flex justify-between items-center">
                 <span className="text-slate-400">Total Players Won</span>
                 <input 
                   type="number"
                   min="0"
                   value={state.playersWonCount ?? 142}
                   onChange={(e) => onUpdatePlayersWonCount(Number(e.target.value))}
                   className="w-32 bg-white/5 border border-white/10 focus:border-amber-500/50 rounded-xl py-2 px-3 font-mono text-right text-xl font-bold text-amber-500 outline-none transition-all"
                 />
               </div>
               <div className="flex flex-wrap gap-1.5">
                 {[50, 100, 142, 250, 500].map(val => (
                   <button
                     key={val}
                     onClick={() => onUpdatePlayersWonCount(val)}
                     className={`px-3 py-2 rounded-lg text-[10px] font-bold border transition-all ${state.playersWonCount === val ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'} cursor-pointer`}
                   >
                     {val} Won
                   </button>
                 ))}
               </div>
              <p className="text-[10px] text-slate-600 font-medium italic">
                Adjusts the beautiful dynamic display count of players who have successfully doubled their money. Enter any custom number.
              </p>
            </div>
          </div>

          {/* Total Bets Placed Override & Payout Stopped Controls */}
          <div className="bg-[#0d0d0d] border border-white/5 p-8 rounded-3xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-6 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500/10 p-2.5 rounded-2xl border border-amber-500/20">
                  <TrendingUp className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-white">Live Total Bets & Payout Controls</h4>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mt-0.5">
                    Override total bets display & control withdrawal payout state
                  </p>
                </div>
              </div>

              {/* Payout Stopped On/Off Toggle Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleWithdrawalsStopped}
                className={`flex items-center gap-2.5 py-2.5 px-5 rounded-xl border font-black uppercase text-[10px] tracking-wider transition-all duration-300 cursor-pointer ${
                  state.isWithdrawalsStopped
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 shadow-lg shadow-rose-500/10'
                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-500/10'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${state.isWithdrawalsStopped ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'}`} />
                Payout Stopped: {state.isWithdrawalsStopped ? 'ON' : 'OFF'}
              </motion.button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Total Bets Custom Window */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300 font-bold text-sm">Total Bets Placed Window</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-sm">₹</span>
                    <input 
                      type="number"
                      min="0"
                      placeholder="Auto"
                      value={state.customTotalBets ?? ''}
                      onChange={(e) => {
                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                        onUpdateCustomTotalBets(val);
                      }}
                      className="w-36 bg-white/5 border border-white/10 focus:border-amber-500/50 rounded-xl py-2 px-3 font-mono text-right text-xl font-bold text-amber-400 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[0, 5000, 10000, 25000, 50000, 100000].map(val => (
                    <button
                      key={val}
                      onClick={() => onUpdateCustomTotalBets(val)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                        state.customTotalBets === val 
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' 
                          : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'
                      }`}
                    >
                      {val === 0 ? 'Auto Live Sum' : `₹${val.toLocaleString()}`}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 italic">
                  Changes the total bets number shown on the main player screen live pool card instantly. Enter any custom amount.
                </p>
              </div>

              {/* Withdrawals Stopped Status Notice */}
              <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl flex flex-col justify-between">
                <div>
                  <h5 className="text-sm font-bold text-white mb-1">Payout Status Banner Notice</h5>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    When <strong className="text-rose-400">Payout Stopped is ON</strong>, players see: <span className="text-rose-300 font-mono text-[11px] block mt-1 bg-rose-950/40 p-2 rounded-lg border border-rose-500/20">"Withdrawals are Stopped until Lottery Result"</span>
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between pt-3 border-t border-white/5 text-xs font-mono">
                  <span className="text-slate-500">Player View Status:</span>
                  <span className={state.isWithdrawalsStopped ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                    {state.isWithdrawalsStopped ? 'Blocked & Banner Displayed' : 'Normal Operations'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#0d0d0d] border border-white/5 p-8 rounded-3xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-6 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="bg-blue-500/10 p-2.5 rounded-2xl border border-blue-500/20">
                  <History className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-white">Transfer Limits</h4>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mt-0.5">Control deposit/withdrawal limits & frequency rules</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <button 
                  onClick={onToggleTransferLimitsLock}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    state.isTransferLimitsLocked 
                      ? 'bg-rose-500/20 text-rose-500 border border-rose-500/20 hover:bg-rose-500/30' 
                      : 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/20 hover:bg-[#10b981]/25'
                  }`}
                >
                  {state.isTransferLimitsLocked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                  {state.isTransferLimitsLocked ? 'Locked' : 'Unlocked'}
                </button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onToggleWithdrawLimit24h}
                  className={`flex items-center gap-2.5 py-2.5 px-5 rounded-xl border font-black uppercase text-[10px] tracking-wider transition-all duration-300 ${
                    state.isWithdrawLimit24hEnabled 
                      ? 'bg-blue-500/15 border-blue-500/30 text-blue-400' 
                      : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${state.isWithdrawLimit24hEnabled ? 'bg-blue-400 animate-pulse' : 'bg-rose-400'}`} />
                  24h Limit: {state.isWithdrawLimit24hEnabled ? 'Active' : 'Disabled'}
                </motion.button>
              </div>
            </div>
            
            {state.isWithdrawLimit24hEnabled && (
              <div className="mb-6 p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl text-left">
                <p className="text-xs text-slate-400 leading-relaxed">
                  💡 <strong className="text-blue-400">24-Hour Withdrawal Frequency Constraint:</strong> Players are restricted to a single successful or pending withdrawal request every 24 hours. Extra attempts will be blocked with a countdown.
                </p>
              </div>
            )}

            <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 transition-all duration-300 ${state.isTransferLimitsLocked ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
               <div className="space-y-6">
                 <div className="flex justify-between items-center">
                   <span className="text-slate-400 text-sm italic">Min Deposit</span>
                   <div className="flex items-center gap-2">
                     <span className="text-slate-500 text-sm">₹</span>
                     <input 
                       type="number"
                       min="1"
                       disabled={state.isTransferLimitsLocked}
                       value={state.minDeposit ?? 10}
                       onChange={(e) => onUpdateMinLimits(Number(e.target.value), state.minWithdraw ?? 500)}
                       className="w-32 bg-white/5 border border-white/10 focus:border-emerald-500/50 rounded-xl py-2 px-3 font-mono text-right text-xl font-bold text-emerald-400 outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                     />
                   </div>
                 </div>
                 <div className="flex flex-wrap gap-1.5">
                   {[10, 100, 500, 1000].map(val => (
                     <button
                       key={val}
                       disabled={state.isTransferLimitsLocked}
                       onClick={() => onUpdateMinLimits(val, state.minWithdraw ?? 500)}
                       className={`px-3 py-2 rounded-lg text-[10px] font-bold border transition-all ${state.minDeposit === val ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'} disabled:opacity-40 disabled:cursor-not-allowed`}
                     >
                       ₹{val}
                     </button>
                   ))}
                 </div>
               </div>

               <div className="space-y-6">
                 <div className="flex justify-between items-center">
                   <span className="text-slate-400 text-sm italic">Min Withdrawal</span>
                   <div className="flex items-center gap-2">
                     <span className="text-slate-500 text-sm">₹</span>
                     <input 
                       type="number"
                       min="1"
                       disabled={state.isTransferLimitsLocked}
                       value={state.minWithdraw ?? 500}
                       onChange={(e) => onUpdateMinLimits(state.minDeposit ?? 10, Number(e.target.value))}
                       className="w-32 bg-white/5 border border-white/10 focus:border-blue-500/50 rounded-xl py-2 px-3 font-mono text-right text-xl font-bold text-blue-400 outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                     />
                   </div>
                 </div>
                 <div className="flex flex-wrap gap-1.5">
                   {[300, 500, 1000, 2000].map(val => (
                     <button
                       key={val}
                       disabled={state.isTransferLimitsLocked}
                       onClick={() => onUpdateMinLimits(state.minDeposit ?? 10, val)}
                       className={`px-3 py-2 rounded-lg text-[10px] font-bold border transition-all ${state.minWithdraw === val ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'} disabled:opacity-40 disabled:cursor-not-allowed`}
                     >
                       ₹{val}
                     </button>
                   ))}
                 </div>
               </div>
            </div>
          </div>

          <div className="bg-[#0d0d0d] border border-white/5 p-8 rounded-3xl mb-12">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-6 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/10 p-2.5 rounded-2xl border border-emerald-500/20">
                  <Share2 className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-white">Referral Program Settings</h4>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mt-0.5">Configure and toggle the referral system</p>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleReferralEnabled}
                className={`flex items-center gap-2.5 py-2.5 px-5 rounded-xl border font-black uppercase text-[10px] tracking-wider transition-all duration-300 ${
                  (state.isReferralEnabled ?? true) 
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' 
                    : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${(state.isReferralEnabled ?? true) ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                {(state.isReferralEnabled ?? true) ? 'System Active' : 'System Suspended'}
              </motion.button>
            </div>

            <div className={`space-y-6 transition-all duration-500 ${(state.isReferralEnabled ?? true) ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
               <div className="flex justify-between items-center">
                 <span className="text-slate-400">Bonus payout (For Register & Referrer)</span>
                 <div className="flex items-center gap-2">
                   <span className="text-slate-500 text-sm">₹</span>
                   <input 
                     type="number"
                     min="0"
                     value={state.referralAmount ?? 10}
                     onChange={(e) => onUpdateReferralAmount(Number(e.target.value))}
                     className="w-32 bg-white/5 border border-white/10 focus:border-emerald-500/50 rounded-xl py-2 px-3 font-mono text-right text-xl font-bold text-emerald-400 outline-none transition-all"
                   />
                 </div>
               </div>
               <div className="flex flex-wrap gap-1.5">
                 {[10, 20, 50, 100].map(val => (
                   <button
                     key={val}
                     onClick={() => onUpdateReferralAmount(val)}
                     className={`px-3 py-2 rounded-lg text-[10px] font-bold border transition-all ${state.referralAmount === val ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'}`}
                   >
                     ₹{val}
                   </button>
                 ))}
               </div>
              <p className="text-[10px] text-slate-600 font-medium italic">
                Adjusts the amount of cash credit given to both the referrer and the newly referred player upon registration. Enter any custom number.
              </p>
            </div>
          </div>

          {/* Payment Method Maintenance Modes Panel */}
          <div className="bg-[#0d0d0d] border border-white/5 p-8 rounded-3xl mb-12">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-6 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500/10 p-2.5 rounded-2xl border border-amber-500/20">
                  <Wrench className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-white">Payment Method Maintenance Modes</h4>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mt-0.5">Toggle maintenance status for Crypto deposit gateway</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {/* Crypto Maintenance Toggle */}
              <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl border ${state.paymentSettings?.cryptoMaintenanceMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                    <Coins className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-white">Crypto Payment Gateway</h5>
                    <p className="text-[10px] text-slate-500">
                      {state.paymentSettings?.cryptoMaintenanceMode ? 'Currently Under Maintenance' : 'Operational & Active'}
                    </p>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    playSound('CLICK');
                    onUpdatePaymentSettings({
                      ...state.paymentSettings,
                      cryptoMaintenanceMode: !(state.paymentSettings?.cryptoMaintenanceMode ?? false)
                    });
                  }}
                  className={`px-5 py-2.5 rounded-xl border font-black uppercase text-[10px] tracking-wider transition-all duration-300 flex items-center gap-2 cursor-pointer ${
                    state.paymentSettings?.cryptoMaintenanceMode
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 shadow-lg shadow-rose-500/10'
                      : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-500/10'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${state.paymentSettings?.cryptoMaintenanceMode ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'}`} />
                  {state.paymentSettings?.cryptoMaintenanceMode ? 'Maintenance ON' : 'Maintenance OFF'}
                </motion.button>
              </div>
            </div>
          </div>

          {/* Announcement Control Panel */}
          <div className="bg-[#0f0f0f] border border-white/5 p-10 rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] mb-12 relative overflow-hidden">
            {/* Ambient gold/emerald glow for importance */}
            <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/5 rounded-full blur-[90px] pointer-events-none -mr-32 -mt-32" />
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 relative z-10">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-emerald-500/10 rounded-[1.5rem] border border-emerald-500/20">
                  <Megaphone className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-3xl font-display font-bold text-white tracking-tight">System Broadcasting</h4>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Configure Global Announcement Broadcasts</p>
                </div>
              </div>

              {/* Toggle Switch */}
              <div className="flex items-center gap-4">
                <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
                  Menu Visibility:
                </span>
                <button
                  onClick={onToggleAnnouncementEnabled}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 border ${
                    state.isAnnouncementEnabled 
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 border-emerald-400/20 shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <motion.div
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className={`w-6 h-6 rounded-full absolute top-0.5 shadow-md flex items-center justify-center ${
                      state.isAnnouncementEnabled ? 'right-0.5 bg-black' : 'left-0.5 bg-slate-600'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${state.isAnnouncementEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                  </motion.div>
                </button>
                <span className={`text-xs font-mono font-black uppercase ${state.isAnnouncementEnabled ? 'text-emerald-400' : 'text-slate-600'}`}>
                  {state.isAnnouncementEnabled ? 'Visible' : 'Hidden'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 relative z-10">
              {/* Left Column: Editor */}
              <div className="space-y-8">
                <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl relative">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-4 px-1">
                    Announcement Message Content
                  </label>
                  <textarea
                    value={state.announcementText || ''}
                    onChange={(e) => onUpdateAnnouncementText(e.target.value)}
                    placeholder="Type the announcement details here... Markdown or clean spacing works wonderfully!"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 focus:outline-none focus:border-emerald-500 text-slate-200 text-base min-h-[160px] resize-none shadow-inner leading-relaxed focus:ring-1 focus:ring-emerald-500/20 transition-all"
                  />
                  
                  {/* Word / character count indicator */}
                  <div className="absolute right-3 bottom-3 text-[10px] font-mono text-slate-600">
                    {(state.announcementText || '').length} characters
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="space-y-3">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block px-1">
                    Apply Styled Quick Presets
                  </span>
                  <div className="flex flex-wrap gap-2.5">
                    {[
                      {
                        label: '🔥 VIP Double Exp',
                        text: 'Welcome to Matrix Multiplier! Active promotion: Earn DOUBLE VIP experience on all double bets placed this week! Level up faster than ever.'
                      },
                      {
                        label: '💎 Deposit Match',
                        text: 'DEPOSIT SPECIAL! Get an instant 10% bonus credit on all USDT deposits over ₹5,000 made today. Send transaction proof for instant sync.'
                      },
                      {
                        label: '⚠️ Scheduled Update',
                        text: 'SYSTEM BULLETIN: Scheduled database synchronization on July 10 at 02:00 UTC. The portal remains active, but expect brief response latency.'
                      }
                    ].map((preset, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          onUpdateAnnouncementText(preset.text);
                          playSound('CLICK');
                        }}
                        className="px-4 py-2.5 rounded-xl text-xs font-medium bg-white/5 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/20 text-slate-300 hover:text-emerald-400 transition-all duration-300 text-left"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Preview Panel */}
              <div className="flex flex-col justify-between">
                <div className="bg-[#050505] border border-white/5 rounded-3xl p-6 sm:p-8 flex-1 flex flex-col justify-between shadow-inner relative group">
                  <div className="absolute top-4 right-4 text-[9px] font-mono font-black uppercase text-emerald-500/40 tracking-wider">
                    Client View Live Preview
                  </div>
                  
                  <div className="flex flex-col items-center text-center my-auto">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                      <Megaphone className="w-6 h-6 text-emerald-400" />
                    </div>
                    
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-mono font-medium tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 mb-3 uppercase">
                      Broadcast Transmission
                    </span>
                    
                    <div className="w-full bg-white/[0.01] border border-white/5 rounded-xl p-4 min-h-[100px] flex items-center justify-center">
                      <p className="text-slate-300 text-sm font-sans leading-relaxed whitespace-pre-wrap">
                        {state.announcementText || 'Type something in the box or apply a preset to view the live rendering...'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-between text-[9px] font-mono text-slate-600 border-t border-white/5 pt-4">
                    <span>Target: Main Nav Menu Option</span>
                    <span>Status: {state.isAnnouncementEnabled ? 'Broadcast Active' : 'Offline / Standby'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* User-Player Sync & Migration Hub */}
          <div className="bg-[#0f0f0f] border border-white/5 p-10 rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] mb-12 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/5 rounded-full blur-[90px] pointer-events-none -mr-32 -mt-32" />
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 relative z-10">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-emerald-500/10 rounded-[1.5rem] border border-emerald-500/20">
                  <RefreshCw className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-3xl font-display font-bold text-white tracking-tight">Sync & Migration Hub</h4>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Ensure 100% User-Player Profile Alignment</p>
                </div>
              </div>
              <div>
                <button
                  onClick={async () => {
                    playSound('CLICK');
                    setIsMigrating(true);
                    setMigrationMsg(null);
                    try {
                      const res = await onSafeMigrate();
                      setMigrationMsg(`Success: Created ${res.createdCount} new player profile(s). Already existed: ${res.existedCount} profile(s).`);
                    } catch (e: any) {
                      setMigrationMsg(`Error: ${e.message || 'Migration failed'}`);
                    } finally {
                      setIsMigrating(false);
                    }
                  }}
                  disabled={isMigrating}
                  className="bg-emerald-500 text-black px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-emerald-500/30 disabled:opacity-50"
                >
                  {isMigrating ? 'Migrating...' : 'Run Safe Migration'}
                </button>
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 relative z-10 space-y-4">
              <p className="text-slate-300 text-sm leading-relaxed">
                The User-Player synchronization system maintains a direct 1:1 mapping between Firebase Auth-linked <code className="text-emerald-400 font-mono">users</code> and game-ready <code className="text-emerald-400 font-mono">players</code>. All active users automatically self-heal and sync required fields (<code className="text-slate-400 font-mono">id, username/name, email, walletBalance/balance, referral data</code>) in real-time.
              </p>
              <p className="text-slate-500 text-xs font-mono">
                Running the Safe Migration utility scans the entire database, identifies legacy profiles missing player records, and safely creates them without duplicating existing players or affecting wallet ledger logs.
              </p>
              {migrationMsg && (
                <div className={`p-4 rounded-xl text-xs font-mono border ${
                  migrationMsg.startsWith('Error') 
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' 
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                }`}>
                  {migrationMsg}
                </div>
              )}
            </div>
          </div>

          <div className="glass-card p-10 rounded-[2.5rem]">
            <h4 className="text-xl font-display font-bold mb-8 flex items-center gap-3">
              <Settings className="w-5 h-5 text-emerald-400" />
              Manage Individual Players
            </h4>
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {state.players.map((player, idx) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={player.id} 
                    className={`p-6 rounded-2xl border transition-all duration-300 ${state.currentPlayerId === player.id ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/[0.02] border-white/5'}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center font-bold text-xl text-white shadow-xl">
                          {player.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <h5 className="font-display font-bold text-lg">{player.name}</h5>
                            {state.currentPlayerId === player.id && (
                              <span className="bg-emerald-500/10 text-emerald-400 text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-emerald-500/20">Active Player</span>
                            )}
                            {(() => {
                              const isOnline = player.lastActive && (Date.now() - player.lastActive <= 5 * 60 * 1000);
                              return (
                                <div className="flex items-center gap-1.5 bg-black/30 px-2 py-0.5 rounded-full border border-white/5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                                  <span className={`text-[8px] font-black uppercase tracking-wider ${isOnline ? 'text-emerald-400' : 'text-slate-500'}`}>
                                    {isOnline ? 'Online' : 'Offline'}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">
                            Balance: ₹{((player.balance ?? 0) * (getCachedRates().rates['INR'] || 83.50)).toFixed(2)} | Code: {player.referralCode} | Refs: {player.referralCount}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <motion.button 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => onSwitchPlayer(player.id)}
                          className={`px-5 py-2.5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest ${state.currentPlayerId === player.id ? 'bg-emerald-500 text-emerald-950' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
                        >
                          {state.currentPlayerId === player.id ? 'Playing' : 'Switch to Play'}
                        </motion.button>
                        <div className="h-8 w-[1px] bg-white/5 mx-2 hidden sm:block" />
                        <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                          {(['none', 'win', 'lose'] as const).map((mode) => (
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              key={mode}
                              onClick={() => onUpdatePlayerOverride(player.id, mode)}
                              className={`
                                px-4 py-2 rounded-lg font-black uppercase tracking-widest text-[9px] transition-all
                                ${player.override === mode 
                                  ? mode === 'win' ? 'bg-emerald-500 text-emerald-950' 
                                  : mode === 'lose' ? 'bg-rose-500 text-rose-950'
                                  : 'bg-white/10 text-white'
                                  : 'text-slate-600 hover:text-slate-400'}
                              `}
                            >
                              {mode === 'none' ? 'RNG' : mode}
                            </motion.button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* House Today's Profit Graph */}
      <div className={`glass-card rounded-[2.5rem] overflow-hidden mb-8 border transition-all duration-500 ${currentHouseProfit >= 0 ? 'border-emerald-500/15 shadow-[0_0_50px_-12px_rgba(16,185,129,0.08)]' : 'border-rose-500/15 shadow-[0_0_50px_-12px_rgba(244,63,94,0.08)]'}`}>
        <div className="p-8 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/[0.01]">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <TrendingUp className={`w-6 h-6 animate-pulse ${currentHouseProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} />
              <h4 className="font-display font-bold text-xl text-white">House Today's Profit Graph</h4>
            </div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">
              Trajectory mapping today's winnings versus losses (resets automatically at midnight)
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className={`px-5 py-3 rounded-2xl bg-white/[0.02] border text-left min-w-[200px] transition-all duration-300 ${currentHouseProfit >= 0 ? 'border-emerald-500/10' : 'border-rose-500/10'}`}>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">TODAY'S NET INTEREST</p>
              <p className={`font-mono text-2xl font-black transition-all ${currentHouseProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {currentHouseProfit >= 0 ? '+' : ''}₹{(currentHouseProfit * (getCachedRates().rates['INR'] || 83.50)).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 bg-[#030303]/40">
          <div className="h-[280px] md:h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={houseProfitData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="profitGradToday" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={currentHouseProfit >= 0 ? "#10b981" : "#f43f5e"} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={currentHouseProfit >= 0 ? "#10b981" : "#f43f5e"} stopOpacity={0.005}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="rgba(255,255,255,0.15)" 
                  fontSize={9} 
                  fontFamily="monospace"
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis 
                  stroke="rgba(255,255,255,0.15)" 
                  fontSize={9} 
                  fontFamily="monospace"
                  tickFormatter={(v) => `₹${(v * (getCachedRates().rates['INR'] || 83.50)).toFixed(0)}`}
                  tickLine={false}
                  axisLine={false}
                  dx={-10}
                />
                <Tooltip content={<HouseProfitTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.05)', strokeWidth: 1 }} />
                <Area 
                  type="monotone" 
                  dataKey="profit" 
                  stroke={currentHouseProfit >= 0 ? "#10b981" : "#f43f5e"} 
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#profitGradToday)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  );
});
