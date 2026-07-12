import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Globe } from 'lucide-react';
import { SUPPORTED_CURRENCIES } from '../lib/currency';

interface CurrencySelectorProps {
  preferredCurrency: string;
  onSelectCurrency: (code: string) => void;
}

export function CurrencySelector({ preferredCurrency, onSelectCurrency }: CurrencySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = SUPPORTED_CURRENCIES[preferredCurrency] || SUPPORTED_CURRENCIES.USD;

  const renderFlag = (flag: string, name: string) => {
    if (flag && flag.length > 2) {
      return (
        <span className="text-[8px] leading-none font-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/10 uppercase tracking-tighter inline-flex items-center justify-center min-w-[28px] h-4 select-none">
          {flag}
        </span>
      );
    }
    return (
      <span className="text-base" role="img" aria-label={name}>
        {flag}
      </span>
    );
  };

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative font-sans select-none" ref={dropdownRef}>
      <p className="text-[9px] text-slate-500 font-mono uppercase tracking-[0.15em] mb-1.5 px-0.5">Preferred Currency</p>
      
      {/* Selector Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/5 active:border-emerald-500/30 rounded-xl text-slate-200 transition-all cursor-pointer focus:outline-none"
      >
        <div className="flex items-center gap-2">
          {renderFlag(selected.flag, selected.name)}
          <span className="font-mono text-xs font-bold tracking-wider">{selected.code}</span>
          <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
            {selected.symbol}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180 text-emerald-400' : ''}`} />
      </button>

      {/* Dropdown Options overlay */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 bg-zinc-950/95 border border-white/10 rounded-xl shadow-2xl z-50 py-1.5 divide-y divide-white/5 backdrop-blur-md overflow-hidden">
          {Object.values(SUPPORTED_CURRENCIES).map((curr) => {
            const isCurrent = curr.code === preferredCurrency;
            return (
              <button
                key={curr.code}
                type="button"
                onClick={() => {
                  onSelectCurrency(curr.code);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left text-xs transition-colors hover:bg-emerald-500/10 cursor-pointer ${
                  isCurrent ? 'bg-emerald-500/5 text-white font-semibold' : 'text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {renderFlag(curr.flag, curr.name)}
                  <div>
                    <span className="font-mono font-bold tracking-wider mr-1.5">{curr.code}</span>
                    <span className="text-[10px] text-slate-500">{curr.name}</span>
                  </div>
                </div>
                <span className={`font-mono text-[10px] font-black ${isCurrent ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {curr.symbol}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
