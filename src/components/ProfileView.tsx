import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, User, Check, AlertCircle, Upload, Play, RefreshCw, Star, ShieldCheck, Heart, Trash2, AlertTriangle, ExternalLink } from 'lucide-react';
import { Player } from '../types';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface ProfileViewProps {
  currentPlayer: Player | null;
  onUpdateProfile: (updates: { name?: string; photoURL?: string }) => Promise<void>;
  playSound: (type: 'WIN' | 'LOSE' | 'SPIN' | 'BET' | 'CLICK' | 'TICK') => void;
}

export default function ProfileView({ currentPlayer, onUpdateProfile, playSound }: ProfileViewProps) {
  const [displayName, setDisplayName] = useState(currentPlayer?.name || '');
  const [photoURL, setPhotoURL] = useState(currentPlayer?.photoURL || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameChecking, setNameChecking] = useState(false);
  const [isNameTaken, setIsNameTaken] = useState(false);
  
  // Camera variables
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Custom Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Sync profile data when component mounts or currentPlayer changes
  useEffect(() => {
    if (currentPlayer) {
      setDisplayName(currentPlayer.name);
      setPhotoURL(currentPlayer.photoURL || '');
    }
  }, [currentPlayer]);

  // Handle checking name uniqueness with a debounce
  useEffect(() => {
    const trimmed = displayName.trim();
    if (!trimmed || trimmed === currentPlayer?.name) {
      setIsNameTaken(false);
      setNameChecking(false);
      return;
    }

    setNameChecking(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const q = query(collection(db, 'players'), where('name', '==', trimmed));
        const res = await getDocs(q);
        const exists = res.docs.some(doc => doc.id !== currentPlayer?.id);
        setIsNameTaken(exists);
      } catch (err) {
        console.warn('Could not verify username uniqueness strictly', err);
        setIsNameTaken(false);
      } finally {
        setNameChecking(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [displayName, currentPlayer]);

  // Start devices camera stream
  const startCamera = async () => {
    playSound('CLICK');
    setCameraError(null);
    setCameraActive(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 400, height: 400, facingMode: 'user' },
        audio: false
      });
      setStream(mediaStream);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 150);
    } catch (err: any) {
      console.warn('Camera Access Error:', err);
      let errMsg = 'Camera access dismissed or blocked. Sandboxed preview environments restrict hardware access.';
      if (err.name === 'NotAllowedError' || err.message?.includes('denied') || err.message?.includes('dismissed') || err.message?.includes('Permission')) {
        errMsg = 'Secure permission rules denied local hardware access.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errMsg = 'No active video processing units (cameras) were found.';
      }
      setCameraError(errMsg);
      playSound('LOSE');
    }
  };

  // Stop camera tracks
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraActive(false);
    setCameraError(null);
  };

  // Capture frame from video to Canvas
  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const minDim = Math.min(video.videoWidth, video.videoHeight);
        const sx = (video.videoWidth - minDim) / 2;
        const sy = (video.videoHeight - minDim) / 2;
        ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, 300, 300);
        
        try {
          const base64 = canvas.toDataURL('image/jpeg', 0.85);
          setPhotoURL(base64);
          playSound('WIN');
          showToast('Live portrait snapshot captured!', 'success');
        } catch (e) {
          console.error('Failed to capture snapshot data url', e);
          showToast('Portrait compilation failed.', 'error');
        }
      }
      stopCamera();
    }
  };

  // Handle files upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast('Image file size exceeds our 2MB limit threshold.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhotoURL(event.target.result as string);
          playSound('WIN');
          showToast('Custom avatar registered!', 'success');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit changes
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPlayer) return;

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      showToast('Profile username cannot be empty!', 'error');
      return;
    }

    if (isNameTaken) {
      showToast('This username is already taken. Try another alias!', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await onUpdateProfile({
        name: trimmedName,
        photoURL: photoURL
      });
      showToast('Profile successfully synchronized to safety!', 'success');
    } catch (err) {
      console.error('Failed to update profile:', err);
      showToast('Vault communication lapse. Please retry.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Title block */}
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-emerald-500/10 p-3.5 rounded-2xl border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
          <User className="w-8 h-8 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-3xl font-display font-medium text-white tracking-tight">Identity & Vault Profile</h2>
          <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mt-0.5">Customize your public trading metadata</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
        {/* Left Side: Avatar Panel */}
        <div className="md:col-span-2 flex flex-col items-center">
          <div className="bg-[#0d0d0d] border border-white/5 w-full rounded-[2rem] p-6 text-center shadow-xl flex flex-col items-center relative overflow-hidden group">
            <span className="text-[9px] font-black tracking-widest text-[#a3e635] uppercase mb-4 block">Secured ID Card</span>

            {/* Avatar Container */}
            <div className="relative w-36 h-36 rounded-full p-1 bg-gradient-to-tr from-emerald-500/30 via-transparent to-emerald-400 mb-6 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.1)]">
              <div className="w-full h-full rounded-full bg-slate-950 overflow-hidden flex items-center justify-center relative">
                {photoURL ? (
                  <img 
                    src={photoURL} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-emerald-500/5 flex flex-col items-center justify-center text-emerald-400">
                    <User className="w-16 h-16 opacity-40" />
                  </div>
                )}
              </div>

              {/* Action buttons on hover */}
              <div className="absolute inset-2 bg-slate-950/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col gap-2 items-center justify-center">
                <button
                  type="button"
                  onClick={startCamera}
                  className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/40 hover:bg-emerald-500 hover:text-black transition-all"
                  title="Take Photo"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 bg-white/5 text-slate-300 rounded-full border border-white/10 hover:bg-white/10 hover:text-white transition-all"
                  title="Upload from Device"
                >
                  <Upload className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sub-label */}
            <div className="space-y-1 w-full text-center">
              <h3 className="text-lg font-bold text-white truncate max-w-full">{currentPlayer?.name || 'Vapor Player'}</h3>
              <div className="flex items-center justify-center gap-1.5 text-[9px] font-mono text-slate-500 uppercase tracking-widest">
                <ShieldCheck className="w-3.5 h-3.5 text-[#a3e635]" />
                Verified Trader
              </div>
            </div>

            {/* Hidden Input File */}
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />

            {/* Clear photo option */}
            {photoURL && (
              <button
                type="button"
                onClick={() => { playSound('CLICK'); setPhotoURL(''); }}
                className="mt-6 flex items-center gap-1.5 text-[10px] uppercase font-black tracking-widest text-rose-500 hover:text-rose-400 transition-colors bg-rose-500/5 border border-rose-500/10 hover:bg-rose-500/10 px-4 py-2 rounded-xl"
              >
                <Trash2 className="w-3 h-3" />
                Remove Avatar
              </button>
            )}
          </div>
        </div>

        {/* Right Side: Form Configuration */}
        <div className="md:col-span-3">
          <form onSubmit={handleSaveProfile} className="space-y-6">
            <div className="bg-[#0d0d0d] border border-white/5 rounded-[2rem] p-6 lg:p-8 space-y-6 shadow-xl">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Star className="w-4 h-4 text-emerald-400" />
                Configure Profile Metadata
              </h3>

              {/* Display Name Input */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block ml-1">Display Username</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input 
                    type="text" 
                    placeholder="E.g., CryptoViper"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value.replace(/\s+/g, ' '));
                      playSound('TICK');
                    }}
                    maxLength={20}
                    className="w-full bg-slate-950 border border-white/5 rounded-xl pl-11 pr-12 py-4 text-white focus:outline-none focus:border-emerald-500/30 transition-all placeholder:text-slate-700 font-medium"
                  />

                  {/* Status Indicator inside Input Container */}
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center">
                    {nameChecking ? (
                      <RefreshCw className="w-4 h-4 text-slate-500 animate-spin" />
                    ) : displayName.trim() && displayName.trim() !== currentPlayer?.name ? (
                      isNameTaken ? (
                        <AlertCircle className="w-4 h-4 text-rose-500" title="Username is already occupied" />
                      ) : (
                        <Check className="w-4 h-4 text-[#a3e635]" title="Username is available" />
                      )
                    ) : null}
                  </div>
                </div>

                {/* Subtext warning */}
                <div className="h-4">
                  {isNameTaken && displayName.trim() && (
                    <motion.p 
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[10px] text-rose-400 font-medium flex items-center gap-1 block ml-1"
                    >
                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                      Someone is already using this username. Please choose another one.
                    </motion.p>
                  )}
                  {!isNameTaken && displayName.trim() && displayName.trim() !== currentPlayer?.name && !nameChecking && (
                    <motion.p 
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 block ml-1"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Secure username matches security requirements.
                    </motion.p>
                  )}
                </div>
              </div>

              {/* Referral details displayed visually inside profile */}
              <div className="pt-4 border-t border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs font-mono uppercase tracking-wider">Unique Registration Code</span>
                  <span className="font-mono text-xs font-bold text-[#a3e635] bg-emerald-500/5 border border-emerald-400/10 px-3 py-1 rounded-lg">
                    {currentPlayer?.referralCode || 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs font-mono uppercase tracking-wider">Verified Referrals</span>
                  <span className="font-mono text-xs font-bold text-white bg-white/5 px-3 py-1 rounded-lg">
                    {currentPlayer?.referralCount || 0} Friends
                  </span>
                </div>
              </div>
            </div>

            {/* Profile Update trigger */}
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={isSubmitting || nameChecking || !displayName.trim() || isNameTaken}
              className="w-full py-4 bg-emerald-500 text-black font-black uppercase text-xs tracking-widest rounded-xl shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all disabled:opacity-30 disabled:pointer-events-none"
            >
              {isSubmitting ? 'Syncing...' : 'Save Profile Changes'}
            </motion.button>
          </form>
        </div>
      </div>

      {/* Device Camera Overlay Stream Modal */}
      <AnimatePresence>
        {cameraActive && (
          <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#050505] border border-white/10 w-full max-w-md rounded-[2.5rem] overflow-hidden p-6 text-center shadow-2xl relative"
            >
              <div className="mb-6">
                <h3 className="text-xl font-display font-medium text-white flex items-center justify-center gap-2">
                  <Camera className="w-5 h-5 text-emerald-400" />
                  Scanner Camera Module
                </h3>
                <p className="text-[9px] text-[#a3e635] font-mono tracking-widest uppercase mt-1">Ready for real-time authentication</p>
              </div>

              {/* Video or Error message container */}
              <div className="aspect-square bg-slate-950 rounded-3xl border border-white/10 overflow-hidden relative mb-6 flex flex-col items-center justify-center p-6">
                {cameraError ? (
                  <div className="text-center space-y-4 flex flex-col items-center justify-center h-full">
                    <div className="p-3 bg-rose-500/10 text-rose-400 rounded-full border border-rose-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                      <AlertTriangle className="w-7 h-7" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-mono text-rose-400 font-bold max-w-xs uppercase tracking-wide">
                        {cameraError}
                      </p>
                      <p className="text-[10px] text-slate-400 leading-relaxed max-w-xs px-2">
                        Common browser security rules block custom camera input from inside an embedded sandbox iframe.
                      </p>
                      
                      {/* Interactive stand-alone warning */}
                      <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3 text-left space-y-1.5 mt-2 max-w-xs">
                        <p className="text-[10px] text-[#a3e635] font-black uppercase tracking-wider flex items-center gap-1.5">
                          <ExternalLink className="w-3.5 h-3.5" />
                          How to enable standalone:
                        </p>
                        <p className="text-[9px] text-slate-500 leading-relaxed">
                          Click the <span className="text-white font-bold">"Open in New Tab"</span> arrow selector in the top-right corner of the development preview window, which starts the app natively.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                      className="w-full h-full object-cover transform scale-x-[-1]"
                    />
                    
                    {/* Visual guidelines */}
                    <div className="absolute inset-12 border border-emerald-500/20 rounded-full pointer-events-none flex items-center justify-center">
                      <div className="w-2.5 h-2.5 bg-[#a3e635] rounded-full animate-ping" />
                    </div>
                  </>
                )}
              </div>

              {/* Action operations controls */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={stopCamera}
                  className="flex-1 py-3.5 bg-slate-900 border border-white/5 hover:bg-slate-800 text-slate-300 font-bold rounded-xl text-[10px] uppercase tracking-widest transition-all"
                >
                  Cancel
                </button>
                {cameraError ? (
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setTimeout(() => {
                        fileInputRef.current?.click();
                      }, 200);
                    }}
                    className="flex-[2] py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black rounded-xl text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/10"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Photo Instead
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="flex-[2] py-3.5 bg-[#a3e635] hover:bg-[#bbf7d0] text-black font-black rounded-xl text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-lime-500/10"
                  >
                    <Camera className="w-4 h-4" />
                    Capture Photo
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Toast Feedback Indicator */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-[300] max-w-sm w-full bg-[#0d0d0d]/95 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex items-start gap-3 select-none"
          >
            <div className={`p-2 rounded-xl shrink-0 ${
              toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' :
              toast.type === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10' :
              toast.type === 'warning' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10' :
              'bg-[#a3e635]/15 text-[#a3e635] border border-[#a3e635]/10'
            }`}>
              {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-[10px] font-black tracking-widest uppercase text-slate-500">{toast.type} Alert</p>
              <p className="text-xs text-white/90 mt-1 font-medium leading-relaxed break-words">{toast.message}</p>
            </div>
            <button 
              onClick={() => setToast(null)}
              className="text-slate-500 hover:text-white text-sm font-bold leading-none p-1 transition-colors"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
