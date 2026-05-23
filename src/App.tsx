import { useState, useEffect, useMemo, ReactNode, useRef, ChangeEvent, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
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
  Heart
} from 'lucide-react';
import { AppState, Transaction, WithdrawalRequest, DepositRequest, Player, PaymentSettings } from './types.ts';
import { auth, db, loginWithGoogle, logout, OperationType, handleFirestoreError } from './lib/firebase.ts';
import { VercelDiagnosticModal } from './components/VercelDiagnosticModal.tsx';
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
  limit
} from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

// High-fidelity modern sound effects
const SOUNDS = {
  WIN: 'https://cdn.freesound.org/previews/341/341695_5858296-lq.mp3', // Epic level up/win
  LOSE: 'https://cdn.freesound.org/previews/415/415209_5121236-lq.mp3',
  SPIN: 'https://cdn.freesound.org/previews/146/146718_2437358-lq.mp3',
  BET: 'https://cdn.freesound.org/previews/442/442127_7431267-lq.mp3',
  CLICK: 'https://cdn.freesound.org/previews/264/264761_4546410-lq.mp3',
  TICK: 'https://cdn.freesound.org/previews/264/264761_4546410-lq.mp3',
};

// Mock Initial Data
const INITIAL_STATE: AppState = {
  players: [],
  currentPlayerId: undefined,
  transactions: [],
  withdrawals: [],
  deposits: [],
  winRate: 0.45, // 45% win rate by default
  totalEarned: 0,
  manualMode: false,
  maxBet: 500,
  isBetLimitEnabled: true,
  maintenanceMode: false,
  minDeposit: 100,
  minWithdraw: 500,
  paymentSettings: {
    upiId: 'ALEEMKA14@OKHDFC',
    additionalInstructions: 'Send screenshot after payment for fast approval.'
  },
  isPaymentLocked: false,
  referralAmount: 10,
  isReferralEnabled: true,
  isWithdrawLimit24hEnabled: false,
  isWinRateLocked: false,
  isTransferLimitsLocked: false
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [showVercelDiag, setShowVercelDiag] = useState(false);
  const [vercelDiagError, setVercelDiagError] = useState<{ code?: string; message?: string } | null>(null);

  useEffect(() => {
    const start = Date.now();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      const elapsed = Date.now() - start;
      const delay = Math.max(0, 1500 - elapsed);
      
      setTimeout(() => {
        setUser(firebaseUser);
        if (firebaseUser) {
          setState(prev => ({ ...prev, currentPlayerId: firebaseUser.uid }));
          // Try to load cached balance for immediate display
          const cached = localStorage.getItem(`balance_${firebaseUser.uid}`);
          if (cached) {
            const balance = parseFloat(cached);
            setState(prev => {
              const exists = prev.players.find(p => p.id === firebaseUser.uid);
              if (exists) {
                return {
                  ...prev,
                  players: prev.players.map(p => p.id === firebaseUser.uid ? { ...p, balance } : p)
                };
              } else {
                return {
                  ...prev,
                  players: [...prev.players, {
                    id: firebaseUser.uid,
                    name: firebaseUser.displayName || 'Player',
                    email: firebaseUser.email || '',
                    balance,
                    override: 'none',
                    referralCode: '',
                    referralCount: 0
                  }]
                };
              }
            });
          }
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

  // Listeners for Firestore data
  useEffect(() => {
    if (!user) return;
    
    console.log('Starting Listeners. User:', user.email, user.uid);
    console.log('CurrentUser:', auth.currentUser?.email, auth.currentUser?.uid);

    // Config Listener
    const unsubConfig = onSnapshot(doc(db, 'config', 'admin'), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setState(prev => ({
          ...prev,
          winRate: data.winRate ?? 0.45,
          manualMode: data.manualMode ?? false,
          maxBet: data.maxBet ?? 500,
          isBetLimitEnabled: data.isBetLimitEnabled ?? true,
          maintenanceMode: data.maintenanceMode ?? false,
          minDeposit: data.minDeposit ?? 100,
          minWithdraw: data.minWithdraw ?? 500,
          paymentSettings: data.paymentSettings,
          isPaymentLocked: data.isPaymentLocked ?? false,
          referralAmount: data.referralAmount ?? 10,
          isReferralEnabled: data.isReferralEnabled ?? true,
          isWithdrawLimit24hEnabled: data.isWithdrawLimit24hEnabled ?? false,
          isWinRateLocked: data.isWinRateLocked ?? false,
          isTransferLimitsLocked: data.isTransferLimitsLocked ?? false
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
            isTransferLimitsLocked: false
          }, { merge: true });
        } catch (e) {
          console.warn('Failed to initialize admin config:', e);
        }
      }
    }, (err) => {
      console.warn('Config access denied or missing. Using defaults.', err);
    });

    // Players Listener - Everyone gets at least the top players for the leaderboard
    const unsubPlayers = onSnapshot(query(collection(db, 'players'), orderBy('balance', 'desc'), limit(50)), (snap) => {
      const players = snap.docs.map(d => d.data() as Player);
      setState(prev => {
        // Merge with existing players to keep the current user's full data if they aren't in the top 50
        const idMap = new Map(prev.players.map(p => [p.id, p]));
        players.forEach(p => idMap.set(p.id, p));
        return { ...prev, players: Array.from(idMap.values()) };
      });
    }, (err) => {
      console.warn('Leaderboard players access denied.', err);
    });

    // Single Player profile listener for updates to own balance/override
    const unsubPlayer = onSnapshot(doc(db, 'players', user.uid), (snap) => {
      if (snap.exists()) {
        const p = snap.data() as Player;
        // If not admin, we still need this player in the list for balance check
        setState(prev => {
          const otherPlayers = prev.players.filter(pl => pl.id !== p.id);
          return { ...prev, players: [...otherPlayers, p] };
        });
      }
    }, (err) => {
      console.warn(`Failed to listen to profile players/${user.uid}:`, err);
    });

    // Query helper to switch between own and admin data
    const getQuery = (colName: string) => {
      const l = colName === 'transactions' ? 500 : 50; // Cap transactions at 500 for performance
      return isAdmin 
        ? query(collection(db, colName), orderBy('timestamp', 'desc'), limit(l))
        : query(collection(db, colName), where('playerId', '==', user.uid), orderBy('timestamp', 'desc'), limit(l));
    };

    const unsubTxns = onSnapshot(getQuery('transactions'), (snap) => {
      const transactions = snap.docs.map(d => d.data() as Transaction);
      setState(prev => ({ ...prev, transactions }));
    }, (err) => {
      if (err.message.includes('permission-denied') || (err as any).code === 'permission-denied') {
        console.warn(`Admin access to transactions denied for ${user.email} (${user.uid}). Falling back to personal view.`);
        const fallbackQuery = query(collection(db, 'transactions'), where('playerId', '==', user.uid), orderBy('timestamp', 'desc'));
        const unsubFallback = onSnapshot(fallbackQuery, (s) => {
           setState(prev => ({ ...prev, transactions: s.docs.map(d => d.data() as Transaction) }));
        }, (fErr) => {
           console.warn('Transactions Fallback Error:', fErr);
        });
        return unsubFallback;
      } else {
        console.warn('Failed to listen to transactions:', err);
      }
    });

    const unsubWithdrawals = onSnapshot(getQuery('withdrawals'), (snap) => {
      const withdrawals = snap.docs.map(d => d.data() as WithdrawalRequest);
      setState(prev => ({ ...prev, withdrawals }));
    }, (err) => {
      if (err.message.includes('permission-denied') || (err as any).code === 'permission-denied') {
        console.warn(`Admin access to withdrawals denied. Falling back.`);
        const fallbackQuery = query(collection(db, 'withdrawals'), where('playerId', '==', user.uid), orderBy('timestamp', 'desc'));
        onSnapshot(fallbackQuery, (s) => {
          setState(prev => ({ ...prev, withdrawals: s.docs.map(d => d.data() as WithdrawalRequest) }));
        }, (fErr) => {
          console.warn('Withdrawals Fallback Error:', fErr);
        });
      } else {
        console.warn('Failed to listen to withdrawals:', err);
      }
    });

    const unsubDeposits = onSnapshot(getQuery('deposits'), (snap) => {
      const deposits = snap.docs.map(d => d.data() as DepositRequest);
      setState(prev => ({ ...prev, deposits }));
    }, (err) => {
      if (err.message.includes('permission-denied') || (err as any).code === 'permission-denied') {
        console.warn(`Admin access to deposits denied. Falling back.`);
        const fallbackQuery = query(collection(db, 'deposits'), where('playerId', '==', user.uid), orderBy('timestamp', 'desc'));
        onSnapshot(fallbackQuery, (s) => {
          setState(prev => ({ ...prev, deposits: s.docs.map(d => d.data() as DepositRequest) }));
        }, (fErr) => {
          console.warn('Deposits Fallback Error:', fErr);
        });
      } else {
        console.warn('Failed to listen to deposits:', err);
      }
    });

    return () => {
      unsubConfig();
      unsubPlayers();
      unsubPlayer();
      unsubTxns();
      unsubWithdrawals();
      unsubDeposits();
    };
  }, [user, isAdmin]);

  const lastStateRef = useRef(state);
  useEffect(() => {
    lastStateRef.current = state;
  }, [state]);

  const [activeTab, setActiveTab] = useState<'play' | 'wallet' | 'admin' | 'leaderboard'>('play');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerReferral, setRegisterReferral] = useState('');

  const currentPlayer = useMemo(() => {
    const p = state.players.find(p => p.id === user?.uid) || state.players.find(p => p.id === state.currentPlayerId);
    if (!p) {
      return {
        id: user?.uid || state.currentPlayerId || 'temp',
        name: user?.displayName || 'New Player',
        email: user?.email || '',
        balance: 0,
        override: 'none',
        referralCode: '',
        referralCount: 0
      } as Player;
    }
    return p;
  }, [state.players, state.currentPlayerId, user]);

  // Sound Controller
  const playSound = (soundKey: keyof typeof SOUNDS) => {
    if (isMuted) return;
    const audio = new Audio(SOUNDS[soundKey]);
    audio.volume = soundKey === 'WIN' ? 1.0 : 0.6; // Higher volume for wins
    audio.play().catch((err) => {
      console.warn('Audio playback inhibited:', err);
    });
  };

  const triggerConfetti = () => {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval = window.setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
  };

  useEffect(() => {
    if (user && currentPlayer) {
      const isRealPlayer = state.players.some(p => p.id === user.uid);
      if (isRealPlayer) {
        localStorage.setItem(`balance_${user.uid}`, currentPlayer.balance.toString());
      }
    }
  }, [user, currentPlayer?.balance, state.players]);

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

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'transactions', id), newTxn);
      
      const playerRef = doc(db, 'players', user.uid);
      const balanceChange = (txn.type === 'win' || txn.type === 'deposit') ? txn.amount : -txn.amount;
      batch.update(playerRef, { balance: increment(balanceChange) });
      
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'transactions');
    }
  };

  const handleDeposit = async (amount: number, method: string, details: string, screenshotUrl?: string) => {
    if (!user || amount < 10) return;
    playSound('BET'); 
    
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

  const handleWithdraw = async (amount: number, method: string, details: string) => {
    if (!user || !currentPlayer || amount < 10 || amount > currentPlayer.balance) return;

    if (state.isWithdrawLimit24hEnabled) {
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recentWithdrawal = state.withdrawals.find(w => 
        w.playerId === user.uid && 
        w.timestamp >= twentyFourHoursAgo &&
        (w.status === 'pending' || w.status === 'completed')
      );
      if (recentWithdrawal) {
        return; // Silent block or fail-safe guard
      }
    }

    const id = Math.random().toString(36).substr(2, 9);
    const txnId = Math.random().toString(36).substr(2, 9);
    const timestamp = Date.now();

    const newRequest: WithdrawalRequest = {
      id,
      playerId: user.uid,
      amount,
      method,
      details,
      status: 'pending',
      timestamp,
      playerBalanceAtRequest: currentPlayer.balance
    };

    const txn: Transaction = {
      id: txnId,
      playerId: user.uid,
      type: 'withdrawal',
      amount,
      timestamp,
      status: 'pending'
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'withdrawals', id), newRequest);
      batch.set(doc(db, 'transactions', txnId), txn);
      batch.update(doc(db, 'players', user.uid), { balance: increment(-amount) });
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'withdrawals');
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

      const batch = writeBatch(db);
      batch.update(depositRef, { status });

      if (status === 'completed') {
        const playerRef = doc(db, 'players', deposit.playerId);
        batch.update(playerRef, { balance: increment(deposit.amount) });
        playSound('WIN');
      }

      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'deposits');
    }
  };

  const resultBet = async (playerId: string, outcome: 'win' | 'lose') => {
    try {
      const playerRef = doc(db, 'players', playerId);
      const playerSnap = await getDoc(playerRef);
      if (!playerSnap.exists()) return;
      const player = playerSnap.data() as Player;
      if (!player.pendingBet) return;

      const amount = player.pendingBet.amount;
      const isWin = outcome === 'win';
      const winAmount = amount * 2;
      
      const batch = writeBatch(db);

      if (isWin) {
        const winTxnId = Math.random().toString(36).substr(2, 9);
        const winTxn: Transaction = {
          id: winTxnId,
          playerId: playerId,
          type: 'win',
          amount: winAmount,
          timestamp: Date.now(),
          status: 'completed'
        };
        batch.set(doc(db, 'transactions', winTxnId), winTxn);
        batch.update(playerRef, { 
          balance: increment(winAmount),
          pendingBet: null 
        });
        playSound('WIN');
        triggerConfetti();
      } else {
        batch.update(playerRef, { 
          pendingBet: null 
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

  const onResetPlayerGraph = async () => {
    if (!currentPlayer) return;
    if (!confirm('Reset your performance telemetry? This will wipe your session history.')) return;
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
          upiId: 'ALEEMKA14@OKHDFC',
          additionalInstructions: 'Send screenshot after payment for fast approval.'
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
    try {
      const adminRef = doc(db, 'config', 'admin');
      await setDoc(adminRef, { maintenanceMode: !state.maintenanceMode }, { merge: true });
      playSound('CLICK');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'config/admin');
    }
  };

  const onUpdatePlayerOverride = async (id: string, override: 'win' | 'lose' | 'none') => {
    try {
      await updateDoc(doc(db, 'players', id), { override });
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
      const q = query(collection(db, 'players'), where('referralCode', '==', referralCode.toUpperCase()));
      // This is simplified, in real code you'd fetch it.
      // I'll assume for now I can find it in the state if it's already synced.
      const referrer = state.players.find(p => p.referralCode === referralCode.toUpperCase());
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
      referralCount: 0
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'players', user.uid), newPlayer);
      
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
        
        const refBonusTxnId = Math.random().toString(36).substr(2, 9);
        batch.set(doc(db, 'transactions', refBonusTxnId), {
          id: refBonusTxnId,
          playerId: referrerId,
          type: 'deposit',
          amount: state.referralAmount ?? 10,
          timestamp: Date.now(),
          status: 'completed'
        });

        const referrerRef = doc(db, 'players', referrerId);
        const referrerSnap = await getDoc(referrerRef);
        if (referrerSnap.exists()) {
          const currentBalance = referrerSnap.data().balance || 0;
          const currentReferralCount = referrerSnap.data().referralCount || 0;
          batch.update(referrerRef, { 
            balance: (Number.isNaN(currentBalance) ? 0 : currentBalance) + (state.referralAmount ?? 10),
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
      if (e.code !== 'auth/cancelled-popup-request' && e.code !== 'auth/popup-closed-by-user') {
        setVercelDiagError({ code: e.code, message: e.message });
        setShowVercelDiag(true);
      }
    }
  };

  const onUpdateWinRate = async (rate: number) => {
    if (state.isWinRateLocked) return;
    try {
      await setDoc(doc(db, 'config', 'admin'), { winRate: rate }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onToggleWinRateLock = async () => {
    try {
      await setDoc(doc(db, 'config', 'admin'), { isWinRateLocked: !state.isWinRateLocked }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onUpdateReferralAmount = async (amount: number) => {
    try {
      await setDoc(doc(db, 'config', 'admin'), { referralAmount: amount }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onToggleReferralEnabled = async () => {
    try {
      await setDoc(doc(db, 'config', 'admin'), { isReferralEnabled: !(state.isReferralEnabled ?? true) }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onUpdateMinLimits = async (minDeposit: number, minWithdraw: number) => {
    if (state.isTransferLimitsLocked) return;
    try {
      await setDoc(doc(db, 'config', 'admin'), { minDeposit, minWithdraw }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onToggleTransferLimitsLock = async () => {
    try {
      await setDoc(doc(db, 'config', 'admin'), { isTransferLimitsLocked: !state.isTransferLimitsLocked }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onUpdateMaxBet = async (max: number) => {
    try {
      await setDoc(doc(db, 'config', 'admin'), { maxBet: max }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onToggleBetLimit = async () => {
    try {
      await setDoc(doc(db, 'config', 'admin'), { isBetLimitEnabled: !state.isBetLimitEnabled }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onToggleManualMode = async () => {
    try {
      await setDoc(doc(db, 'config', 'admin'), { manualMode: !state.manualMode }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onUpdatePaymentSettings = async (settings: PaymentSettings) => {
    try {
      await setDoc(doc(db, 'config', 'admin'), { paymentSettings: settings }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onTogglePaymentLock = async () => {
    try {
      await setDoc(doc(db, 'config', 'admin'), { isPaymentLocked: !state.isPaymentLocked }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onToggleWithdrawLimit24h = async () => {
    try {
      await setDoc(doc(db, 'config', 'admin'), { isWithdrawLimit24hEnabled: !state.isWithdrawLimit24hEnabled }, { merge: true });
    } catch (e) { handleFirestoreError(e, OperationType.UPDATE, 'config/admin'); }
  };

  const onPlaceBet = async (amt: number) => {
    if (!user || !currentPlayer) return;
    try {
      const batch = writeBatch(db);
      const txnId = Math.random().toString(36).substr(2, 9);
      const timestamp = Date.now();

      batch.set(doc(db, 'transactions', txnId), {
        id: txnId,
        playerId: user.uid,
        type: 'bet',
        amount: amt,
        timestamp,
        status: 'pending'
      });

      batch.update(doc(db, 'players', user.uid), {
        balance: increment(-amt),
        pendingBet: { amount: amt, timestamp }
      });

      await batch.commit();

      if (!state.manualMode) {
        setTimeout(async () => {
          const playerSnap = await getDoc(doc(db, 'players', user.uid));
          if (!playerSnap.exists()) return;
          const player = playerSnap.data() as Player;
          
          const configSnap = await getDoc(doc(db, 'config', 'admin'));
          const config = configSnap.data();
          const winRate = config?.winRate ?? 0.45;

          let win = Math.random() < winRate;
          if (player.override === 'win') win = true;
          if (player.override === 'lose') win = false;
          
          resultBet(user.uid, win ? 'win' : 'lose');
        }, 1500);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'transactions');
    }
  };

  // Auto-open registration if player profile is missing
  useEffect(() => {
    if (!loading && user) {
      const exists = state.players.find(p => p.id === user.uid);
      if (!exists) {
        setShowRegisterModal(true);
      }
    } else if (!loading && !user) {
      setShowRegisterModal(true);
    }
  }, [user, loading, state.players]);

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
      <AnimatePresence>
        {loading && (
          <motion.div 
            key="matrix-loader"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-[#01030e] flex items-center justify-center overflow-hidden"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.1, opacity: 0 }}
              className="relative flex flex-col items-center"
            >
              <h1 className="text-8xl md:text-9xl font-matrix text-white select-none relative drop-shadow-[0_0_30px_rgba(163,230,53,0.2)]">
                <span className="text-[#a3e635]">M</span>atrix
              </h1>
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: '85%' }}
                transition={{ delay: 0.4, duration: 0.6, ease: "easeOut" }}
                className="h-2 bg-[#a3e635] mt-[-1rem] rounded-full self-end mr-6"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Navbar / Mobile Header */}
      <header className="lg:hidden flex items-center justify-between p-4 border-b border-white/10 sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-md z-50">
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
          <Menu className="w-6 h-6" />
        </button>
        <div className="flex flex-col items-center">
          <img src="/matrix_logo.png" alt="Matrix Logo" className="h-8 w-auto object-contain" />
          <span className="text-lg font-mono font-bold text-emerald-400 mt-0.5">₹{(currentPlayer?.balance ?? 0).toFixed(2)}</span>
        </div>
        <button 
          onClick={() => { setActiveTab('wallet'); playSound('CLICK'); }}
          className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl transition-all relative"
        >
          <Wallet className="w-5 h-5 text-emerald-400" />
          {currentPlayer?.balance > 0 && (
            <div className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full border border-[#0a0a0a]" />
          )}
        </button>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-[#0d0d0d] border-r border-white/5 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0
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
                icon={<Trophy className="w-5 h-5" />}
                label="Leaderboard"
              />

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
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white/5 rounded-xl border border-white/5 text-slate-400 hover:text-white transition-colors"
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
              <p className="text-emerald-400/60 text-xs font-semibold uppercase tracking-wider mb-1 text-center">Total Balance</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">₹{(currentPlayer?.balance ?? 0).toFixed(2)}</span>
                <span className="text-xs text-emerald-400/40 font-mono">INR</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-2 font-mono truncate opacity-60">User: {currentPlayer?.name}</p>
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
        <main className="flex-1 min-h-screen">
          {/* Top Bar for Desktop */}
          <div className="hidden lg:grid grid-cols-3 items-center p-6 max-w-5xl mx-auto">
            <div className="flex justify-start">
              {/* Left empty or for other elements */}
            </div>
            
            <div className="flex justify-center">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-3"
              >
                <motion.img 
                  whileHover={{ scale: 1.15 }}
                  animate={{ 
                    y: [0, -4, 0],
                  }}
                  transition={{
                    y: {
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut"
                    },
                    type: "spring", 
                    stiffness: 300, 
                    damping: 15
                  }}
                  src="/matrix_logo.png" 
                  alt="Matrix Logo" 
                  className="h-24 w-auto object-contain filter drop-shadow-[0_0_20px_rgba(132,204,22,0.6)] cursor-pointer" 
                />
                <span className="text-2xl font-mono font-bold text-emerald-400/80">₹{(currentPlayer?.balance ?? 0).toFixed(2)}</span>
              </motion.div>
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={async () => {
                  try {
                    await logout();
                  } catch (e) {
                    console.error("Logout failed:", e);
                  }
                }}
                className="p-3 bg-white/5 hover:bg-rose-500/10 border border-white/5 rounded-2xl transition-all hover:scale-110 text-slate-500 hover:text-rose-500"
                title="Sign Out"
              >
                <LogOut className="w-6 h-6" />
              </button>
              <button 
                onClick={() => { setActiveTab('wallet'); playSound('CLICK'); }}
                className="p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all hover:scale-110 relative"
              >
                <Wallet className="w-6 h-6 text-emerald-400" />
                {currentPlayer?.balance > 0 && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0a0a0a]" />
                )}
              </button>
            </div>
          </div>

          <div className="max-w-5xl mx-auto p-4 lg:px-10 lg:pb-10 pt-0">
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
                      onClick={() => {
                        if (adminEmails.includes(adminEmailInput.toLowerCase()) && adminPasswordInput === '9113278916') {
                          setIsAdminLoggedIn(true);
                          setShowAdminLogin(false);
                          setActiveTab('admin');
                          setAdminEmailInput('');
                          setAdminPasswordInput('');
                        } else {
                          alert('Authentication Failed: Signal Terminated');
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

                          <button
                            type="button"
                            onClick={() => {
                              setVercelDiagError(null);
                              setShowVercelDiag(true);
                            }}
                            className="mt-2 text-[10px] font-bold text-teal-400 hover:text-teal-300 underline underline-offset-4 cursor-pointer transition-colors uppercase tracking-widest block mx-auto select-none"
                          >
                            Deploying on Vercel? Setup Guide
                          </button>
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

              {(!state.maintenanceMode || activeTab === 'admin') && activeTab === 'play' && (
                <motion.div
                  key="play"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <GameView 
                    state={state}
                    currentPlayer={currentPlayer}
                    playSound={playSound}
                    onPlaceBet={onPlaceBet}
                    onResetGraph={onResetPlayerGraph}
                  />
                </motion.div>
              )}

              {(!state.maintenanceMode || activeTab === 'admin') && activeTab === 'leaderboard' && (
                <motion.div
                  key="leaderboard"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <LeaderboardView state={state} />
                </motion.div>
              )}

              {(!state.maintenanceMode || activeTab === 'admin') && activeTab === 'wallet' && (
                <motion.div
                  key="wallet"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <WalletView 
                    state={state} 
                    currentPlayer={currentPlayer} 
                    onWithdraw={handleWithdraw} 
                    onDeposit={handleDeposit} 
                    playSound={playSound}
                    onResetGraph={onResetPlayerGraph}
                  />
                </motion.div>
              )}

              {activeTab === 'admin' && (
                <motion.div
                  key="admin"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <AdminView 
                    state={state} 
                    onUpdateWinRate={onUpdateWinRate}
                    onUpdateMaxBet={onUpdateMaxBet}
                    onUpdateMinLimits={onUpdateMinLimits}
                    onToggleBetLimit={onToggleBetLimit}
                    onToggleManualMode={onToggleManualMode}
                    onUpdatePlayerOverride={onUpdatePlayerOverride}
                    onSwitchPlayer={(id) => setState(prev => ({ ...prev, currentPlayerId: id }))}
                    onResultBet={resultBet}
                    onUpdateWithdrawalStatus={updateWithdrawalStatus}
                    onUpdateDepositStatus={updateDepositStatus}
                    onToggleMaintenanceMode={onToggleMaintenanceMode}
                    onUpdatePaymentSettings={onUpdatePaymentSettings}
                    onTogglePaymentLock={onTogglePaymentLock}
                    onReset={onResetSystem}
                    onResetHouseStats={onResetHouseStats}
                    onUpdateReferralAmount={onUpdateReferralAmount}
                    onToggleReferralEnabled={onToggleReferralEnabled}
                    onToggleWithdrawLimit24h={onToggleWithdrawLimit24h}
                    onToggleWinRateLock={onToggleWinRateLock}
                    onToggleTransferLimitsLock={onToggleTransferLimitsLock}
                  />
                </motion.div>
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
    <button 
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 relative group glass-button
        ${active 
          ? 'bg-emerald-500 text-black font-bold shadow-lg shadow-emerald-500/20' 
          : 'text-slate-500 hover:text-slate-100 hover:bg-white/5'}
      `}
    >
      <div className={`transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
        {icon}
      </div>
      <span className="font-display tracking-tight">{label}</span>
      {active && (
        <motion.div 
          layoutId="activeTabIndicator"
          className="ml-auto w-1.5 h-1.5 rounded-full bg-black/40"
        />
      )}
    </button>
  );
});

NavItem.displayName = 'NavItem';

// Sub-components (Views)

function GameView({ state, currentPlayer, onPlaceBet, playSound, onResetGraph }: { 
  state: AppState, 
  currentPlayer: Player, 
  onPlaceBet: (amt: number) => Promise<void>, 
  playSound: (key: keyof typeof SOUNDS) => void,
  onResetGraph: () => Promise<void>
}) {
  const [betAmount, setBetAmount] = useState(10);
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<'win' | 'lose' | null>(null);

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
          amount: `${difference > 0 ? '+' : '-'}₹${Math.abs(difference).toFixed(2)}`,
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
      setBetAmount(Math.max(1, Math.min(Math.floor(currentPlayer.balance), 10)));
    }
  }, [currentPlayer?.balance]);

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

  // Detect when bet is resolved by admin
  useEffect(() => {
     if (isSpinning && currentPlayer && !currentPlayer.pendingBet) {
       setIsSpinning(false);
       // The result would be the last transaction
       const lastTxn = state.transactions.find(t => t.playerId === currentPlayer.id);
       if (lastTxn && (lastTxn.type === 'win' || (lastTxn.type === 'bet' && lastTxn.status === 'completed'))) {
         setResult(lastTxn.type === 'win' ? 'win' : 'lose');
       }
     }
  }, [currentPlayer?.pendingBet, isSpinning, state.transactions, currentPlayer?.id]);

  const handlePlay = async () => {
    if (betAmount > currentPlayer.balance || betAmount <= 0) return;
    
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
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-8">
        {/* Game Main Area */}
        <div className="bg-[#0b0b0b] border border-white/5 rounded-[2rem] p-8 lg:p-12 text-center relative overflow-hidden shadow-2xl flex flex-col justify-center min-h-[500px]">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent opacity-30" />
          
          <h2 className="text-4xl lg:text-5xl font-display font-bold mb-4 tracking-tight">Double Your <span className="text-emerald-400">Cash</span></h2>
          <p className="text-slate-400 mb-12 max-w-sm mx-auto">Enter an amount and try your luck. High risk, high reward.</p>

          <div className="max-w-xs mx-auto w-full space-y-8 relative">
            {/* Available Balance HUD inside GameView */}
            <div className="relative flex justify-center mb-2">
              <motion.div 
                animate={
                  flashType === 'win' 
                    ? { scale: [1, 1.15, 1], borderColor: ['rgba(255,255,255,0.05)', 'rgba(52,211,153,0.5)', 'rgba(255,255,255,0.05)'], backgroundColor: ['rgba(255,255,255,0)', 'rgba(16,185,129,0.1)', 'rgba(255,255,255,0)'] }
                    : flashType === 'lose'
                    ? { scale: [1, 0.95, 1], borderColor: ['rgba(255,255,255,0.05)', 'rgba(239,68,68,0.5)', 'rgba(255,255,255,0.05)'], backgroundColor: ['rgba(255,255,255,0)', 'rgba(239,68,68,0.1)', 'rgba(255,255,255,0)'] }
                    : {}
                }
                transition={{ duration: 0.8, ease: "easeInOut" }}
                className="flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-white/[0.02] border border-white/5 backdrop-blur-sm shadow-xl relative z-10"
              >
                <div className={`p-1.5 rounded-lg transition-colors duration-300 ${
                  flashType === 'win' ? 'bg-emerald-500/20 text-emerald-400' : 
                  flashType === 'lose' ? 'bg-rose-500/20 text-rose-400' : 
                  'bg-white/5 text-slate-400'
                }`}>
                  <Wallet className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-500">Vault Balance</p>
                  <motion.p 
                    animate={
                      flashType === 'win' 
                        ? { color: ['#ffffff', '#34d399', '#ffffff'] }
                        : flashType === 'lose'
                        ? { color: ['#ffffff', '#f87171', '#ffffff'] }
                        : {}
                    }
                    className="text-lg font-mono font-bold text-white transition-colors duration-300"
                  >
                    ₹{currentBalance.toFixed(2)}
                  </motion.p>
                </div>
              </motion.div>

              <AnimatePresence>
                {floatingIndicator && (
                  <motion.div
                    key={floatingIndicator.id}
                    initial={{ opacity: 0, y: 15, scale: 0.8 }}
                    animate={{ opacity: 1, y: -45, scale: 1.1 }}
                    exit={{ opacity: 0, y: -70, scale: 0.9 }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className={`absolute z-20 font-mono font-black text-xs px-3 py-1 rounded-full border shadow-lg filter drop-shadow-sm ${
                      floatingIndicator.type === 'gain' 
                        ? 'bg-emerald-950/90 text-emerald-400 border-emerald-500/30' 
                        : 'bg-rose-950/90 text-rose-400 border-rose-500/30'
                    }`}
                  >
                    {floatingIndicator.amount}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {result === 'win' && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.2, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 bg-emerald-500 rounded-3xl pointer-events-none z-0"
                />
              )}
            </AnimatePresence>

            <div className="relative z-10 space-y-4">
              <div className="flex justify-between items-end mb-2">
                <div className="flex flex-col">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Bet Amount</label>
                  {state.isBetLimitEnabled && (
                    <span className="text-[8px] text-slate-600 uppercase font-bold tracking-tighter">Max Bet: ₹{state.maxBet}</span>
                  )}
                </div>
                <span className="text-2xl font-mono font-bold text-emerald-400">₹{betAmount}</span>
              </div>
                <input 
                type="range" 
                min="1" 
                max={Math.min(Math.max(1, Math.floor(currentPlayer?.balance || 0)), state.isBetLimitEnabled ? (state.maxBet || 500) : 1000000)}
                value={betAmount || 0} 
                onChange={(e) => {
                  setBetAmount(Number(e.target.value));
                  playSound('CLICK'); 
                }}
                disabled={isSpinning}
                className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>

            <div className="relative space-y-6">
               <button 
                onClick={handlePlay}
                disabled={isSpinning || (currentPlayer?.balance ?? 0) < 1}
                className={`
                  w-full py-5 rounded-2xl text-xl font-bold transition-all duration-300 relative z-10
                  ${isSpinning ? 'bg-white/5 text-slate-500 cursor-not-allowed' : 'bg-emerald-500 text-black hover:transform hover:scale-[1.02] shadow-2xl shadow-emerald-500/20'}
                `}
              >
                {isSpinning ? 'PLAYING...' : 'DOUBLE OR DONATE'}
              </button>

              <div className="flex items-center justify-center gap-2.5 text-[10px] font-black tracking-wider text-slate-400 uppercase py-2.5 bg-white/[0.02] border border-white/5 rounded-2xl px-5 select-none shadow-sm transition-all duration-300">
                <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500/25 animate-pulse shrink-0" />
                <span>Your Lost Amount Will Be Donated To Poor</span>
              </div>

              <div className="flex items-start gap-3 text-[9px] font-extrabold tracking-widest text-amber-500/90 uppercase py-3.5 bg-amber-500/[0.02] border border-amber-500/10 rounded-2xl px-5 select-none shadow-sm transition-all duration-300 text-left">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span className="leading-normal">Don't logout with balance in the account. We are not responsible for your loss.</span>
              </div>
              
              <AnimatePresence mode="wait">
                {result && (
                  <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="flex flex-col items-center whitespace-nowrap z-0 py-4"
                  >
                    {result === 'win' ? (
                      <span className="font-black text-6xl italic tracking-tighter text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.4)] animate-pulse">
                        WINNER!
                      </span>
                    ) : (
                      <div className="flex flex-col items-center">
                        <span className="font-black text-7xl italic tracking-tighter text-red-600 mb-2 drop-shadow-[0_0_30px_rgba(220,38,38,0.4)]">
                          DONATED
                        </span>
                        <span className="text-white font-extrabold tracking-[0.1em] text-xs uppercase text-center max-w-[250px] leading-relaxed drop-shadow-md">
                          Your Money Has been Donated to The Poor
                        </span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {(currentPlayer?.balance ?? 0) < 1 && (
               <div className="flex items-center justify-center gap-2 text-rose-400 text-xs bg-rose-400/10 py-3 rounded-xl border border-rose-400/20">
                 <AlertCircle className="w-4 h-4" />
                 <span>Insufficient balance in vault.</span>
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LeaderboardView({ state }: { state: AppState }) {
  const sortedPlayers = [...state.players].sort((a, b) => b.balance - a.balance);

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 px-4">
      <div className="flex flex-col items-center justify-center text-center space-y-4 mb-12">
        <div className="p-4 bg-emerald-500/10 rounded-3xl border border-emerald-500/20">
          <Trophy className="w-12 h-12 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-4xl font-display font-bold tracking-tight">Leaderboard</h2>
          <p className="text-slate-500 font-mono text-xs uppercase tracking-[0.2em] mt-2">The Top Performance Arena</p>
        </div>
      </div>

      <div className="glass-card rounded-[2.5rem] overflow-hidden border border-white/5">
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
           <h4 className="font-display font-bold text-xl flex items-center gap-3">
             <TrendingUp className="w-6 h-6 text-emerald-400" />
             Top Players
           </h4>
           <span className="text-slate-500 font-mono text-[10px] uppercase tracking-widest">{state.players.length} Competitors</span>
        </div>
        <div className="divide-y divide-white/5">
          {sortedPlayers.map((player, index) => (
            <div key={player.id} className="p-8 flex items-center justify-between gap-6 hover:bg-white/[0.01] transition-all duration-300">
               <div className="flex items-center gap-6">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xl ${
                    index === 0 ? 'bg-amber-500 text-amber-950 shadow-lg shadow-amber-500/20' : 
                    index === 1 ? 'bg-slate-300 text-slate-900' :
                    index === 2 ? 'bg-orange-600 text-orange-950' :
                    'bg-white/5 text-slate-400 border border-white/5'
                  }`}>
                    {index + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="text-xl font-display font-bold text-white tracking-tight">{player.name}</p>
                      {index < 3 && <Flame className="w-4 h-4 text-orange-500 animate-pulse" />}
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono uppercase tracking-[0.2em] mt-1">Status: Active</p>
                  </div>
               </div>
               <div className="text-right">
                 <p className="text-2xl font-display font-bold text-emerald-400">₹{player.balance.toFixed(2)}</p>
                 <p className="text-[10px] text-slate-600 font-mono uppercase tracking-widest mt-1">Total Assets</p>
               </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WalletView({ state, currentPlayer, onWithdraw, onDeposit, playSound, onResetGraph }: { 
  state: AppState, 
  currentPlayer: Player,
  onWithdraw: (amt: number, method: string, details: string) => void,
  onDeposit: (amt: number, method: string, details: string, screenshotUrl?: string) => void,
  playSound: (sound: 'CLICK' | 'WIN' | 'LOSE' | 'BET' | 'SPIN') => void,
  onResetGraph: () => Promise<void>
}) {
  const [modalType, setModalType] = useState<'deposit' | 'withdraw' | null>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState('');
  const [details, setDetails] = useState('');
  const [screenshot, setScreenshot] = useState<string | undefined>(undefined);
  
  // Custom structured Bank Account fields for withdrawals
  const [bankName, setBankName] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [holderName, setHolderName] = useState('');

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
    setScreenshot(undefined);
    setModalType(null);
    setStep(1);
    setSuccess(false);
  };

  const handleConfirm = () => {
    if (modalType === 'deposit') {
      onDeposit(amount, method, details, screenshot);
    } else {
      const fullDetails = `Name: ${holderName.trim()} | Account number: ${accNumber.trim()} | IFSC Code: ${ifscCode.trim()} | Bank: ${bankName.trim()}`;
      onWithdraw(amount, method, fullDetails);
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

  return (
    <div className="space-y-10">
      <div className="p-10 bg-slate-900/50 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-12 opacity-10 transition-transform duration-700 group-hover:scale-110 group-hover:rotate-12 translate-x-1/4 -translate-y-1/4">
          <Wallet className="w-64 h-64" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10 text-center sm:text-left">
          <div className="flex justify-center sm:justify-start mb-6">
            <img src="/matrix_logo.png" alt="Matrix Logo" className="h-16 w-auto object-contain" />
          </div>
          <p className="text-emerald-500/60 font-black uppercase tracking-[0.2em] text-[10px] mb-3">Total Vault Balance</p>
          <motion.h2 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-6xl lg:text-7xl font-display font-bold text-white mb-12 tracking-tighter drop-shadow-sm"
          >
            <span className="text-4xl lg:text-5xl mr-1">₹</span>
            {(currentPlayer?.balance ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </motion.h2>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
            <button 
              onClick={() => { setModalType('deposit'); setMethod('upi'); playSound('CLICK'); }}
              className="flex items-center gap-3 bg-emerald-500 text-black px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-emerald-500/20"
            >
              <ArrowDownLeft className="w-5 h-5" />
              Deposit
            </button>
            <button 
              onClick={() => { setModalType('withdraw'); setMethod('Bank transfer'); playSound('CLICK'); }}
              className="flex items-center gap-3 bg-white/10 backdrop-blur-md text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/20 active:scale-95 transition-all border border-white/10"
            >
              <ArrowUpRight className="w-5 h-5" />
              Withdraw
            </button>
          </div>
        </div>
      </div>

      {/* Pending Actions Highlighting */}
      {(state.withdrawals.filter(w => w.status === 'pending' && w.playerId === currentPlayer?.id).length > 0 || 
        state.deposits.filter(d => d.status === 'pending' && d.playerId === currentPlayer?.id).length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.deposits.filter(d => d.status === 'pending' && d.playerId === currentPlayer?.id).map(req => (
            <div key={req.id} className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between animate-pulse">
              <div className="flex items-center gap-4">
                <div className="bg-emerald-500/20 p-2 rounded-xl">
                  <Clock className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Deposit Pending</p>
                  <p className="text-sm font-bold">₹{req.amount.toFixed(2)}</p>
                </div>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Verifying...</span>
            </div>
          ))}
          {state.withdrawals.filter(w => w.status === 'pending' && w.playerId === currentPlayer?.id).map(req => (
            <div key={req.id} className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-center justify-between animate-pulse">
              <div className="flex items-center gap-4">
                <div className="bg-amber-500/20 p-2 rounded-xl">
                  <Clock className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Withdrawal Pending</p>
                  <p className="text-sm font-bold">₹{req.amount.toFixed(2)}</p>
                </div>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">Processing...</span>
            </div>
          ))}
        </div>
      )}

      {/* Referral Section */}
      <div className={`glass-card p-10 rounded-[2.5rem] relative overflow-hidden group transition-all ${
        (state.isReferralEnabled ?? true) 
          ? 'bg-emerald-500/5 border border-emerald-500/10' 
          : 'bg-rose-500/5 border border-rose-500/10 opacity-70'
      }`}>
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-all group-hover:scale-110">
          <Share2 className={`w-32 h-32 ${
            (state.isReferralEnabled ?? true) ? 'text-emerald-400' : 'text-rose-400'
          }`} />
        </div>
        <div className="relative z-10 space-y-6">
          <div>
            <h3 className="text-2xl font-display font-bold text-white flex items-center gap-3">
              <Share2 className={`w-6 h-6 ${(state.isReferralEnabled ?? true) ? 'text-emerald-400' : 'text-rose-400'}`} />
              {(state.isReferralEnabled ?? true) ? `Refer & Earn ₹${state.referralAmount ?? 10}` : 'Referrals Paused'}
            </h3>
            <p className="text-slate-400 text-sm mt-1 max-w-sm">
              {(state.isReferralEnabled ?? true) 
                ? `Share your code with friends. When they join, you both get a ₹${state.referralAmount ?? 10} cash bonus instantly!` 
                : 'The referral promotion is temporarily paused by admin. Check back later!'}
            </p>
          </div>
          
          {(state.isReferralEnabled ?? true) && (
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
                 className="bg-emerald-500 text-black px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 transition-all shadow-xl shadow-emerald-500/20 glass-button"
               >
                 Copy Code
               </button>
            </div>
          )}
        </div>
      </div>

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
             className="flex items-center gap-2 text-[10px] font-black uppercase bg-white/5 border border-white/10 px-5 py-2.5 rounded-xl text-slate-400 hover:text-white transition-all hover:bg-rose-500/10 hover:border-rose-500/30 group shadow-lg"
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
                      key={txn.id} 
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
                        {txn.type === 'win' || txn.type === 'deposit' ? '+' : '-'}₹{txn.amount.toFixed(2)}
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
                      <button onClick={resetForm} className="p-3 hover:bg-white/5 rounded-2xl transition-colors">
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
                          Your {modalType} of ₹{amount.toFixed(2)} is being processed by our team.
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
                        {modalType === 'deposit' && step === 1 ? (
                          <div className="space-y-6">
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Select Deposit Amount</label>
                              <div className="grid grid-cols-2 gap-3 mb-6">
                                {[100, 500, 1000, 2000, 5000, 10000].map(val => (
                                  <button 
                                    key={val}
                                    onClick={() => setAmount(val)}
                                    className={`py-3 rounded-xl border font-bold transition-all text-sm ${amount === val ? 'bg-emerald-500 border-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'bg-white/5 border-white/5 hover:border-white/10 text-white'}`}
                                  >
                                    ₹{val.toLocaleString()}
                                  </button>
                                ))}
                              </div>
                              <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                                <input 
                                  type="number" 
                                  value={amount || ''} 
                                  onChange={(e) => setAmount(Number(e.target.value))}
                                  className="w-full bg-white/5 border border-white/5 rounded-xl pl-8 pr-4 py-4 focus:outline-none focus:border-emerald-500/50 transition-all font-mono text-lg"
                                  placeholder="Custom Amount"
                                />
                              </div>
                              {amount > 0 && amount < (state.minDeposit ?? 100) && (
                                <p className="text-[10px] text-rose-400 mt-2 italic px-1">Min deposit is ₹{(state.minDeposit ?? 100).toFixed(2)}</p>
                              )}
                            </div>
                            <button 
                              disabled={amount < (state.minDeposit ?? 100)}
                              onClick={() => setStep(2)}
                              className="w-full py-5 bg-emerald-500 text-black rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 translate-y-0"
                            >
                              Next: Payment Details
                            </button>
                          </div>
                        ) : modalType === 'deposit' && step === 2 ? (
                          <div className="space-y-6">
                            {state.paymentSettings && (
                              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-3xl p-6 space-y-6">
                                <div className="text-center space-y-2">
                                  <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Pay to Admin</p>
                                  <p className="text-4xl font-display font-black text-white">₹{amount.toFixed(2)}</p>
                                </div>
                                
                                {state.paymentSettings.qrCodeUrl && (
                                   <div className="bg-white p-3 rounded-2xl shadow-2xl mx-auto w-48 h-48">
                                     <img src={state.paymentSettings.qrCodeUrl} alt="QR" className="w-full h-full object-contain" />
                                   </div>
                                )}

                                <div className="space-y-3">
                                  {state.paymentSettings.upiId && (
                                    <div className="bg-black/20 p-4 rounded-xl border border-white/5 flex items-center justify-between">
                                      <div className="truncate pr-4">
                                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Our UPI ID</p>
                                        <p className="text-xs font-mono text-emerald-400 truncate">{state.paymentSettings.upiId}</p>
                                      </div>
                                      <button 
                                        onClick={() => { navigator.clipboard.writeText(state.paymentSettings?.upiId || ''); playSound('CLICK'); }}
                                        className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg"
                                      >
                                        <Copy className="w-4 h-4 text-emerald-400" />
                                      </button>
                                    </div>
                                  )}
                                  <div className="bg-amber-500/5 border border-amber-500/10 p-3 rounded-xl flex gap-3">
                                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                                    <p className="text-[10px] text-amber-200/60 leading-relaxed italic">
                                      Pay the amount above to our UPI and enter your Transaction Ref/Phone number below.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            <div className="space-y-4">
                              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Payment Reference / Phone</label>
                              <input 
                                type="text"
                                value={details}
                                onChange={(e) => setDetails(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 focus:outline-none focus:border-emerald-500 transition-all text-white placeholder:text-slate-600"
                                placeholder="Enter PayTM/GPay Ref or Phone..."
                              />
                            </div>

                            <div className="flex gap-3">
                              <button onClick={() => setStep(1)} className="flex-1 py-5 bg-white/5 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[9px]">Back</button>
                              <button 
                                disabled={!details.trim()}
                                onClick={() => setStep(3)}
                                className="flex-[2] py-5 bg-emerald-500 text-black rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
                              >
                                Next: Upload Screenshot
                              </button>
                            </div>
                          </div>
                        ) : modalType === 'deposit' && step === 3 ? (
                          <div className="space-y-6">
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                              <div className="flex items-center gap-3 mb-2">
                                <ImageIcon className="w-5 h-5 text-emerald-400" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400/80">Upload Payment Proof</span>
                              </div>
                              <div className="relative group aspect-video rounded-xl border-2 border-dashed border-white/10 bg-black/40 flex items-center justify-center overflow-hidden transition-all hover:border-emerald-500/40">
                                {screenshot ? (
                                  <>
                                    <img src={screenshot} alt="Screenshot" className="w-full h-full object-contain" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                      <ImageIcon className="w-6 h-6 text-white" />
                                      <span className="text-[9px] font-black uppercase text-white">Change Photo</span>
                                    </div>
                                  </>
                                ) : (
                                  <div className="flex flex-col items-center gap-3 text-slate-500">
                                    <ImageIcon className="w-10 h-10 opacity-20" />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Attach Screenshot</span>
                                  </div>
                                )}
                                <input 
                                  type="file" 
                                  accept="image/*"
                                  onChange={handleScreenshotUpload}
                                  className="absolute inset-0 opacity-0 cursor-pointer"
                                />
                              </div>
                              <p className="text-[9px] text-slate-500 italic text-center">Attach a clear screenshot of your payment for faster approval.</p>
                            </div>
                            <div className="flex gap-3">
                              <button onClick={() => setStep(2)} className="flex-1 py-5 bg-white/5 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[9px]">Back</button>
                              <button 
                                disabled={!screenshot}
                                onClick={handleConfirm}
                                className="flex-[2] py-5 bg-emerald-500 text-black rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
                              >
                                Submit Deposit
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Withdrawal UI remains simple but polished */
                          <div className="space-y-6">
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
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Withdraw Amount</label>
                                <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                                  <input 
                                    type="number" 
                                    disabled={!!lastWithdrawalIn24h}
                                    value={amount || ''} 
                                    onChange={(e) => setAmount(Number(e.target.value))}
                                    className="w-full bg-white/5 border border-white/5 rounded-xl pl-8 pr-4 py-4 focus:outline-none focus:border-white/20 transition-all font-mono text-lg disabled:opacity-40 disabled:cursor-not-allowed"
                                    placeholder="0.00"
                                  />
                                </div>
                                <div className="flex justify-between mt-2 px-1">
                                  <p className="text-[10px] text-slate-500">Available: ₹{(currentPlayer?.balance ?? 0).toFixed(2)}</p>
                                  <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider animate-pulse">10% Withdrawal Fees</p>
                                </div>
                                {amount > 0 && amount < (state.minWithdraw ?? 500) && (
                                  <p className="text-[10px] text-rose-400 mt-2 italic">Min withdrawal is ₹{(state.minWithdraw ?? 500).toFixed(2)}</p>
                                )}
                              </div>
                              
                              <div className="space-y-4">
                                <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Bank Account Credentials</h4>
 
                                <div>
                                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 px-1">Account Holder Name</label>
                                  <input 
                                    type="text" 
                                    disabled={!!lastWithdrawalIn24h}
                                    value={holderName}
                                    onChange={(e) => setHolderName(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-white/30 hover:border-white/20 transition-all text-white font-sans text-xs placeholder:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                    placeholder="Full Name as per bank records"
                                  />
                                </div>
 
                                <div>
                                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 px-1">Bank Name</label>
                                  <input 
                                    type="text" 
                                    disabled={!!lastWithdrawalIn24h}
                                    value={bankName}
                                    onChange={(e) => setBankName(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-white/30 hover:border-white/20 transition-all text-white font-sans text-xs placeholder:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                    placeholder="e.g. State Bank of India, HDFC"
                                  />
                                </div>
 
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 px-1">Account Number</label>
                                    <input 
                                      type="text" 
                                      disabled={!!lastWithdrawalIn24h}
                                      value={accNumber}
                                      onChange={(e) => setAccNumber(e.target.value.replace(/\D/g, ''))}
                                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-white/30 hover:border-white/20 transition-all text-white font-mono text-xs placeholder:text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                      placeholder="Account number"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 px-1">IFSC Code</label>
                                    <input 
                                      type="text" 
                                      disabled={!!lastWithdrawalIn24h}
                                      value={ifscCode}
                                      onChange={(e) => setIfscCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 focus:outline-none focus:border-white/30 hover:border-white/20 transition-all text-white font-mono text-xs placeholder:text-slate-600 uppercase disabled:opacity-40 disabled:cursor-not-allowed"
                                      placeholder="e.g. SBIN0001234"
                                    />
                                  </div>
                                </div>
 
                                <p className="text-[9px] text-slate-500 leading-normal italic pt-1 px-1">
                                  Provide complete, accurate bank details to avoid delays in processing.
                                </p>
                              </div>
                            </div>
 
                            <button 
                              disabled={!!lastWithdrawalIn24h || amount < (state.minWithdraw ?? 500) || amount > (currentPlayer?.balance ?? 0) || !holderName.trim() || !accNumber.trim() || !ifscCode.trim() || !bankName.trim()}
                              onClick={handleConfirm}
                              className="w-full py-5 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20"
                            >
                              {lastWithdrawalIn24h ? 'Payout Limit Exceeded (24h)' : 'Confirm Payout'}
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
}

function AdminView({ state, onUpdateWinRate, onUpdateMaxBet, onUpdateMinLimits, onToggleBetLimit, onToggleManualMode, onUpdatePlayerOverride, onSwitchPlayer, onResultBet, onUpdateWithdrawalStatus, onUpdateDepositStatus, onToggleMaintenanceMode, onUpdatePaymentSettings, onTogglePaymentLock, onReset, onResetHouseStats, onUpdateReferralAmount, onToggleReferralEnabled, onToggleWithdrawLimit24h, onToggleWinRateLock, onToggleTransferLimitsLock }: { 
  state: AppState, 
  onUpdateWinRate: (rate: number) => void,
  onUpdateMaxBet: (max: number) => void,
  onUpdateMinLimits: (minDeposit: number, minWithdraw: number) => void,
  onToggleBetLimit: () => void,
  onToggleManualMode: () => void,
  onUpdatePlayerOverride: (id: string, override: 'win' | 'lose' | 'none') => void,
  onSwitchPlayer: (id: string) => void,
  onResultBet: (playerId: string, outcome: 'win' | 'lose') => void,
  onUpdateWithdrawalStatus: (id: string, status: 'completed' | 'rejected') => void,
  onUpdateDepositStatus: (id: string, status: 'completed' | 'rejected') => void,
  onToggleMaintenanceMode: () => void,
  onUpdatePaymentSettings: (settings: PaymentSettings) => void,
  onTogglePaymentLock: () => void,
  onReset: () => Promise<void>,
  onResetHouseStats: () => Promise<void>,
  onUpdateReferralAmount: (amount: number) => void,
  onToggleReferralEnabled: () => void,
  onToggleWithdrawLimit24h: () => void,
  onToggleWinRateLock: () => void,
  onToggleTransferLimitsLock: () => void
}) {
  const [withdrawalFilter, setWithdrawalFilter] = useState<'pending' | 'completed' | 'rejected' | 'all'>('pending');
  const [depositFilter, setDepositFilter] = useState<'pending' | 'completed' | 'rejected' | 'all'>('pending');

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

  const filteredDeposits = useMemo(() => {
    if (depositFilter === 'all') return state.deposits;
    return state.deposits.filter(d => d.status === depositFilter);
  }, [state.deposits, depositFilter]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div className="space-y-1">
          <h2 className="text-5xl font-display font-bold tracking-[ -0.05em] text-white">
            ADMIN <span className="text-emerald-400/80">CORE</span>
          </h2>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-slate-500 font-mono text-[10px] uppercase tracking-[0.3em]">System Operations Interface</p>
          </div>
        </div>
        <div className="flex gap-4">
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onToggleMaintenanceMode()}
            className={`group flex items-center gap-3 border px-8 py-4 rounded-2xl transition-all duration-500 ${
              state.maintenanceMode 
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-400' 
              : 'bg-white/5 border-white/5 hover:bg-amber-500/10 hover:border-amber-500/20'
            }`}
          >
            <ShieldAlert className={`w-4 h-4 ${state.maintenanceMode ? 'text-rose-400 animate-pulse' : 'text-slate-500 group-hover:text-amber-500'} transition-all`} />
            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${state.maintenanceMode ? 'text-rose-400' : 'text-slate-400 group-hover:text-amber-400'}`}>
              {state.maintenanceMode ? 'ACTIVE MAINTENANCE' : 'Service Shutdown'}
            </span>
          </motion.button>
        </div>
      </div>

      {/* Pending Bets */}
      <div className="glass-card rounded-[2.5rem] overflow-hidden mb-8 border border-amber-500/10">
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-amber-500/[0.02]">
           <h4 className="font-display font-bold text-xl flex items-center gap-3">
             <DollarSign className="w-6 h-6 text-amber-500" />
             Pending Bets
           </h4>
           <span className="bg-amber-500/10 text-amber-500 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border border-amber-500/20">
             {state.players.filter(p => p.pendingBet).length} Pending
           </span>
        </div>
        <div className="divide-y divide-white/5">
          {state.players.filter(p => p.pendingBet).length === 0 ? (
            <div className="p-20 text-center text-slate-600 font-display italic">No active bets currently awaiting outcome</div>
          ) : (
            state.players.filter(p => p.pendingBet).map(player => (
              <div key={player.id} className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-white/[0.01] transition-colors">
                <div className="flex items-center gap-5">
                   <div className="w-14 h-14 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center font-bold text-xl text-emerald-400">
                     {player.name.charAt(0)}
                   </div>
                   <div>
                     <p className="font-display font-bold text-lg">{player.name}</p>
                     <div className="flex items-center gap-3 mt-1">
                       <p className="text-emerald-400 font-mono text-xl font-black">₹{player.pendingBet?.amount.toFixed(2)}</p>
                       <span className="text-[10px] text-slate-600 uppercase font-black tracking-widest">ID: {player.id}</span>
                     </div>
                   </div>
                </div>
                
                <div className="flex gap-3">
                    <button 
                      onClick={() => onResultBet(player.id, 'win')}
                      className="bg-emerald-500 text-emerald-950 px-8 py-3 rounded-2xl text-xs font-black hover:scale-105 transition-all shadow-xl shadow-emerald-500/10 uppercase tracking-widest glass-button"
                    >
                      Resolve Win
                    </button>
                    <button 
                      onClick={() => onResultBet(player.id, 'lose')}
                      className="bg-rose-500 text-rose-950 px-8 py-3 rounded-2xl text-xs font-black hover:scale-105 transition-all shadow-xl shadow-rose-500/10 uppercase tracking-widest glass-button"
                    >
                      Resolve Loss
                    </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        <div 
          onClick={() => {
            const el = document.getElementById('deposits-section');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="bg-[#0f0f0f] border border-white/5 p-6 rounded-[2rem] hover:border-emerald-500/30 transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-emerald-500/10 rounded-2xl group-hover:bg-emerald-500/20 transition-colors">
              <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
            </div>
            {state.deposits.filter(d => d.status === 'pending').length > 0 && (
              <span className="bg-emerald-500 text-black text-[9px] font-black px-2 py-0.5 rounded-full animate-bounce">
                {state.deposits.filter(d => d.status === 'pending').length} NEW
              </span>
            )}
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Pending Deposits</p>
          <p className="text-2xl font-display font-bold text-white">₹{state.deposits.filter(d => d.status === 'pending').reduce((s, d) => s + d.amount, 0).toLocaleString()}</p>
        </div>

        <div 
          onClick={() => {
            const el = document.getElementById('withdrawals-section');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="bg-[#0f0f0f] border border-white/5 p-6 rounded-[2rem] hover:border-blue-500/30 transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-blue-500/10 rounded-2xl group-hover:bg-blue-500/20 transition-colors">
              <ArrowUpRight className="w-5 h-5 text-blue-400" />
            </div>
            {state.withdrawals.filter(w => w.status === 'pending').length > 0 && (
              <span className="bg-blue-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full animate-bounce">
                {state.withdrawals.filter(w => w.status === 'pending').length} NEW
              </span>
            )}
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Pending Payouts</p>
          <p className="text-2xl font-display font-bold text-white">₹{state.withdrawals.filter(w => w.status === 'pending').reduce((s, d) => s + d.amount, 0).toLocaleString()}</p>
        </div>

        <div className="bg-[#0f0f0f] border border-white/5 p-6 rounded-[2rem]">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-emerald-500/10 rounded-2xl">
              <UserPlus className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Active Users</p>
          <p className="text-2xl font-display font-bold text-white">{state.players.length}</p>
        </div>
      </div>

      {/* 2. Withdrawal Requests */}
      <div id="withdrawals-section" className="glass-card rounded-[2.5rem] overflow-hidden mb-8 scroll-mt-24">
        <div className="p-8 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between bg-white/[0.01] gap-6">
           <div className="flex items-center gap-3">
             <ArrowUpRight className="w-6 h-6 text-blue-400" />
             <h4 className="font-display font-bold text-xl">Withdrawal Requests</h4>
             <span className="bg-blue-500/10 text-blue-400 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border border-blue-500/20">
               {state.withdrawals.filter(w => w.status === 'pending').length} New
             </span>
           </div>

           <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
              {(['pending', 'completed', 'rejected', 'all'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setWithdrawalFilter(filter)}
                  className={`
                    px-4 py-2 rounded-lg font-black uppercase tracking-widest text-[9px] transition-all
                    ${withdrawalFilter === filter 
                      ? 'bg-blue-500 text-blue-950 shadow-lg shadow-blue-500/20' 
                      : 'text-slate-500 hover:text-slate-300'}
                  `}
                >
                  {filter}
                </button>
              ))}
           </div>
        </div>
        <div className="divide-y divide-white/5">
          {filteredWithdrawals.length === 0 ? (
            <div className="p-20 text-center text-slate-600 font-display italic">No {withdrawalFilter !== 'all' ? withdrawalFilter : ''} withdrawal requests found</div>
          ) : (
            filteredWithdrawals.map(req => {
              const player = state.players.find(p => p.id === req.playerId);
              return (
                <div key={req.id} className="p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-8 hover:bg-white/[0.01] transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center gap-8 flex-1">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/5 border border-blue-500/10 flex items-center justify-center font-bold text-lg text-blue-400">
                          {player?.name.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="font-display font-bold text-white">{player?.name || 'Unknown Player'}</p>
                          <p className="text-[10px] text-slate-500 font-mono">Balance Req: ₹{(req.playerBalanceAtRequest ?? 0).toFixed(2)}</p>
                        </div>
                     </div>

                     <div className="h-8 w-[1px] bg-white/5 hidden md:block" />

                     <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xl font-display font-bold text-emerald-400">₹{(req.amount ?? 0).toFixed(2)}</span>
                          <span className="bg-white/5 text-[9px] font-black px-2.5 py-1 rounded-lg uppercase text-slate-400 border border-white/5 tracking-tighter">{req.method}</span>
                        </div>
                        <p className="text-xs text-slate-400 font-mono tracking-tight bg-white/5 p-2 rounded-lg border border-white/5 mt-2">{req.details}</p>
                     </div>
                  </div>

                  <div className="flex flex-col items-end gap-3 shrink-0">
                    <p className="text-[10px] text-slate-600 font-mono uppercase tracking-widest">{new Date(req.timestamp).toLocaleString()}</p>
                    {req.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => onUpdateWithdrawalStatus(req.id, 'completed')}
                          className="bg-emerald-500 text-emerald-950 px-6 py-2.5 rounded-xl text-[10px] font-black hover:scale-105 transition-all shadow-xl shadow-emerald-500/10 uppercase tracking-widest glass-button"
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => onUpdateWithdrawalStatus(req.id, 'rejected')}
                          className="bg-rose-500 text-rose-950 px-6 py-2.5 rounded-xl text-[10px] font-black hover:scale-105 transition-all shadow-xl shadow-rose-500/10 uppercase tracking-widest glass-button"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${req.status === 'completed' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500/60' : 'bg-rose-500/5 border-rose-500/20 text-rose-500/60'}`}>
                        {req.status}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2.1 Deposit Requests */}
      <div id="deposits-section" className="glass-card rounded-[2.5rem] overflow-hidden mb-8 scroll-mt-24">
        <div className="p-8 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between bg-white/[0.01] gap-6">
           <div className="flex items-center gap-3">
             <ArrowDownLeft className="w-6 h-6 text-emerald-400" />
             <h4 className="font-display font-bold text-xl">Deposit Requests</h4>
             <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border border-emerald-500/20">
               {state.deposits.filter(d => d.status === 'pending').length} New
             </span>
           </div>

           <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
              {(['pending', 'completed', 'rejected', 'all'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setDepositFilter(filter)}
                  className={`
                    px-4 py-2 rounded-lg font-black uppercase tracking-widest text-[9px] transition-all
                    ${depositFilter === filter 
                      ? 'bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/20' 
                      : 'text-slate-500 hover:text-slate-300'}
                  `}
                >
                  {filter}
                </button>
              ))}
           </div>
        </div>
        <div className="divide-y divide-white/5">
          {filteredDeposits.length === 0 ? (
            <div className="p-20 text-center text-slate-600 font-display italic">No {depositFilter !== 'all' ? depositFilter : ''} deposit requests found</div>
          ) : (
            filteredDeposits.map(req => {
              const player = state.players.find(p => p.id === req.playerId);
              return (
                <div key={req.id} className="p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-8 hover:bg-white/[0.01] transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center gap-8 flex-1">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center font-bold text-lg text-emerald-400">
                          {player?.name.charAt(0) || '?'}
                        </div>
                        <div>
                          <p className="font-display font-bold text-white">{player?.name || 'Unknown Player'}</p>
                          <p className="text-[10px] text-slate-500 font-mono">Balance Req: ₹{(req.playerBalanceAtRequest ?? 0).toFixed(2)}</p>
                        </div>
                     </div>

                     <div className="h-8 w-[1px] bg-white/5 hidden md:block" />

                     <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xl font-display font-bold text-emerald-400">₹{(req.amount ?? 0).toFixed(2)}</span>
                          <span className="bg-white/5 text-[9px] font-black px-2.5 py-1 rounded-lg uppercase text-slate-400 border border-white/5 tracking-tighter">{req.method}</span>
                        </div>
                        <p className="text-xs text-slate-400 font-mono tracking-tight bg-white/5 p-2 rounded-lg border border-white/5 mt-2">{req.details}</p>
                        {req.screenshotUrl && (
                          <div className="mt-4">
                            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Verification Screenshot</p>
                            <div className="relative group w-40 aspect-square rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black/40">
                              <img src={req.screenshotUrl} alt="Deposit Proof" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                <button 
                                  onClick={() => {
                                    const win = window.open();
                                    if (win) {
                                      win.document.write(`<img src="${req.screenshotUrl}" style="max-width: 100%; max-height: 100vh; display: block; margin: auto;">`);
                                      win.document.title = "Payment Verification";
                                    }
                                  }}
                                  className="px-4 py-2 bg-white text-black text-[10px] font-black uppercase rounded-xl hover:scale-105 transition-transform"
                                >
                                  View Full Size
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                     </div>
                  </div>

                  <div className="flex flex-col items-end gap-3 shrink-0">
                    <p className="text-[10px] text-slate-600 font-mono uppercase tracking-widest">{new Date(req.timestamp).toLocaleString()}</p>
                    {req.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => onUpdateDepositStatus(req.id, 'completed')}
                          className="bg-emerald-500 text-emerald-950 px-6 py-2.5 rounded-xl text-[10px] font-black hover:scale-105 transition-all shadow-xl shadow-emerald-500/10 uppercase tracking-widest glass-button"
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => onUpdateDepositStatus(req.id, 'rejected')}
                          className="bg-rose-500 text-rose-950 px-6 py-2.5 rounded-xl text-[10px] font-black hover:scale-105 transition-all shadow-xl shadow-rose-500/10 uppercase tracking-widest glass-button"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${req.status === 'completed' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500/60' : 'bg-rose-500/5 border-rose-500/20 text-rose-500/60'}`}>
                        {req.status}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-3 space-y-8">
          {/* 4. Remaining Stats (Controls & Players) */}
          <div className="glass-card p-10 rounded-[2.5rem]">
            <h4 className="text-xl font-display font-bold mb-8 flex items-center gap-3">
              <Settings className="w-5 h-5 text-purple-400" />
              Game Control Mode
            </h4>
            <div className="flex p-1.5 bg-white/5 rounded-2xl border border-white/5">
              <button 
                onClick={() => state.manualMode && onToggleManualMode()}
                className={`flex-1 py-4 rounded-xl font-black transition-all uppercase tracking-[0.2em] text-[10px] ${!state.manualMode ? 'bg-emerald-500 text-emerald-950 shadow-2xl shadow-emerald-500/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Auto (Algorithm)
              </button>
              <button 
                onClick={() => !state.manualMode && onToggleManualMode()}
                className={`flex-1 py-4 rounded-xl font-black transition-all uppercase tracking-[0.2em] text-[10px] ${state.manualMode ? 'bg-rose-500 text-rose-950 shadow-2xl shadow-rose-500/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Manual (God Mode)
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-500 italic text-center">
              {state.manualMode 
                ? "In Manual mode, every bet stays 'Pending' until you click Win or Lose below." 
                : "In Auto mode, the algorithm (and overrides) decide results instantly."}
            </p>
          </div>

          <div className="bg-[#0d0d0d] border border-white/5 p-8 rounded-3xl">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-xl font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                Winning Algorithm (Base Rate)
              </h4>
              <button 
                onClick={onToggleWinRateLock}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  state.isWinRateLocked 
                    ? 'bg-rose-500/20 text-rose-500 border border-rose-500/20 hover:bg-rose-500/30' 
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/30'
                }`}
              >
                {state.isWinRateLocked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                {state.isWinRateLocked ? 'Locked' : 'Unlocked'}
              </button>
            </div>
            <div className={`space-y-6 transition-all duration-300 ${state.isWinRateLocked ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
               <div className="flex justify-between items-center">
                 <span className="text-slate-400 font-medium">Target Win Probability</span>
                 <span className="font-mono text-2xl font-bold text-emerald-400">{((state.winRate ?? 0) * 100).toFixed(0)}%</span>
               </div>
               <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01"
                disabled={state.isWinRateLocked}
                value={state.winRate ?? 0} 
                onChange={(e) => onUpdateWinRate(Number(e.target.value))}
                className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
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
                 <span className="font-mono text-2xl font-bold text-amber-500">₹{state.maxBet}</span>
               </div>
               <input 
                type="range" 
                min="10" 
                max="5000" 
                step="10"
                value={state.maxBet ?? 0} 
                onChange={(e) => onUpdateMaxBet(Number(e.target.value))}
                className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <p className="text-[10px] text-slate-600 font-medium italic">
                Restricts the maximum amount any player can wager at once.
              </p>
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
                   <span className="font-mono text-xl font-bold text-white">₹{state.minDeposit}</span>
                 </div>
                 <div className="flex gap-2">
                   {[100, 200, 500, 1000].map(val => (
                     <button
                       key={val}
                       disabled={state.isTransferLimitsLocked}
                       onClick={() => onUpdateMinLimits(val, state.minWithdraw ?? 500)}
                       className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition-all ${state.minDeposit === val ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'} disabled:opacity-40 disabled:cursor-not-allowed`}
                     >
                       ₹{val}
                     </button>
                   ))}
                 </div>
                 <input 
                  type="range" 
                  min="10" 
                  max="2000" 
                  step="10"
                  disabled={state.isTransferLimitsLocked}
                  value={state.minDeposit ?? 100} 
                  onChange={(e) => onUpdateMinLimits(Number(e.target.value), state.minWithdraw ?? 500)}
                  className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-40"
                />
               </div>

               <div className="space-y-6">
                 <div className="flex justify-between items-center">
                   <span className="text-slate-400 text-sm italic">Min Withdrawal</span>
                   <span className="font-mono text-xl font-bold text-white">₹{state.minWithdraw}</span>
                 </div>
                 <div className="flex gap-2">
                   {[300, 500, 1000, 2000].map(val => (
                     <button
                       key={val}
                       disabled={state.isTransferLimitsLocked}
                       onClick={() => onUpdateMinLimits(state.minDeposit ?? 100, val)}
                       className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition-all ${state.minWithdraw === val ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'} disabled:opacity-40 disabled:cursor-not-allowed`}
                     >
                       ₹{val}
                     </button>
                   ))}
                 </div>
                 <input 
                  type="range" 
                  min="10" 
                  max="5000" 
                  step="10"
                  disabled={state.isTransferLimitsLocked}
                  value={state.minWithdraw ?? 500} 
                  onChange={(e) => onUpdateMinLimits(state.minDeposit ?? 100, Number(e.target.value))}
                  className="w-full h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-40"
                />
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
                 <span className="font-mono text-2xl font-bold text-emerald-400">₹{state.referralAmount ?? 10}</span>
               </div>
               <div className="flex gap-2">
                 {[10, 20, 50, 100].map(val => (
                   <button
                     key={val}
                     onClick={() => onUpdateReferralAmount(val)}
                     className={`flex-1 py-2 rounded-lg text-[10px] font-bold border transition-all ${state.referralAmount === val ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'}`}
                   >
                     ₹{val}
                   </button>
                 ))}
               </div>
               <input 
                type="range" 
                min="5" 
                max="500" 
                step="5"
                value={state.referralAmount ?? 10} 
                onChange={(e) => onUpdateReferralAmount(Number(e.target.value))}
                className="w-full h-2 bg-white/5 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <p className="text-[10px] text-slate-600 font-medium italic">
                Adjusts the amount of cash credit given to both the referrer and the newly referred player upon registration.
              </p>
            </div>
          </div>

          <div className="bg-[#0f0f0f] border border-white/5 p-10 rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] mb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-emerald-500/10 rounded-[1.5rem] border border-emerald-500/20">
                  <QrCode className="w-8 h-8 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-3xl font-display font-bold text-white tracking-tight">Configuration Hub</h4>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Manage Payment Gateways & Deposit Settings</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={onTogglePaymentLock}
                  className={`px-6 py-4 rounded-2xl border transition-all flex items-center justify-center gap-3 group ${state.isPaymentLocked ? 'bg-amber-500 text-black border-amber-500 shadow-xl shadow-amber-500/20' : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'}`}
                >
                  {state.isPaymentLocked ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {state.isPaymentLocked ? 'Locked' : 'Unlocked'}
                  </span>
                </button>
                <button 
                  onClick={handleSavePayment}
                  className="bg-emerald-500 text-black px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-emerald-500/30"
                >
                  Sync Settings
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-8">
                <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-4 px-1">Primary UPI ID</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={paymentEdit.upiId || ''}
                      onChange={(e) => setPaymentEdit(prev => ({ ...prev, upiId: e.target.value }))}
                      placeholder="e.g. aleem@okhdfc"
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 focus:outline-none focus:border-emerald-500 text-emerald-100 font-mono text-lg shadow-inner"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Zap className="w-5 h-5 text-emerald-500/30" />
                    </div>
                  </div>
                </div>
                
                <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-4 px-1">Deposit Flow Note</label>
                  <textarea 
                    value={paymentEdit.additionalInstructions || ''}
                    onChange={(e) => setPaymentEdit(prev => ({ ...prev, additionalInstructions: e.target.value }))}
                    placeholder="e.g. Minimum deposit ₹500, send screenshot to support..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 focus:outline-none focus:border-emerald-500 text-slate-300 text-sm min-h-[140px] resize-none shadow-inner leading-relaxed"
                  />
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white/[0.02] border border-white/5 p-6 rounded-[2.5rem]">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-4 px-1 text-center">Master QR Gateway</label>
                  <div className="relative group aspect-square rounded-[2rem] border-2 border-dashed border-white/10 bg-black/40 flex items-center justify-center overflow-hidden transition-all hover:border-emerald-500/20 active:scale-[0.99]">
                    {paymentEdit.qrCodeUrl ? (
                      <>
                        <img src={paymentEdit.qrCodeUrl} alt="QR Code" className="w-full h-full object-contain p-8" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                          <div className="p-3 bg-white/10 rounded-full backdrop-blur-md">
                            <ImageIcon className="w-8 h-8 text-white" />
                          </div>
                          <span className="text-[10px] font-black uppercase text-white tracking-widest">Update Photo</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-4 text-slate-500 group-hover:text-slate-300 transition-colors">
                        <div className="p-5 bg-white/5 rounded-full">
                          <ImageIcon className="w-12 h-12 opacity-20" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Click to Upload QR</span>
                      </div>
                    )}
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleQrUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                  <div className="mt-6 flex flex-col items-center gap-3">
                    <p className="text-[10px] text-slate-500 italic max-w-[200px] text-center leading-relaxed">This QR will be the primary visual target for player deposits.</p>
                    {paymentEdit.qrCodeUrl && (
                      <button 
                        onClick={() => setPaymentEdit(prev => ({ ...prev, qrCodeUrl: undefined }))}
                        className="text-[9px] font-black text-rose-500 uppercase hover:text-rose-400 transition-colors flex items-center gap-2 group"
                      >
                        <Trash2 className="w-3 h-3 transition-transform group-hover:rotate-12" />
                        Purge Image
                      </button>
                    )}
                  </div>
                </div>
              </div>
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
                          <div className="flex items-center gap-3">
                            <h5 className="font-display font-bold text-lg">{player.name}</h5>
                            {state.currentPlayerId === player.id && (
                              <span className="bg-emerald-500/10 text-emerald-400 text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest border border-emerald-500/20">Active Player</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">Balance: ₹{(player.balance ?? 0).toFixed(2)} | Code: {player.referralCode} | Refs: {player.referralCount}</p>
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
    </div>
  );
}
