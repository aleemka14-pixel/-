import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  Search, 
  Clock, 
  Activity, 
  Calendar, 
  TrendingUp, 
  Circle,
  Coins,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { Player } from '../types.ts';
import { 
  getCurrencySymbol, 
  formatCurrencyValue, 
  getCachedRates 
} from '../lib/currency.ts';
import { getVIPLevel } from '../App.tsx';

interface AdminActiveUsersViewProps {
  players: Player[];
  preferredCurrency: string;
  playSound: (sound: string) => void;
}

export function AdminActiveUsersView({ players, preferredCurrency, playSound }: AdminActiveUsersViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  
  const currentRates = useMemo(() => getCachedRates().rates, [preferredCurrency]);

  const formatAmount = (val: number) => {
    return `${getCurrencySymbol(preferredCurrency)}${formatCurrencyValue(val, preferredCurrency, currentRates)}`;
  };

  const stats = useMemo(() => {
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60 * 1000;
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = startOfToday.getTime();

    const total = players.length;
    const currentlyActive = players.filter(p => p.lastActive && p.lastActive >= fiveMinAgo).length;
    const activeToday = players.filter(p => p.lastActive && p.lastActive >= startOfTodayMs).length;
    const active24h = players.filter(p => p.lastActive && p.lastActive >= twentyFourHoursAgo).length;

    return { total, currentlyActive, activeToday, active24h };
  }, [players]);

  const filteredPlayers = useMemo(() => {
    return players.filter(p => {
      const nameMatch = (p.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const emailMatch = (p.email || '').toLowerCase().includes(searchTerm.toLowerCase());
      return nameMatch || emailMatch;
    }).sort((a, b) => {
      // Sort active first, then by lastActive desc
      const now = Date.now();
      const isOnlineA = a.lastActive && (now - a.lastActive <= 5 * 60 * 1000) ? 1 : 0;
      const isOnlineB = b.lastActive && (now - b.lastActive <= 5 * 60 * 1000) ? 1 : 0;
      
      if (isOnlineB !== isOnlineA) return isOnlineB - isOnlineA;
      return (b.lastActive || 0) - (a.lastActive || 0);
    });
  }, [players, searchTerm]);

  const getRelativeTime = (timestamp?: number) => {
    if (!timestamp) return 'Never Active';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-6 text-white w-full">
      {/* Analytics Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Registered */}
        <div className="bg-[#121212]/40 border border-white/5 rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full blur-2xl" />
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">TOTAL REGISTERED</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-mono font-black text-white">{stats.total}</p>
          <p className="text-[10px] text-slate-500 mt-1 font-semibold">Total players in database</p>
        </div>

        {/* Currently Active */}
        <div className="bg-[#121212]/40 border border-white/5 rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-2xl" />
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
              CURRENTLY ONLINE
            </span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-mono font-black text-white">{stats.currentlyActive}</p>
          <p className="text-[10px] text-slate-500 mt-1 font-semibold">Active in last 5 minutes</p>
        </div>

        {/* Active Today */}
        <div className="bg-[#121212]/40 border border-white/5 rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-2xl" />
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">ACTIVE TODAY</span>
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-mono font-black text-white">{stats.activeToday}</p>
          <p className="text-[10px] text-slate-500 mt-1 font-semibold">Active since local midnight</p>
        </div>

        {/* Active 24h */}
        <div className="bg-[#121212]/40 border border-white/5 rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 rounded-full blur-2xl" />
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-bold">ACTIVE LAST 24H</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-mono font-black text-white">{stats.active24h}</p>
          <p className="text-[10px] text-slate-500 mt-1 font-semibold">Active within past 24 hours</p>
        </div>
      </div>

      {/* Control bar / search */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white/[0.01] border border-white/5 p-4 rounded-2xl">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search players by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#121212] border border-white/10 rounded-xl py-2.5 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
        </div>
        <span className="text-xs font-mono text-slate-500 font-bold shrink-0">
          Showing {filteredPlayers.length} of {players.length} registered players
        </span>
      </div>

      {/* Players list spreadsheet layout */}
      <div className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[750px]">
            <thead>
              <tr className="border-b border-white/5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 bg-white/[0.01]">
                <th className="px-6 py-4">Player</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Last Active</th>
                <th className="px-6 py-4">VIP Level</th>
                <th className="px-6 py-4 text-right">Balance</th>
                <th className="px-6 py-4 text-right">Bets Played</th>
                <th className="px-6 py-4 text-right">Total Wagered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500 italic text-sm">
                    No matching players found.
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((player) => {
                  const now = Date.now();
                  const isOnline = player.lastActive && (now - player.lastActive <= 5 * 60 * 1000);
                  const vipLevel = getVIPLevel(player.totalWagered || 0);

                  return (
                    <tr 
                      key={player.id}
                      className="hover:bg-white/[0.02] transition-colors group text-sm"
                    >
                      {/* Name/Email */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl bg-white/5 border flex items-center justify-center font-display font-black text-xs text-white uppercase shadow-inner transition-colors ${isOnline ? 'border-emerald-500/30' : 'border-white/10'}`}>
                            {player.name ? player.name.substring(0, 2).toUpperCase() : 'PL'}
                          </div>
                          <div>
                            <p className="font-bold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                              {player.name}
                              {player.override && player.override !== 'none' && (
                                <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest border ${
                                  player.override === 'win' 
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                }`}>
                                  {player.override} FORCE
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] font-mono text-slate-500">
                              {player.email || 'Anonymous'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Online status indicator */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]' : 'bg-slate-600'}`} />
                          <span className={`text-xs font-bold ${isOnline ? 'text-emerald-400 font-extrabold' : 'text-slate-500'}`}>
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </td>

                      {/* Last Active relative time */}
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">
                        {player.lastActive ? (
                          <div>
                            <p className="text-white font-medium">{getRelativeTime(player.lastActive)}</p>
                            <p className="text-[9px] text-slate-600">{new Date(player.lastActive).toLocaleTimeString()}</p>
                          </div>
                        ) : (
                          <span className="text-slate-600">Never active</span>
                        )}
                      </td>

                      {/* VIP level */}
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${vipLevel.badgeBorder} ${vipLevel.badgeBg} ${vipLevel.color}`}>
                          {vipLevel.label}
                        </span>
                      </td>

                      {/* Balance */}
                      <td className="px-6 py-4 text-right font-mono font-extrabold text-white">
                        {formatAmount(player.balance || 0)}
                      </td>

                      {/* Bets Played */}
                      <td className="px-6 py-4 text-right font-mono font-semibold text-slate-400">
                        {player.totalBetsCount || 0}
                      </td>

                      {/* Total Wagered */}
                      <td className="px-6 py-4 text-right font-mono text-slate-400">
                        {formatAmount(player.totalWagered || 0)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
