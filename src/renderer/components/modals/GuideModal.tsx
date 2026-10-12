import React, { useState, useEffect } from 'react';
import { Flame, Info, X, Loader2 } from 'lucide-react';
import { useAppStore } from '@/state/useAppStore';
import { useAudio } from '@/shared/hooks/useAudio';

export interface GuideModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const REDIRECT_STEPS = [
  'Initializing Akki Ai',
  'Configuring Local Sub-Agents...',
  'Syncing Memories & Soul Parameters...',
  'Launching Dashboard Interface...',
];

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen: propIsOpen, onClose }) => {
  const { isGuideModalOpen, setIsGuideModalOpen, guideFromSettings, setGuideFromSettings } = useAppStore();
  const { playClick } = useAudio();

  const [viewMode, setViewMode] = useState<'GUIDE' | 'REDIRECTING'>('GUIDE');
  const [redirectStep, setRedirectStep] = useState(0);

  const isVisible = propIsOpen !== undefined ? propIsOpen : isGuideModalOpen;
  const isFromSettings = guideFromSettings || Boolean((window as any)._guideFromSettings);

  useEffect(() => {
    if (viewMode !== 'REDIRECTING') return;
    const interval = setInterval(() => {
      setRedirectStep((prev) => (prev < REDIRECT_STEPS.length - 1 ? prev + 1 : prev));
    }, 1100);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      finalizeClose();
    }, 4500);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [viewMode]);

  if (!isVisible) return null;

  const finalizeClose = async () => {
    try {
      if ((window as any).electronAPI?.invoke) {
        await (window as any).electronAPI.invoke('guide-mark-seen');
      }
    } catch (err) {
      console.warn('[GuideModal] Failed to mark guide seen:', err);
    }
    (window as any)._guideFromSettings = false;
    setGuideFromSettings(false);
    setIsGuideModalOpen(false);
    setViewMode('GUIDE');
    setRedirectStep(0);
    if (onClose) {
      onClose();
    }
  };

  const handleClose = () => {
    playClick();
    if (isFromSettings) {
      finalizeClose();
    } else {
      setViewMode('REDIRECTING');
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300 select-none">
      {viewMode === 'REDIRECTING' ? (
        <div className="relative w-full max-w-xl min-h-[320px] bg-[#0c0d14] border border-white/10 rounded-2xl shadow-2xl flex flex-col items-center justify-center p-8 overflow-hidden animate-in zoom-in-95 duration-300">
          <div className="flex flex-col items-center justify-center text-center animate-in fade-in duration-500">
            <div className="relative w-20 h-20 mb-8 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-white/5 blur-xl animate-pulse" />
              <Loader2 className="w-10 h-10 text-white animate-spin relative z-10 opacity-80" strokeWidth={1.5} />
            </div>
            <h1 className="text-sm font-light tracking-[0.25em] text-white/90 uppercase font-mono mb-2">
              Redirecting to Akki Ai
            </h1>
            <div className="w-16 h-[1px] bg-white/10 mb-6 mx-auto" />
            <div className="h-6 flex items-center justify-center">
              <span className="text-[9px] text-white/40 font-mono tracking-widest uppercase">
                {`[${redirectStep + 1}/4] ${REDIRECT_STEPS[redirectStep]}`}
              </span>
            </div>
            <div className="absolute bottom-6 w-full px-6 flex flex-col items-center gap-1.5 opacity-25">
              <span className="text-[10px] text-white/40 leading-normal font-light font-sans">
                Note: You can view this guide again in Settings
              </span>
            </div>
          </div>
        </div>
      ) : (
      <div className="relative w-full max-w-xl bg-[#0c0d14] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Titlebar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#101012] border-b border-white/5">
          {/* Mac traffic light buttons */}
          <div className="flex items-center gap-1.5 w-24">
            <button
              type="button"
              onClick={handleClose}
              className="w-3 h-3 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 cursor-pointer transition-all duration-150 flex items-center justify-center text-[7px] text-[#4c0002] font-bold border-none outline-none"
              title="Close"
            >
              ✕
            </button>
            <span className="w-3 h-3 rounded-full bg-[#ffbd2e] opacity-40 inline-block" />
            <span className="w-3 h-3 rounded-full bg-[#27c93f] opacity-40 inline-block" />
          </div>

          {/* Center Brand Title */}
          <div className="flex items-center gap-2 text-white/60">
            <Flame size={13} className="text-orange-400" />
            <span className="text-[10px] font-bold tracking-wider font-mono uppercase text-white/80">
              Akki Ai Setup Guide
            </span>
          </div>

          {/* Right Action */}
          <button
            type="button"
            onClick={handleClose}
            className="w-24 text-[9px] text-white/40 hover:text-white font-mono uppercase tracking-widest text-right transition-all duration-150 flex items-center justify-end gap-1 cursor-pointer bg-transparent border-none"
          >
            Skip Guide <X size={12} />
          </button>
        </div>

        {/* Content Body */}
        <div className="relative flex-1 min-h-0 bg-black/60 flex items-center justify-center overflow-hidden border-b border-white/5 p-4 sm:p-5">
          <div className="w-full max-w-lg flex flex-col items-center justify-center text-center space-y-4">
            {/* Header info */}
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-mono tracking-widest uppercase font-semibold">
                Quick Setup Guide
              </div>
              <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">
                Welcome to Akki Ai — Core Setup Steps
              </h2>
              <p className="text-xs text-white/50 max-w-md mx-auto">
                Follow these 5 essential steps to get started with full AI capabilities:
              </p>
            </div>

            {/* 5 Step Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left">
              {/* Step 1 */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 hover:border-cyan-500/30 transition-all space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold text-[11px] flex items-center justify-center shrink-0">
                    1
                  </span>
                  <h3 className="text-xs font-semibold text-white">Gemini API Key</h3>
                </div>
                <p className="text-[11px] text-white/60 leading-snug">
                  Open Settings ➔ API to add your Gemini key. Required for live voice &amp; chat.
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 hover:border-emerald-500/30 transition-all space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[11px] flex items-center justify-center shrink-0">
                    2
                  </span>
                  <h3 className="text-xs font-semibold text-white">Live Voice Mode</h3>
                </div>
                <p className="text-[11px] text-white/60 leading-snug">
                  Click the mic icon to converse in real-time in English, Hindi, or Bengali.
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 hover:border-blue-500/30 transition-all space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold text-[11px] flex items-center justify-center shrink-0">
                    3
                  </span>
                  <h3 className="text-xs font-semibold text-white">Chat &amp; Memory</h3>
                </div>
                <p className="text-[11px] text-white/60 leading-snug">
                  Ask questions or brainstorm; notes and memories save securely to Akki Data.
                </p>
              </div>

              {/* Step 4 */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 hover:border-purple-500/30 transition-all space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 font-bold text-[11px] flex items-center justify-center shrink-0">
                    4
                  </span>
                  <h3 className="text-xs font-semibold text-white">Agent Town Tasks</h3>
                </div>
                <p className="text-[11px] text-white/60 leading-snug">
                  Deploy autonomous sub-agents with browser control &amp; script execution tools.
                </p>
              </div>

              {/* Step 5 */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 hover:border-amber-500/30 transition-all space-y-1 sm:col-span-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold text-[11px] flex items-center justify-center shrink-0">
                    5
                  </span>
                  <h3 className="text-xs font-semibold text-white">WhatsApp Remote Control</h3>
                </div>
                <p className="text-[11px] text-white/60 leading-snug">
                  Scan QR in Settings to message Akki Ai and receive automated replies on WhatsApp.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="px-5 py-3.5 bg-[#070709] flex flex-row items-center justify-between gap-3 border-t border-white/5">
          <div className="flex items-center gap-2 text-left min-w-0 flex-1">
            <Info size={13} className="text-cyan-400 shrink-0" />
            <p className="text-[10px] text-white/50 leading-tight font-light truncate sm:whitespace-normal">
              {isFromSettings
                ? 'Review essential setup steps anytime in Settings.'
                : 'Quick setup is complete. Follow the essential steps above to configure your AI keys, voice, and sub-agents.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 px-6 py-2.5 rounded-full bg-white hover:bg-white/95 text-black text-xs font-bold tracking-wider uppercase font-mono transition-all duration-200 shadow-[0_4px_20px_rgba(255,255,255,0.08)] active:scale-95 cursor-pointer whitespace-nowrap"
          >
            {isFromSettings ? 'Got it' : "Let's Start"}
          </button>
        </div>
      </div>
      )}
    </div>
  );
};

export default GuideModal;
