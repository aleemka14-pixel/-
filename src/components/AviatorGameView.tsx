import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plane, 
  Sparkles, 
  TrendingUp, 
  ShieldCheck, 
  History, 
  Users, 
  DollarSign, 
  Zap, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Volume2, 
  VolumeX, 
  ArrowUpRight,
  Flame,
  RotateCcw
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Player, AppState } from '../types';
import { formatCurrencyValue, getCurrencySymbol } from '../lib/currency';

interface AviatorGameViewProps {
  state: AppState;
  currentPlayer: Player;
  playSound: (key: string, winAmount?: number) => void;
  demoMode?: boolean;
  preferredCurrency?: string;
  rates?: Record<string, number>;
  onBalanceUpdate?: (newBalance: number) => void;
}

interface BetPanelState {
  amount: number;
  autoCashoutEnabled: boolean;
  autoCashoutTarget: number;
  autoBetEnabled: boolean;
  placedForCurrentRound: boolean;
  placedForNextRound: boolean;
  cashedOut: boolean;
  cashoutMultiplier: number | null;
  cashoutPayout: number | null;
  betId: string | null;
}

interface LiveBetItem {
  id: string;
  username: string;
  amount: number;
  cashedOut: boolean;
  cashoutMultiplier?: number;
  payout?: number;
  avatar: string;
}

