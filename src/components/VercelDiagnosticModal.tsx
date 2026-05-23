import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Copy, CheckCircle2, ExternalLink, ShieldAlert, Award, AlertCircle } from 'lucide-react';

interface VercelDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorDetails?: {
    code?: string;
    message?: string;
  } | null;
}

export function VercelDiagnosticModal({ isOpen, onClose, errorDetails }: VercelDiagnosticModalProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'your-site.vercel.app';

  const steps = [
    {
      title: "1. Add Domain in Firebase Console",
      description: "Firebase restricts authentication to white-listed domains. You must authorize this Vercel domain to enable Google Login.",
      actionLabel: "How to fix:",
      steps: [
        "Go to the Firebase Console -> Build -> Authentication -> Settings.",
        "Click on Authorized Domains on the left sidebar.",
        `Click Add Domain and paste: "${currentDomain}"`,
        "If you use preview links, also add: \"*.vercel.app\""
      ],
      copyText: currentDomain
    },
    {
      title: "2. Whitelist in Google Cloud (OAuth ID)",
      description: "Google's security gateway requires whitelisting redirect URIs and JavaScript origins.",
      actionLabel: "How to fix:",
      steps: [
        "Go to Google Cloud Console -> APIs & Services -> Credentials.",
        "Edit your Web Application OAuth Client ID.",
        `Under Authorized JavaScript Origins, add: "https://${currentDomain}"`,
        `Under Authorized redirect URIs, add: "https://${currentDomain}/__/auth/handler"`
      ],
      copyText: `https://${currentDomain}`
    },
    {
      title: "3. Configure Vercel Env Variables (Optional)",
      description: "If your app is not loading Firestore data correctly, you might be missing your Firebase variables inside Vercel Dashboard.",
      actionLabel: "Variables to add in Vercel settings:",
      steps: [
        "VITE_FIREBASE_API_KEY",
        "VITE_FIREBASE_AUTH_DOMAIN",
        "VITE_FIREBASE_PROJECT_ID",
        "VITE_FIREBASE_STORAGE_BUCKET",
        "VITE_FIREBASE_MESSAGING_SENDER_ID",
        "VITE_FIREBASE_APP_ID"
      ],
      copyText: "VITE_FIREBASE_API_KEY"
    }
  ];

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div id="vercel-diag-overlay" className="fixed inset-0 flex items-center justify-center p-4 z-[999] bg-black/85 backdrop-blur-sm overflow-y-auto">
          <motion.div
            id="vercel-diag-dialog"
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="w-full max-w-2xl bg-[#090a0f] border border-white/5 rounded-[2rem] shadow-2xl relative overflow-hidden my-8"
          >
            {/* Top Glow bar */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-teal-500 via-emerald-500 to-amber-500 opacity-80" />

            {/* Header */}
            <div className="p-8 border-b border-white/5 flex items-start justify-between">
              <div className="flex gap-4 items-center">
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                  <ShieldAlert className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Vercel Deployment & Login Fixer</h2>
                  <p className="text-xs text-slate-500 mt-1">Resolve Google Auth Domain mismatches automatically</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-500 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content info */}
            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
              {errorDetails && (
                <div className="p-4 bg-red-950/20 border border-red-500/10 rounded-2xl flex gap-3 text-left">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-red-300">Firebase Intercepted Error:</h4>
                    <p className="text-xs text-red-400/95 mt-1 font-mono break-all">{errorDetails.code || "unknown_error"}: {errorDetails.message}</p>
                  </div>
                </div>
              )}

              <div className="text-xs leading-relaxed text-slate-400">
                You seeing this because Firebase is running on your Vercel URL (<span className="text-teal-400 font-mono font-bold">{currentDomain}</span>). Since Firebase Auth restricts where login redirections or popups can execute, you must whitelist this URL. Follow these standard resolution steps:
              </div>

              {/* Steps */}
              <div className="space-y-4">
                {steps.map((step, idx) => (
                  <div key={idx} className="bg-white/[0.02] hover:bg-white/[0.03] border border-white/5 rounded-2xl p-5 transition-all duration-200">
                    <div className="flex justify-between items-start gap-4 mb-2">
                      <h3 className="text-sm font-bold text-white tracking-wide">{step.title}</h3>
                      {step.copyText && (
                        <button
                          onClick={() => handleCopy(step.copyText, idx)}
                          className="flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] text-slate-300 font-bold tracking-wider hover:text-white transition-all select-none uppercase shrink-0"
                        >
                          {copiedIndex === idx ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-slate-400" />
                              <span>Copy URL</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mb-3 leading-relaxed">{step.description}</p>
                    <div className="bg-black/40 border border-white/5 rounded-xl p-3.5 text-left font-mono">
                      <div className="text-[10px] text-teal-400 font-bold uppercase tracking-wider mb-2">{step.actionLabel}</div>
                      <ul className="space-y-1.5 text-xs text-slate-400 list-disc list-inside">
                        {step.steps.map((li, liIdx) => (
                          <li key={liIdx} className="leading-relaxed hover:text-slate-300 transition-colors">
                            {li}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 bg-white/[0.01] border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                <Award className="w-4 h-4 text-emerald-500 animate-pulse" />
                <span>SPA Rewrites applied automatically via vercel.json</span>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <a
                  href="https://console.firebase.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-none py-3 px-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-300 hover:text-white flex items-center justify-center gap-1.5 transition-all text-center"
                >
                  <span>Firebase Console</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={onClose}
                  className="flex-1 sm:flex-none py-3 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-bold rounded-xl text-xs hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  Got It
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
