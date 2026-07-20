import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Trophy, 
  Crown, 
  Award, 
  Flame, 
  Coins, 
  Wallet, 
  Star, 
  User, 
  TrendingUp,
  Zap
} from 'lucide-react';
import { collection, query, getDocs, limit } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { Player } from '../types.ts';
import { 
  getCurrencySymbol, 
  formatCurrencyValue, 
  getCachedRates 
} from '../lib/currency.ts';
import { getVIPLevel } from '../App.tsx';

type RankCriteria = 'totalWinnings' | 'balance' | 'biggestBet' | 'totalBetsCount';

export function LeaderboardView({ preferredCurrency }: { preferredCurrency: string }) {
  const [criteria, setCriteria] = useState<RankCriteria>('totalWinnings');
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load live rates for currency formatting
  const currentRates = useMemo(() => getCachedRates().rates, [preferredCurrency]);

  const formatAmount = (val: number) => {
    return `${getCurrencySymbol(preferredCurrency)}${formatCurrencyValue(val, preferredCurrency, currentRates)}`;
  };

  useEffect(() => {
    let active = true;
    const fetchLeaderboard = async () => {
      setLoading(true);
      setError(null);
      try {
        const playersRef = collection(db, 'players');
        const snap = await getDocs(playersRef);
        
        if (!active) return;

        // Process players in memory to handle default values safely
        // and guarantee no missing index errors from combining orderBy & missing fields
        const allPlayers = snap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name || 'Player',
            email: data.email || '',
            balance: typeof data.balance === 'number' ? data.balance : 0,
            override: data.override || 'none',
            referralCode: data.referralCode || '',
            referralCount: typeof data.referralCount === 'number' ? data.referralCount : 0,
            totalWagered: typeof data.totalWagered === 'number' ? data.totalWagered : 0,
            totalWinnings: typeof data.totalWinnings === 'number' ? data.totalWinnings : 0,
            biggestBet: typeof data.biggestBet === 'number' ? data.biggestBet : 0,
            totalBetsCount: typeof data.totalBetsCount === 'number' ? data.totalBetsCount : 0,
            wins: typeof data.wins === 'number' ? data.wins : 0,
            losses: typeof data.losses === 'number' ? data.losses : 0,
            preferredCurrency: data.preferredCurrency || 'USDT',
          } as Player;
        });

        // Sort based on criteria
        allPlayers.sort((a, b) => {
          const valA = (a as any)[criteria] ?? 0;
          const valB = (b as any)[criteria] ?? 0;
          if (valB !== valA) return valB - valA;
          // secondary sort by balance if equal
          return (b.balance || 0) - (a.balance || 0);
        });

        // Cap at top 100 for display
        setPlayers(allPlayers.slice(0, 100));
      } catch (err: any) {
        console.error('Error fetching leaderboard:', err);
        setError('Failed to load leaderboard data. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchLeaderboard();
    return () => {
      active = false;
    };
  }, [criteria]);

  // Separate top 3 podium from rest
  const topThree = useMemo(() => players.slice(0, 3), [players]);
  const restPlayers = useMemo(() => players.slice(3), [players]);

  // Render podium spot
  const renderPodiumItem = (player: Player, index: number) => {
    // index: 0 is 1st, 1 is 2nd, 2 is 3rd
    const rankColors = [
      {
        bg: 'bg-gradient-to-b from-amber-500/20 via-amber-500/5 to-transparent',
        border: 'border-amber-500/40',
        text: 'text-amber-400',
        badge: 'bg-amber-400 text-black',
        icon: <Crown className="w-8 h-8 text-amber-400 animate-pulse" />,
        shadow: 'shadow-[0_0_25px_rgba(245,158,11,0.15)]',
        rankLabel: '1st Place'
      },
      {
        bg: 'bg-gradient-to-b from-slate-300/20 via-slate-300/5 to-transparent',
        border: 'border-slate-300/30',
        text: 'text-slate-300',
        badge: 'bg-slate-300 text-black',
        icon: <Trophy className="w-7 h-7 text-slate-300" />,
        shadow: 'shadow-[0_0_20px_rgba(203,213,225,0.1)]',
        rankLabel: '2nd Place'
      },
      {
        bg: 'bg-gradient-to-b from-amber-700/30 via-amber-700/5 to-transparent',
        border: 'border-amber-700/40',
        text: 'text-amber-600',
        badge: 'bg-amber-600 text-white',
        icon: <Award className="w-6 h-6 text-amber-600" />,
        shadow: 'shadow-[0_0_15px_rgba(180,83,9,0.08)]',
        rankLabel: '3rd Place'
      }
    ];

    const c = rankColors[index] || rankColors[2];
    const vipLevel = getVIPLevel(player.totalWagered || 0);

    // Dynamic stat display based on criteria
    const getDisplayStat = () => {
      switch (criteria) {
        case 'totalWinnings':
          return { label: 'Winnings', val: formatAmount(player.totalWinnings || 0) };
        case 'balance':
          return { label: 'Balance', val: formatAmount(player.balance || 0) };
        case 'biggestBet':
          return { label: 'Biggest Bet', val: formatAmount(player.biggestBet || 0) };
        case 'totalBetsCount':
          return { label: 'Bets Count', val: `${player.totalBetsCount || 0} plays` };
        default:
          return { label: 'Winnings', val: formatAmount(player.totalWinnings || 0) };
      }
    };

    const stat = getDisplayStat();

    return (
      <motion.div
        key={player.id}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: index * 0.15 }}
        className={`relative rounded-2xl sm:rounded-3xl border ${c.border} ${c.bg} p-4 sm:p-6 flex flex-col items-center text-center ${c.shadow} overflow-hidden group`}
      >
        {/* Shine Overlay effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shine" />

        {/* Rank Badge */}
        <div className="absolute top-4 right-4 flex items-center justify-center">
          {c.icon}
        </div>

        {/* Big initial avatar with premium glow */}
        <div className="relative mt-2 sm:mt-4 mb-3 sm:mb-4">
          <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center text-xl sm:text-2xl font-black font-display bg-[#121212] border-2 ${c.border} text-white shadow-inner relative z-10`}>
            {player.name ? player.name.substring(0, 2).toUpperCase() : 'PL'}
          </div>
          <div className={`absolute -inset-1 rounded-full bg-gradient-to-r from-transparent via-white/10 to-transparent blur-md opacity-70 group-hover:opacity-100 transition-opacity`} />
          <div className={`absolute -bottom-1.5 -right-1.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center font-black text-[10px] sm:text-xs ${c.badge}`}>
            {index + 1}
          </div>
        </div>

        <h3 className="font-display font-black text-sm sm:text-lg text-white group-hover:text-amber-400 transition-colors truncate max-w-full px-1">
          {player.name}
        </h3>
        
        {/* VIP Metal tag */}
        <span className={`text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider px-2 sm:px-2.5 py-0.5 rounded-full mt-1.5 border ${vipLevel.badgeBorder} ${vipLevel.badgeBg} ${vipLevel.color}`}>
          {vipLevel.label}
        </span>

        {/* Stat Box */}
        <div className="mt-4 sm:mt-5 w-full bg-[#121212]/60 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 border border-white/5">
          <p className="text-[9px] sm:text-[10px] text-slate-500 uppercase tracking-widest font-bold">{stat.label}</p>
          <p className={`text-sm sm:text-base font-mono font-black mt-0.5 sm:mt-1 ${c.text}`}>{stat.val}</p>
        </div>

        <div className="mt-3 flex justify-around w-full text-[9px] sm:text-[10px] text-slate-400 font-medium">
          <div>
            <span className="block text-slate-600 font-bold uppercase tracking-tighter text-[8px] sm:text-[9px]">Total Bets</span>
            <span className="font-mono text-white/90 text-xs">{formatAmount(player.totalWagered || 0)}</span>
          </div>
          <div className="w-px bg-white/5 h-6 self-center" />
          <div>
            <span className="block text-slate-600 font-bold uppercase tracking-tighter text-[8px] sm:text-[9px]">Win Rate</span>
            <span className="font-mono text-emerald-400 text-xs">
              {player.totalBetsCount 
                ? `${Math.round(((player.wins || 0) / player.totalBetsCount) * 100)}%` 
                : '0%'}
            </span>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="text-white w-full max-w-full overflow-hidden">
      {/* Upper Brand Section */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 sm:gap-6 mb-6 sm:mb-8 border-b border-white/5 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-[10px] sm:text-xs uppercase tracking-widest">
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Gaming Arena Elite</span>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-black text-white tracking-tight">
            HALL OF <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">FAME</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl leading-relaxed">
            Live rankings of top-performing players across the Matrix. Play games, wager, and climb the Leaderboard.
          </p>
        </div>

        {/* Ranking Criteria Selectors */}
        <div className="flex flex-wrap gap-1 p-1 bg-[#121212] border border-white/5 rounded-xl sm:rounded-2xl shrink-0">
          <button
            onClick={() => setCriteria('totalWinnings')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition-all ${
              criteria === 'totalWinnings' 
                ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/20 text-amber-400 border border-amber-500/20' 
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <Trophy className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
            <span>Top Earnings</span>
          </button>
          <button
            onClick={() => setCriteria('balance')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition-all ${
              criteria === 'balance' 
                ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/20 text-amber-400 border border-amber-500/20' 
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <Wallet className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
            <span>High Balance</span>
          </button>
          <button
            onClick={() => setCriteria('biggestBet')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition-all ${
              criteria === 'biggestBet' 
                ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/20 text-amber-400 border border-amber-500/20' 
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <Zap className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
            <span>Biggest Bets</span>
          </button>
          <button
            onClick={() => setCriteria('totalBetsCount')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition-all ${
              criteria === 'totalBetsCount' 
                ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/20 text-amber-400 border border-amber-500/20' 
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <Flame className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
            <span>Most Active</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-[#0d0d0d] border border-white/5 rounded-3xl">
          <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Querying Hall of Fame...</p>
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-rose-950/10 border border-rose-500/20 rounded-3xl">
          <p className="text-rose-400 text-sm font-semibold">{error}</p>
        </div>
      ) : (
        <div className="space-y-8 sm:space-y-10">
          {/* Top 3 Podium layout */}
          {topThree.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              {/* Render 2nd place first on desktop for symmetric podium look */}
              <div className="order-2 md:order-1">
                {topThree[1] ? renderPodiumItem(topThree[1], 1) : (
                  <div className="h-full rounded-2xl border border-white/5 bg-white/5 flex items-center justify-center p-6 text-slate-500 italic text-sm">
                    No competitor
                  </div>
                )}
              </div>
              <div className="order-1 md:order-2 md:-translate-y-4">
                {topThree[0] ? renderPodiumItem(topThree[0], 0) : (
                  <div className="h-full rounded-2xl border border-white/5 bg-white/5 flex items-center justify-center p-6 text-slate-500 italic text-sm">
                    No competitor
                  </div>
                )}
              </div>
              <div className="order-3">
                {topThree[2] ? renderPodiumItem(topThree[2], 2) : (
                  <div className="h-full rounded-2xl border border-white/5 bg-white/5 flex items-center justify-center p-6 text-slate-500 italic text-sm">
                    No competitor
                  </div>
                )}
              </div>
            </div>
          )}

          {/* List of ranks 4 to 100 */}
          <div className="bg-[#0d0d0d] border border-white/5 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl">
            <div className="px-4 sm:px-6 py-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-xs sm:text-sm font-black font-display text-white uppercase tracking-wider flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400" />
                <span>Rankings Hall</span>
              </h2>
              <span className="text-[9px] sm:text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider">
                Showing top 100 players
              </span>
            </div>

            {restPlayers.length === 0 ? (
              <div className="p-12 text-center text-slate-500 italic text-sm">
                No additional players ranked. Keep playing to appear here!
              </div>
            ) : (
              <div className="w-full overflow-hidden">
                <table className="w-full text-left border-collapse table-auto sm:table-fixed">
                  <thead>
                    <tr className="border-b border-white/5 text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <th className="px-2.5 sm:px-4 py-3 sm:py-4 text-center w-10 sm:w-16">Rank</th>
                      <th className="px-2 sm:px-4 py-3 sm:py-4">Player</th>
                      <th className="hidden sm:table-cell px-2 sm:px-4 py-3 sm:py-4">VIP Level</th>
                      <th className={`px-2 sm:px-4 py-3 sm:py-4 text-right ${criteria === 'totalWinnings' ? 'table-cell' : 'hidden sm:table-cell'}`}>Winnings</th>
                      <th className={`px-2 sm:px-4 py-3 sm:py-4 text-right ${criteria === 'biggestBet' ? 'table-cell' : 'hidden lg:table-cell'}`}>Biggest Bet</th>
                      <th className={`px-2 sm:px-4 py-3 sm:py-4 text-right ${criteria === 'totalBetsCount' ? 'table-cell' : 'hidden md:table-cell'}`}>Bets Played</th>
                      <th className={`px-2 sm:px-4 py-3 sm:py-4 text-right ${criteria === 'balance' ? 'table-cell' : 'hidden sm:table-cell'}`}>Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {restPlayers.map((player, idx) => {
                      const rank = idx + 4;
                      const vipLevel = getVIPLevel(player.totalWagered || 0);

                      return (
                        <tr 
                          key={player.id}
                          className="hover:bg-white/[0.02] transition-colors group text-sm"
                        >
                          <td className="px-2.5 sm:px-4 py-3 sm:py-4 text-center font-display font-black text-slate-400 text-xs sm:text-base">
                            #{rank}
                          </td>
                          <td className="px-2 sm:px-4 py-3 sm:py-4 min-w-0">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                              {/* Avatar circle */}
                              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 flex items-center justify-center font-display font-black text-[10px] sm:text-xs text-white uppercase shadow-inner group-hover:border-amber-500/30 transition-colors shrink-0">
                                {player.name ? player.name.substring(0, 2).toUpperCase() : 'PL'}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                  <p className="font-bold text-white group-hover:text-amber-400 transition-colors truncate text-xs sm:text-sm">
                                    {player.name}
                                  </p>
                                  <span className={`sm:hidden text-[7px] font-black uppercase tracking-wider px-1 py-0.2 rounded bg-white/5 border border-white/10 ${vipLevel.color}`}>
                                    {vipLevel.label}
                                  </span>
                                </div>
                                <p className="text-[9px] sm:text-[10px] font-mono text-slate-500 truncate max-w-[80px] sm:max-w-[150px]">
                                  {player.email || 'Anonymous'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="hidden sm:table-cell px-2 sm:px-4 py-3 sm:py-4">
                            <span className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded border ${vipLevel.badgeBorder} ${vipLevel.badgeBg} ${vipLevel.color}`}>
                              {vipLevel.label}
                            </span>
                          </td>
                          <td className={`px-2 sm:px-4 py-3 sm:py-4 text-right font-mono font-bold text-emerald-400 ${criteria === 'totalWinnings' ? 'table-cell' : 'hidden sm:table-cell'}`}>
                            {formatAmount(player.totalWinnings || 0)}
                          </td>
                          <td className={`px-2 sm:px-4 py-3 sm:py-4 text-right font-mono text-slate-300 ${criteria === 'biggestBet' ? 'table-cell' : 'hidden lg:table-cell'}`}>
                            {formatAmount(player.biggestBet || 0)}
                          </td>
                          <td className={`px-2 sm:px-4 py-3 sm:py-4 text-right font-mono text-slate-400 font-semibold ${criteria === 'totalBetsCount' ? 'table-cell' : 'hidden md:table-cell'}`}>
                            {player.totalBetsCount || 0}
                          </td>
                          <td className={`px-2 sm:px-4 py-3 sm:py-4 text-right font-mono font-extrabold text-white ${criteria === 'balance' ? 'table-cell' : 'hidden sm:table-cell'}`}>
                            {formatAmount(player.balance || 0)}
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
      )}
    </div>
  );
}