export const AviatorGameView: React.FC<AviatorGameViewProps> = memo(function AviatorGameView({
  state,
  currentPlayer,
  playSound,
  demoMode = false,
  preferredCurrency = 'INR',
  rates = {},
  onBalanceUpdate
}) {
  // Game state
  const [gameStatus, setGameStatus] = useState<'WAITING' | 'FLYING' | 'CRASHED'>('WAITING');
  const [currentMultiplier, setCurrentMultiplier] = useState<number>(1.00);
  const [crashPoint, setCrashPoint] = useState<number>(2.50);
  const [countdown, setCountdown] = useState<number>(5.0);
  const [roundId, setRoundId] = useState<string>(`round_${Date.now()}`);
  const [recentMultipliers, setRecentMultipliers] = useState<number[]>([
    1.45, 2.10, 1.12, 5.40, 1.95, 12.80, 1.02, 3.15, 8.42, 1.75, 24.50, 1.30
  ]);
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'top'>('all');

  // Dual Bet Panels state
  const [panel1, setPanel1] = useState<BetPanelState>({
    amount: 100,
    autoCashoutEnabled: false,
    autoCashoutTarget: 2.00,
    autoBetEnabled: false,
    placedForCurrentRound: false,
    placedForNextRound: false,
    cashedOut: false,
    cashoutMultiplier: null,
    cashoutPayout: null,
    betId: null
  });

  const [panel2, setPanel2] = useState<BetPanelState>({
    amount: 500,
    autoCashoutEnabled: true,
    autoCashoutTarget: 1.50,
    autoBetEnabled: false,
    placedForCurrentRound: false,
    placedForNextRound: false,
    cashedOut: false,
    cashoutMultiplier: null,
    cashoutPayout: null,
    betId: null
  });

  // Simulated live online bets feed
  const [liveBets, setLiveBets] = useState<LiveBetItem[]>([]);
  const [myBetHistory, setMyBetHistory] = useState<Array<{
    roundId: string;
    amount: number;
    multiplier: number | null;
    payout: number;
    status: 'WON' | 'LOST' | 'CANCELLED';
    timestamp: number;
  }>>([]);

  // Canvas ref for flight animation
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Currency helpers
  const symbol = getCurrencySymbol(preferredCurrency);
  const formatAmt = (val: number) => {
    return `${symbol}${val.toLocaleString()}`;
  };

  // Helper: Generate provably fair crash multiplier
  const generateServerCrashPoint = useCallback(() => {
    const rand = Math.random();
    if (rand < 0.04) {
      // 4% instant crash
      return parseFloat((1.00 + Math.random() * 0.05).toFixed(2));
    }
    const raw = 0.98 / (1 - Math.random());
    const capped = Math.min(250.0, Math.max(1.01, raw));
    return parseFloat(capped.toFixed(2));
  }, []);

  // Initialize live simulated bets when round starts
  const generateLiveBets = useCallback((amountMultiplier: number) => {
    const mockNames = [
      'CryptoKing', 'MatrixAce', 'NeonPilot', 'Viper777', 'AeroMaster', 
      'SkyHigh', 'RedBullet', 'LunaTrader', 'TitanWinner', 'ZenithX',
      'Phoenix99', 'JetStream', 'FalconRider', 'HyperDrive', 'ApexFlyer'
    ];
    const items: LiveBetItem[] = [];
    const count = 15 + Math.floor(Math.random() * 10);
    for (let i = 0; i < count; i++) {
      const name = mockNames[i % mockNames.length];
      const amt = Math.floor((50 + Math.random() * 2000) / 10) * 10;
      items.push({
        id: `live_${i}_${Date.now()}`,
        username: `${name}_${Math.floor(Math.random() * 90 + 10)}`,
        amount: amt,
        cashedOut: false,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${name}`
      });
    }
    setLiveBets(items);
  }, []);

  // Reset panels for next round
  const prepareNextRound = useCallback(() => {
    const nextRound = `round_${Date.now()}`;
    setRoundId(nextRound);
    setGameStatus('WAITING');
    setCountdown(5.0);
    setCurrentMultiplier(1.00);

    const targetCrash = generateServerCrashPoint();
    setCrashPoint(targetCrash);

    // Apply auto bets
    setPanel1(prev => ({
      ...prev,
      placedForCurrentRound: prev.autoBetEnabled || prev.placedForNextRound,
      placedForNextRound: false,
      cashedOut: false,
      cashoutMultiplier: null,
      cashoutPayout: null,
      betId: prev.autoBetEnabled || prev.placedForNextRound ? `bet1_${Date.now()}` : null
    }));

    setPanel2(prev => ({
      ...prev,
      placedForCurrentRound: prev.autoBetEnabled || prev.placedForNextRound,
      placedForNextRound: false,
      cashedOut: false,
      cashoutMultiplier: null,
      cashoutPayout: null,
      betId: prev.autoBetEnabled || prev.placedForNextRound ? `bet2_${Date.now()}` : null
    }));

    generateLiveBets(1);
  }, [generateServerCrashPoint, generateLiveBets]);

  // Handle Game Loop (Waiting -> Flying -> Crashed -> Waiting)
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (gameStatus === 'WAITING') {
      if (countdown > 0) {
        timer = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 0.1) {
              clearInterval(timer);
              setGameStatus('FLYING');
              startTimeRef.current = performance.now();
              return 0;
            }
            return parseFloat((prev - 0.1).toFixed(1));
          });
        }, 100);
      }
    }

    return () => clearInterval(timer);
  }, [gameStatus, countdown]);

  // Main Flight Loop (60 FPS)
  useEffect(() => {
    if (gameStatus !== 'FLYING') return;

    let localMultiplier = 1.00;
    const speedFactor = 0.0008; // Curve speed rate

    const updateFrame = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsedMs = timestamp - startTimeRef.current;

      // Exponential growth multiplier curve: e^(speed * t)
      localMultiplier = parseFloat(Math.exp(elapsedMs * speedFactor).toFixed(2));

      if (localMultiplier >= crashPoint) {
        // CRASHED!
        setCurrentMultiplier(crashPoint);
        setGameStatus('CRASHED');
        if (!soundMuted) playSound('WIN', 0);

        // Add to history
        setRecentMultipliers(prev => [crashPoint, ...prev.slice(0, 14)]);

        // Process lost bets
        setPanel1(p => {
          if (p.placedForCurrentRound && !p.cashedOut) {
            setMyBetHistory(h => [{
              roundId,
              amount: p.amount,
              multiplier: null,
              payout: 0,
              status: 'LOST',
              timestamp: Date.now()
            }, ...h]);
          }
          return { ...p, placedForCurrentRound: false };
        });

        setPanel2(p => {
          if (p.placedForCurrentRound && !p.cashedOut) {
            setMyBetHistory(h => [{
              roundId,
              amount: p.amount,
              multiplier: null,
              payout: 0,
              status: 'LOST',
              timestamp: Date.now()
            }, ...h]);
          }
          return { ...p, placedForCurrentRound: false };
        });

        // Prepare next round after 3s
        setTimeout(() => {
          prepareNextRound();
        }, 3000);

        return;
      }

      setCurrentMultiplier(localMultiplier);

      // Check Auto Cashouts
      setPanel1(p => {
        if (p.placedForCurrentRound && !p.cashedOut && p.autoCashoutEnabled && localMultiplier >= p.autoCashoutTarget) {
          const payout = parseFloat((p.amount * p.autoCashoutTarget).toFixed(2));
          if (!soundMuted) playSound('WIN', payout);
          confetti({ particleCount: 35, spread: 60, origin: { y: 0.6 } });
          
          setMyBetHistory(h => [{
            roundId,
            amount: p.amount,
            multiplier: p.autoCashoutTarget,
            payout,
            status: 'WON',
            timestamp: Date.now()
          }, ...h]);

          if (onBalanceUpdate && currentPlayer) {
            onBalanceUpdate((currentPlayer.balance || 0) + payout);
          }

          return {
            ...p,
            cashedOut: true,
            cashoutMultiplier: p.autoCashoutTarget,
            cashoutPayout: payout
          };
        }
        return p;
      });

      setPanel2(p => {
        if (p.placedForCurrentRound && !p.cashedOut && p.autoCashoutEnabled && localMultiplier >= p.autoCashoutTarget) {
          const payout = parseFloat((p.amount * p.autoCashoutTarget).toFixed(2));
          if (!soundMuted) playSound('WIN', payout);
          confetti({ particleCount: 35, spread: 60, origin: { y: 0.6 } });

          setMyBetHistory(h => [{
            roundId,
            amount: p.amount,
            multiplier: p.autoCashoutTarget,
            payout,
            status: 'WON',
            timestamp: Date.now()
          }, ...h]);

          if (onBalanceUpdate && currentPlayer) {
            onBalanceUpdate((currentPlayer.balance || 0) + payout);
          }

          return {
            ...p,
            cashedOut: true,
            cashoutMultiplier: p.autoCashoutTarget,
            cashoutPayout: payout
          };
        }
        return p;
      });

      // Update simulated live bets
      setLiveBets(prev => prev.map(b => {
        if (!b.cashedOut && Math.random() < 0.05 && localMultiplier > 1.2) {
          const targetMult = parseFloat(localMultiplier.toFixed(2));
          return {
            ...b,
            cashedOut: true,
            cashoutMultiplier: targetMult,
            payout: Math.floor(b.amount * targetMult)
          };
        }
        return b;
      }));

      animationFrameRef.current = requestAnimationFrame(updateFrame);
    };

    animationFrameRef.current = requestAnimationFrame(updateFrame);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [gameStatus, crashPoint, soundMuted, playSound, roundId, currentPlayer, onBalanceUpdate, prepareNextRound]);

  // Canvas Flight Path & Particles Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let particles: Array<{ x: number; y: number; size: number; speed: number; alpha: number }> = [];

    // Initialize background stars
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 1,
        speed: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.8 + 0.2
      });
    }

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Draw Grid Lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      const stepX = 50;
      const stepY = 40;
      for (let x = 0; x < width; x += stepX) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += stepY) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw moving starfield particles
      ctx.fillStyle = '#ffffff';
      particles.forEach(p => {
        if (gameStatus === 'FLYING') {
          p.x -= p.speed * (currentMultiplier * 0.8);
          p.y += p.speed * 0.3;
          if (p.x < 0) p.x = width;
          if (p.y > height) p.y = 0;
        }
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Draw Flight Curve
      const startX = 40;
      const startY = height - 50;

      if (gameStatus === 'FLYING' || gameStatus === 'CRASHED') {
        const progress = Math.min(1.0, (currentMultiplier - 1.0) / 10.0);
        const currentX = startX + (width - 120) * Math.min(0.85, progress + 0.1);
        const currentY = startY - (height - 120) * Math.sin((progress * Math.PI) / 2.2);

        // Control point for smooth parabolic curve
        const controlX = startX + (currentX - startX) * 0.4;
        const controlY = startY;

        // Gradient filled area under curve
        const fillGradient = ctx.createLinearGradient(0, startY, 0, currentY);
        fillGradient.addColorStop(0, 'rgba(239, 68, 68, 0.25)'); // Red glow
        fillGradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(controlX, controlY, currentX, currentY);
        ctx.lineTo(currentX, startY);
        ctx.closePath();
        ctx.fillStyle = fillGradient;
        ctx.fill();

        // Main curve line
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(controlX, controlY, currentX, currentY);
        ctx.strokeStyle = gameStatus === 'CRASHED' ? '#ef4444' : '#f43f5e';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset shadow

        // Render Animated Airplane or Explosion
        if (gameStatus === 'FLYING') {
          // Draw Glowing Jet Propeller & Flame
          ctx.save();
          ctx.translate(currentX, currentY);
          const angle = -Math.atan2(startY - currentY, currentX - startX) * 0.4;
          ctx.rotate(angle);

          // Jet engine trail
          const trailGradient = ctx.createLinearGradient(-35, 0, 0, 0);
          trailGradient.addColorStop(0, 'rgba(244, 63, 94, 0)');
          trailGradient.addColorStop(1, 'rgba(251, 146, 60, 0.9)');
          ctx.fillStyle = trailGradient;
          ctx.beginPath();
          ctx.moveTo(-35, -3);
          ctx.lineTo(0, 0);
          ctx.lineTo(-35, 3);
          ctx.closePath();
          ctx.fill();

          // Airplane Body Symbol (Red Jet Icon)
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          ctx.moveTo(15, 0);
          ctx.lineTo(-12, -10);
          ctx.lineTo(-6, -2);
          ctx.lineTo(-18, -2);
          ctx.lineTo(-20, 0);
          ctx.lineTo(-18, 2);
          ctx.lineTo(-6, 2);
          ctx.lineTo(-12, 10);
          ctx.closePath();
          ctx.fill();

          // Cockpit detail
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(3, -2, 2.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        } else if (gameStatus === 'CRASHED') {
          // Draw Crash Shockwave Explosion
          ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
          ctx.beginPath();
          ctx.arc(currentX, currentY, 20 + Math.random() * 8, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#fca5a5';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(currentX, currentY, 32, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animId);
  }, [gameStatus, currentMultiplier]);

  // Handle Resize for Canvas
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas && canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Action: Place or Cashout Bet for Panel 1
  const handlePanel1Action = async () => {
    playSound('CLICK');
    if (gameStatus === 'WAITING') {
      if (panel1.placedForCurrentRound) {
        // Cancel bet
        setPanel1(p => ({ ...p, placedForCurrentRound: false, betId: null }));
      } else {
        // Place bet
        if (panel1.amount > (currentPlayer?.balance || 0) && !demoMode) {
          alert("Insufficient balance to place bet.");
          return;
        }
        setPanel1(p => ({
          ...p,
          placedForCurrentRound: true,
          betId: `bet1_${Date.now()}`
        }));
        if (onBalanceUpdate && currentPlayer && !demoMode) {
          onBalanceUpdate((currentPlayer.balance || 0) - panel1.amount);
        }
      }
    } else if (gameStatus === 'FLYING') {
      if (panel1.placedForCurrentRound && !panel1.cashedOut) {
        // Cashout
        const payout = parseFloat((panel1.amount * currentMultiplier).toFixed(2));
        setPanel1(p => ({
          ...p,
          cashedOut: true,
          cashoutMultiplier: currentMultiplier,
          cashoutPayout: payout
        }));

        playSound('WIN', payout);
        confetti({ particleCount: 45, spread: 70, origin: { y: 0.6 } });

        setMyBetHistory(h => [{
          roundId,
          amount: panel1.amount,
          multiplier: currentMultiplier,
          payout,
          status: 'WON',
          timestamp: Date.now()
        }, ...h]);

        if (onBalanceUpdate && currentPlayer) {
          onBalanceUpdate((currentPlayer.balance || 0) + payout);
        }
      } else {
        // Queue for next round
        setPanel1(p => ({ ...p, placedForNextRound: !p.placedForNextRound }));
      }
    }
  };

  // Action: Place or Cashout Bet for Panel 2
  const handlePanel2Action = async () => {
    playSound('CLICK');
    if (gameStatus === 'WAITING') {
      if (panel2.placedForCurrentRound) {
        setPanel2(p => ({ ...p, placedForCurrentRound: false, betId: null }));
      } else {
        if (panel2.amount > (currentPlayer?.balance || 0) && !demoMode) {
          alert("Insufficient balance to place bet.");
          return;
        }
        setPanel2(p => ({
          ...p,
          placedForCurrentRound: true,
          betId: `bet2_${Date.now()}`
        }));
        if (onBalanceUpdate && currentPlayer && !demoMode) {
          onBalanceUpdate((currentPlayer.balance || 0) - panel2.amount);
        }
      }
    } else if (gameStatus === 'FLYING') {
      if (panel2.placedForCurrentRound && !panel2.cashedOut) {
        const payout = parseFloat((panel2.amount * currentMultiplier).toFixed(2));
        setPanel2(p => ({
          ...p,
          cashedOut: true,
          cashoutMultiplier: currentMultiplier,
          cashoutPayout: payout
        }));

        playSound('WIN', payout);
        confetti({ particleCount: 45, spread: 70, origin: { y: 0.6 } });

        setMyBetHistory(h => [{
          roundId,
          amount: panel2.amount,
          multiplier: currentMultiplier,
          payout,
          status: 'WON',
          timestamp: Date.now()
        }, ...h]);

        if (onBalanceUpdate && currentPlayer) {
          onBalanceUpdate((currentPlayer.balance || 0) + payout);
        }
      } else {
        setPanel2(p => ({ ...p, placedForNextRound: !p.placedForNextRound }));
      }
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-80px)] bg-slate-950 text-white flex flex-col font-sans rounded-3xl overflow-hidden border border-slate-800/80 shadow-2xl relative">
      
      {/* Top Multipliers History Pill Bar */}
      <div className="bg-slate-900/90 backdrop-blur-md px-4 py-2.5 border-b border-slate-800 flex items-center justify-between gap-3 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 flex-shrink-0">
          <History className="w-4 h-4 text-slate-400" />
          <span className="text-[11px] font-mono font-bold uppercase text-slate-400 tracking-wider">History:</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {recentMultipliers.map((m, idx) => {
            let badgeStyle = 'bg-slate-800/80 text-slate-300 border-slate-700/50';
            if (m < 1.5) badgeStyle = 'bg-rose-500/10 text-rose-400 border-rose-500/30';
            else if (m < 2.0) badgeStyle = 'bg-sky-500/10 text-sky-400 border-sky-500/30';
            else if (m < 10.0) badgeStyle = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-bold';
            else badgeStyle = 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-black shadow-lg shadow-amber-500/10';

            return (
              <motion.span
                key={idx}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={`px-2.5 py-1 rounded-full text-xs font-mono border flex items-center gap-1 whitespace-nowrap ${badgeStyle}`}
              >
                {m >= 10.0 && <Sparkles className="w-3 h-3 text-amber-400 animate-spin" />}
                {m.toFixed(2)}x
              </motion.span>
            );
          })}
        </div>
        <button 
          onClick={() => setSoundMuted(!soundMuted)}
          className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 transition-colors flex-shrink-0 cursor-pointer"
          title={soundMuted ? "Unmute Sound" : "Mute Sound"}
        >
          {soundMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
        </button>
      </div>

      {/* Main Game Layout: Flight Stage (Left/Top) + Dual Controls (Bottom) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 lg:p-6 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        
        {/* Left Side: Canvas Flight Display Stage */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="relative w-full h-[360px] sm:h-[440px] bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl flex flex-col justify-center items-center">
            
            {/* HTML5 Canvas Flight Engine */}
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />

            {/* Top Overlay Badge */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-slate-950/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-mono font-bold tracking-wider">LIVE ROUND #{roundId.slice(-6)}</span>
            </div>

            {/* Center Multiplier Display */}
            <div className="relative z-20 flex flex-col items-center justify-center text-center px-4">
              {gameStatus === 'WAITING' && (
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center gap-3"
                >
                  <div className="w-16 h-16 rounded-full border-4 border-amber-500/40 border-t-amber-400 animate-spin flex items-center justify-center">
                    <Plane className="w-8 h-8 text-amber-400 -rotate-45" />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-black font-display tracking-tight text-white uppercase">
                    NEXT ROUND IN
                  </h3>
                  <span className="text-4xl sm:text-5xl font-mono font-black text-amber-400 tracking-widest drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]">
                    {countdown.toFixed(1)}s
                  </span>
                  <div className="w-48 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div 
                      className="h-full bg-amber-400 transition-all duration-100 ease-linear"
                      style={{ width: `${(countdown / 5.0) * 100}%` }}
                    />
                  </div>
                </motion.div>
              )}

              {gameStatus === 'FLYING' && (
                <motion.div 
                  key="flying"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: [1, 1.03, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="flex flex-col items-center"
                >
                  <span className="text-6xl sm:text-8xl font-mono font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 drop-shadow-[0_0_35px_rgba(16,185,129,0.6)]">
                    {currentMultiplier.toFixed(2)}x
                  </span>
                  <span className="text-xs font-mono font-bold uppercase tracking-widest text-emerald-400/80 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 mt-2">
                    PLANE IS FLYING HIGH...
                  </span>
                </motion.div>
              )}

              {gameStatus === 'CRASHED' && (
                <motion.div 
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center gap-2"
                >
                  <span className="text-3xl sm:text-5xl font-black font-display text-rose-500 tracking-tight uppercase drop-shadow-[0_0_25px_rgba(244,63,94,0.8)]">
                    FLEW AWAY!
                  </span>
                  <span className="text-5xl sm:text-7xl font-mono font-black text-white tracking-tight drop-shadow-md">
                    @{currentMultiplier.toFixed(2)}x
                  </span>
                </motion.div>
              )}
            </div>
          </div>

          {/* Dual Interactive Bet Panel Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* BET PANEL 1 */}
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 flex flex-col justify-between gap-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-xs font-mono font-bold uppercase text-slate-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> Bet Panel #1
                </span>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-mono text-slate-400 flex items-center gap-1 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={panel1.autoCashoutEnabled}
                      onChange={(e) => setPanel1(p => ({ ...p, autoCashoutEnabled: e.target.checked }))}
                      className="accent-emerald-500 rounded cursor-pointer"
                    />
                    Auto Cashout
                  </label>
                  {panel1.autoCashoutEnabled && (
                    <input 
                      type="number"
                      step="0.1"
                      min="1.01"
                      max="100"
                      value={panel1.autoCashoutTarget}
                      onChange={(e) => setPanel1(p => ({ ...p, autoCashoutTarget: parseFloat(e.target.value) || 1.5 }))}
                      className="w-16 bg-slate-950 text-emerald-400 border border-slate-700 text-xs rounded px-1.5 py-0.5 text-center font-mono font-bold"
                    />
                  )}
                </div>
              </div>

              {/* Amount Input & Presets */}
              <div className="space-y-2">
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                  <span className="text-slate-400 font-mono text-xs mr-2">{symbol}</span>
                  <input 
                    type="number"
                    min="10"
                    step="10"
                    value={panel1.amount}
                    onChange={(e) => setPanel1(p => ({ ...p, amount: Math.max(10, parseInt(e.target.value) || 0) }))}
                    className="w-full bg-transparent text-white font-mono font-bold text-lg outline-none"
                    disabled={gameStatus === 'FLYING' && panel1.placedForCurrentRound}
                  />
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[100, 500, 1000, 2000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setPanel1(p => ({ ...p, amount: amt }))}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-semibold py-1.5 rounded-lg border border-slate-700/50 transition-colors cursor-pointer"
                    >
                      +{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Action Button 1 */}
              <button
                onClick={handlePanel1Action}
                className={`w-full py-3.5 px-4 rounded-xl font-mono font-black text-sm uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-lg flex items-center justify-center gap-2 ${
                  gameStatus === 'WAITING'
                    ? panel1.placedForCurrentRound
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-black hover:scale-[1.02] shadow-emerald-500/20'
                    : gameStatus === 'FLYING'
                      ? panel1.placedForCurrentRound && !panel1.cashedOut
                        ? 'bg-gradient-to-r from-amber-400 to-emerald-400 text-slate-950 animate-pulse hover:scale-[1.02] shadow-amber-500/30'
                        : panel1.placedForNextRound
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                {gameStatus === 'WAITING' ? (
                  panel1.placedForCurrentRound ? 'CANCEL BET' : `BET (${formatAmt(panel1.amount)})`
                ) : gameStatus === 'FLYING' ? (
                  panel1.placedForCurrentRound && !panel1.cashedOut ? (
                    <>CASH OUT ({formatAmt(panel1.amount * currentMultiplier)})</>
                  ) : panel1.placedForNextRound ? (
                    'CANCEL NEXT BET'
                  ) : (
                    'BET FOR NEXT ROUND'
                  )
                ) : (
                  'WAITING NEXT ROUND...'
                )}
              </button>
            </div>

            {/* BET PANEL 2 */}
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 flex flex-col justify-between gap-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-xs font-mono font-bold uppercase text-slate-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-teal-400" /> Bet Panel #2
                </span>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-mono text-slate-400 flex items-center gap-1 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={panel2.autoCashoutEnabled}
                      onChange={(e) => setPanel2(p => ({ ...p, autoCashoutEnabled: e.target.checked }))}
                      className="accent-teal-500 rounded cursor-pointer"
                    />
                    Auto Cashout
                  </label>
                  {panel2.autoCashoutEnabled && (
                    <input 
                      type="number"
                      step="0.1"
                      min="1.01"
                      max="100"
                      value={panel2.autoCashoutTarget}
                      onChange={(e) => setPanel2(p => ({ ...p, autoCashoutTarget: parseFloat(e.target.value) || 2.0 }))}
                      className="w-16 bg-slate-950 text-teal-400 border border-slate-700 text-xs rounded px-1.5 py-0.5 text-center font-mono font-bold"
                    />
                  )}
                </div>
              </div>

              {/* Amount Input & Presets */}
              <div className="space-y-2">
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                  <span className="text-slate-400 font-mono text-xs mr-2">{symbol}</span>
                  <input 
                    type="number"
                    min="10"
                    step="10"
                    value={panel2.amount}
                    onChange={(e) => setPanel2(p => ({ ...p, amount: Math.max(10, parseInt(e.target.value) || 0) }))}
                    className="w-full bg-transparent text-white font-mono font-bold text-lg outline-none"
                    disabled={gameStatus === 'FLYING' && panel2.placedForCurrentRound}
                  />
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[100, 500, 1000, 2000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setPanel2(p => ({ ...p, amount: amt }))}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-semibold py-1.5 rounded-lg border border-slate-700/50 transition-colors cursor-pointer"
                    >
                      +{amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Action Button 2 */}
              <button
                onClick={handlePanel2Action}
                className={`w-full py-3.5 px-4 rounded-xl font-mono font-black text-sm uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-lg flex items-center justify-center gap-2 ${
                  gameStatus === 'WAITING'
                    ? panel2.placedForCurrentRound
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30'
                      : 'bg-gradient-to-r from-teal-500 to-cyan-500 text-black hover:scale-[1.02] shadow-teal-500/20'
                    : gameStatus === 'FLYING'
                      ? panel2.placedForCurrentRound && !panel2.cashedOut
                        ? 'bg-gradient-to-r from-amber-400 to-teal-400 text-slate-950 animate-pulse hover:scale-[1.02] shadow-amber-500/30'
                        : panel2.placedForNextRound
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                {gameStatus === 'WAITING' ? (
                  panel2.placedForCurrentRound ? 'CANCEL BET' : `BET (${formatAmt(panel2.amount)})`
                ) : gameStatus === 'FLYING' ? (
                  panel2.placedForCurrentRound && !panel2.cashedOut ? (
                    <>CASH OUT ({formatAmt(panel2.amount * currentMultiplier)})</>
                  ) : panel2.placedForNextRound ? (
                    'CANCEL NEXT BET'
                  ) : (
                    'BET FOR NEXT ROUND'
                  )
                ) : (
                  'WAITING NEXT ROUND...'
                )}
              </button>
            </div>

          </div>
        </div>

        {/* Right Side: Live Bets & History Sidebar Drawer */}
        <div className="lg:col-span-4 bg-slate-900/80 rounded-2xl border border-slate-800 p-4 flex flex-col gap-3 h-[500px] lg:h-[650px] shadow-xl">
          
          {/* Navigation Tabs */}
          <div className="grid grid-cols-3 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
            <button
              onClick={() => setActiveTab('all')}
              className={`py-2 rounded-lg font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'all' ? 'bg-slate-800 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" /> All Bets
            </button>
            <button
              onClick={() => setActiveTab('my')}
              className={`py-2 rounded-lg font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'my' ? 'bg-slate-800 text-amber-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" /> My Bets
            </button>
            <button
              onClick={() => setActiveTab('top')}
              className={`py-2 rounded-lg font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                activeTab === 'top' ? 'bg-slate-800 text-cyan-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5" /> Top Wins
            </button>
          </div>

          {/* Feed Header */}
          <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-400 px-2 uppercase tracking-wider border-b border-slate-800 pb-2">
            <span>User / Bet</span>
            <span>Mult / Payout</span>
          </div>

          {/* Content List Feed */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
            {activeTab === 'all' && (
              liveBets.map(bet => (
                <div 
                  key={bet.id}
                  className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-mono transition-all ${
                    bet.cashedOut 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                      : 'bg-slate-950/60 border-slate-800/80 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <img src={bet.avatar} alt="Avatar" className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700" />
                    <div>
                      <p className="font-bold text-slate-200 text-[11px] truncate max-w-[100px]">{bet.username}</p>
                      <p className="text-[10px] text-slate-400">{formatAmt(bet.amount)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {bet.cashedOut ? (
                      <>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                          {bet.cashoutMultiplier?.toFixed(2)}x
                        </span>
                        <p className="text-emerald-400 font-bold mt-0.5">{formatAmt(bet.payout || 0)}</p>
                      </>
                    ) : (
                      <span className="text-[10px] text-slate-500 uppercase tracking-widest">In Flight...</span>
                    )}
                  </div>
                </div>
              ))
            )}

            {activeTab === 'my' && (
              myBetHistory.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs font-mono">
                  No Aviator bets placed yet.
                </div>
              ) : (
                myBetHistory.map((item, idx) => (
                  <div 
                    key={idx}
                    className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-mono ${
                      item.status === 'WON' 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    <div>
                      <p className="font-bold text-slate-200 text-[11px]">Bet: {formatAmt(item.amount)}</p>
                      <p className="text-[10px] text-slate-400">{new Date(item.timestamp).toLocaleTimeString()}</p>
                    </div>
                    <div className="text-right">
                      {item.status === 'WON' ? (
                        <>
                          <span className="text-emerald-400 font-bold">{item.multiplier?.toFixed(2)}x</span>
                          <p className="text-emerald-400 font-bold">{formatAmt(item.payout)}</p>
                        </>
                      ) : (
                        <span className="text-rose-400 font-bold">CRASHED (₹0)</span>
                      )}
                    </div>
                  </div>
                ))
              )
            )}

            {activeTab === 'top' && (
              [
                { name: 'MatrixAce', mult: 124.5, profit: 124500 },
                { name: 'Viper777', mult: 84.2, profit: 42100 },
                { name: 'CryptoKing', mult: 42.0, profit: 21000 },
                { name: 'SkyHigh', mult: 28.4, profit: 14200 },
                { name: 'LunaTrader', mult: 19.8, profit: 9900 }
              ].map((top, idx) => (
                <div key={idx} className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-[10px]">
                      #{idx + 1}
                    </span>
                    <span className="font-bold text-slate-200">{top.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-cyan-400 font-bold">{top.mult}x</span>
                    <p className="text-emerald-400 font-bold">{formatAmt(top.profit)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
});

export default AviatorGameView;
