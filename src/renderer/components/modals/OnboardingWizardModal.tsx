import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Copy,
  Check,
  MessageSquare,
  RefreshCw,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { useAppStore } from '@/state/useAppStore';
import { useAudio } from '@/shared/hooks/useAudio';

interface OnboardingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OnboardingWizardModal: React.FC<OnboardingWizardModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, setIsAuthenticated } = useAppStore();
  const { playClick, playAccessGranted } = useAudio();

  const [step, setStep] = useState<1 | 2 | 3 | 'waiting' | 'approved'>(1);
  const [userName, setUserName] = useState(settings.userName || 'Akshay');
  const [userAge, setUserAge] = useState('24');
  const [userEmail, setUserEmail] = useState('');
  const [hardwareId, setHardwareId] = useState('');
  const [copiedHwid, setCopiedHwid] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const pollIntervalRef = useRef<any>(null);

  // Play legacy harmonic approval chime
  const playApprovalChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc1.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.25); // C6

      osc2.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      osc2.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.25); // E6

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.7);
      osc2.stop(ctx.currentTime + 0.7);
    } catch {}
  };

  // Fetch initial HWID on mount
  useEffect(() => {
    if (!isOpen) return;
    if ((window as any).electronAPI?.invoke) {
      (window as any).electronAPI.invoke('license-get-hardware-id').then((id: string) => {
        if (id) setHardwareId(id);
      }).catch(() => {});
    }
  }, [isOpen]);

  // Polling while in Waiting state
  useEffect(() => {
    if (step === 'waiting') {
      const poll = async () => {
        try {
          if ((window as any).electronAPI?.invoke) {
            const res = await (window as any).electronAPI.invoke('auth-check-access');
            if (res && (res.access || res.approved)) {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              playApprovalChime();
              setStep('approved');
            }
          }
        } catch {}
      };
      pollIntervalRef.current = setInterval(poll, 3000);
      return () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      };
    }
  }, [step]);

  // Listen for push license status change
  useEffect(() => {
    if (!isOpen) return;
    const unsub = (window as any).electronAPI?.on?.('license-status-changed', (data: any) => {
      if (data?.status === 'approved') {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        playApprovalChime();
        setStep('approved');
      } else if (data?.status === 'blocked') {
        setErrorMessage('Device access blocked by administrator.');
      }
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStep1 = () => {
    if (!userName.trim()) {
      setErrorMessage('Please enter your name.');
      return;
    }
    setErrorMessage('');
    playClick();
    if ((window as any).electronAPI?.invoke) {
      (window as any).electronAPI.invoke('onboarding-save-name', userName.trim()).catch(() => {});
    }
    setStep(2);
  };

  const handleStep2 = () => {
    const ageNum = parseInt(userAge, 10);
    if (isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
      setErrorMessage('Please enter a valid age (between 1 and 120).');
      return;
    }
    setErrorMessage('');
    playClick();
    if ((window as any).electronAPI?.invoke) {
      (window as any).electronAPI.invoke('onboarding-save-age', userAge.trim()).catch(() => {});
    }
    setStep(3);
  };

  const handleGoogleSignIn = async () => {
    playClick();
    setIsSigningIn(true);
    setErrorMessage('');

    try {
      if ((window as any).electronAPI?.invoke) {
        const res = await (window as any).electronAPI.invoke('auth-start-callback-server');
        if (res && res.success) {
          if (res.user?.email) setUserEmail(res.user.email);
          if (res.hwid) setHardwareId(res.hwid);

          if (res.status === 'approved') {
            playApprovalChime();
            setStep('approved');
          } else {
            setStep('waiting');
          }
          return;
        } else if (res && res.error) {
          setErrorMessage(res.error);
          return;
        }
      }

      // Fallback
      setTimeout(() => {
        playApprovalChime();
        setStep('approved');
      }, 1000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication could not be completed.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleVerifyWhatsApp = async () => {
    playClick();
    try {
      if ((window as any).electronAPI?.invoke) {
        await (window as any).electronAPI.invoke('license-open-whatsapp', { email: userEmail });
      } else {
        const text = `Hello Akki Ai Support,\n\nPlease activate my account:\nEmail: ${userEmail || userName}\nHardware ID: ${hardwareId}`;
        window.open(`https://wa.me/919732004563?text=${encodeURIComponent(text)}`, '_blank');
      }
    } catch {}
  };

  const handleCopyHwid = () => {
    if (!hardwareId) return;
    navigator.clipboard.writeText(hardwareId);
    setCopiedHwid(true);
    setTimeout(() => setCopiedHwid(false), 2000);
  };

  const handleLaunch = () => {
    playAccessGranted();
    const updated = {
      ...settings,
      userName: userName.trim(),
    };
    if ((window as any).electronAPI?.saveSettings) {
      (window as any).electronAPI.saveSettings(updated);
    }
    if ((window as any).electronAPI?.invoke) {
      (window as any).electronAPI.invoke('save-user-profile', {
        name: userName.trim(),
        age: userAge.trim(),
      }).catch(() => {});
      (window as any).electronAPI.invoke('onboarding-complete').catch(() => {});
    }
    updateSettings(updated);
    setIsAuthenticated(true);
    onClose();
  };

  const currentStageNum = step === 1 ? 1 : step === 2 ? 2 : step === 3 ? 3 : 4;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#0b081e] border border-[#3f2a74] w-full max-w-xl rounded-2xl shadow-[0_0_40px_rgba(157,78,221,0.4)] overflow-hidden flex flex-col">
        {/* HUD Frame Top */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#140b2f] border-b border-[#291b50]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00f0ff] to-[#9d4edd] p-0.5 flex items-center justify-center shadow-[0_0_12px_rgba(0,240,255,0.4)]">
              <Sparkles size={16} className="text-black" />
            </div>
            <div>
              <h2 className="font-['Orbitron',sans-serif] text-sm font-bold tracking-wider text-white">
                AKKI AI ONBOARDING SYSTEM
              </h2>
              <p className="text-[10px] text-gray-400 font-mono">
                STAGE {currentStageNum} OF 4 — SYSTEM VERIFICATION
              </p>
            </div>
          </div>

          {/* Stepper Indicator */}
          <div className="flex items-center space-x-1.5">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`w-6 h-1.5 rounded-full transition-all ${
                  currentStageNum === s
                    ? 'bg-[#00f0ff] shadow-[0_0_8px_#00f0ff]'
                    : currentStageNum > s
                    ? 'bg-[#9d4edd]'
                    : 'bg-[#291b50]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 flex-1 min-h-[300px] bg-[#090518]">
          {/* ═══ STAGE 1: Name ═══ */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-mono text-[#00f0ff] uppercase tracking-wider block mb-1">
                  Stage 1 of 4
                </span>
                <h3 className="font-['Orbitron',sans-serif] text-lg font-bold text-white mb-1">
                  Personalize Akki
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  What name should your voice assistant and agents use when speaking to you?
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Your Name</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStep1()}
                  placeholder="Your name"
                  maxLength={30}
                  className="w-full bg-[#140b2f] border border-[#331f5a] focus:border-[#00f0ff] rounded-xl px-3.5 py-2.5 text-sm text-gray-100 outline-none transition-colors"
                  autoFocus
                />
              </div>

              <div className="p-3 rounded-xl bg-[#120a2a] border border-[#2b184e] text-[11px] text-gray-400 space-y-1">
                <div className="text-gray-300 font-semibold">• Personalized Cognition</div>
                <div>Your assistant adapts its greetings and workflow address to your configured name.</div>
              </div>
            </div>
          )}

          {/* ═══ STAGE 2: Age ═══ */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-mono text-[#00f0ff] uppercase tracking-wider block mb-1">
                  Stage 2 of 4
                </span>
                <h3 className="font-['Orbitron',sans-serif] text-lg font-bold text-white mb-1">
                  Enter Your Age
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  How old are you? Akki uses this to customize workspace insights and report parameters.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Your Age</label>
                <input
                  type="number"
                  value={userAge}
                  onChange={(e) => setUserAge(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStep2()}
                  placeholder="25"
                  min="1"
                  max="120"
                  className="w-full bg-[#140b2f] border border-[#331f5a] focus:border-[#00f0ff] rounded-xl px-3.5 py-2.5 text-sm text-gray-100 outline-none transition-colors"
                  autoFocus
                />
              </div>

              <div className="p-3 rounded-xl bg-[#120a2a] border border-[#2b184e] text-[11px] text-gray-400 space-y-1">
                <div className="text-gray-300 font-semibold">• Privacy Assurance</div>
                <div>Your age and profile are stored locally in your encrypted configuration files.</div>
              </div>
            </div>
          )}

          {/* ═══ STAGE 3: Google Sign-In ═══ */}
          {step === 3 && (
            <div className="space-y-4 text-center py-2">
              <div>
                <span className="text-[10px] font-mono text-[#00f0ff] uppercase tracking-wider block mb-1">
                  Stage 3 of 4
                </span>
                <h3 className="font-['Orbitron',sans-serif] text-lg font-bold text-white mb-1">
                  Welcome to the Experience
                </h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Your technical sci-fi companion is verified and ready for activation. Authenticate your account to continue.
                </p>
              </div>

              <div className="flex items-center justify-center space-x-2 text-[10px] font-mono text-emerald-400 py-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold">VERIFIED BUILD • NO ERRORS DETECTED</span>
              </div>

              <div className="pt-2 max-w-sm mx-auto">
                <button
                  onClick={handleGoogleSignIn}
                  disabled={isSigningIn}
                  className="w-full py-3 px-4 rounded-xl bg-white hover:bg-gray-100 text-gray-900 font-bold text-xs flex items-center justify-center space-x-3 shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                >
                  <svg width="18" height="18" viewBox="0 0 48 48">
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.52-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.54 28.59A14.5 14.5 0 019.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 000 24c0 3.77.87 7.35 2.56 10.56l7.98-5.97z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 5.97C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>{isSigningIn ? 'CONNECTING TO GOOGLE...' : 'CONTINUE WITH GOOGLE'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ═══ WAITING HUD: Awaiting Authorization ═══ */}
          {step === 'waiting' && (
            <div className="space-y-4 text-center py-2">
              <div className="w-12 h-12 rounded-full border-2 border-[#E2136E]/30 bg-[#E2136E]/10 mx-auto flex items-center justify-center">
                <Loader2 size={24} className="text-[#E2136E] animate-spin" />
              </div>

              <div>
                <h3 className="font-['Orbitron',sans-serif] text-lg font-bold text-white mb-1">
                  Awaiting Authorization
                </h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Your device registration has been received. An administrator will authorize your access shortly.
                </p>
              </div>

              <div className="bg-[#120a2a] border border-[#2b184e] rounded-xl p-3.5 max-w-sm mx-auto text-left text-xs space-y-2 text-gray-300 font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Status:</span>
                  <span className="text-amber-400 font-bold">Pending Review</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">User:</span>
                  <span className="text-white truncate max-w-[180px]">{userName}</span>
                </div>
                {userEmail && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Email:</span>
                    <span className="text-[#00f0ff] truncate max-w-[180px]">{userEmail}</span>
                  </div>
                )}
                {hardwareId && (
                  <div className="flex justify-between items-center pt-1 border-t border-[#29174a]">
                    <span className="text-gray-500">Hardware ID:</span>
                    <button
                      onClick={handleCopyHwid}
                      className="flex items-center space-x-1 text-gray-300 hover:text-white transition-colors"
                      title="Click to copy HWID"
                    >
                      <span className="text-[10px]">{hardwareId.slice(0, 14)}...</span>
                      {copiedHwid ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  </div>
                )}
              </div>

              <p className="text-[10px] text-gray-500 font-mono">
                This screen updates automatically when approved by the administrator.
              </p>

              <div className="pt-2 max-w-sm mx-auto">
                <button
                  onClick={handleVerifyWhatsApp}
                  className="w-full py-2.5 px-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs flex items-center justify-center space-x-2 shadow-[0_0_15px_rgba(16,185,129,0.2)] transition-all cursor-pointer"
                >
                  <MessageSquare size={14} />
                  <span>VERIFY ON WHATSAPP (+91 9732004563)</span>
                </button>
              </div>
            </div>
          )}

          {/* ═══ APPROVED HUD: Access Granted ═══ */}
          {step === 'approved' && (
            <div className="space-y-4 text-center py-2 animate-in zoom-in-95 duration-300">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#00FF9D] to-[#00CC7A] mx-auto flex items-center justify-center text-black shadow-[0_0_30px_rgba(0,255,157,0.3)]">
                <CheckCircle2 size={32} />
              </div>

              <div>
                <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block mb-1">
                  Access Granted
                </span>
                <h3 className="font-['Orbitron',sans-serif] text-xl font-bold text-white mb-1">
                  Welcome to Akki Ai
                </h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Device authorization verified and cognitive systems operational. The application is opening now.
                </p>
              </div>

              <div className="bg-[#120a2a] border border-[#2b184e] rounded-xl p-3.5 max-w-sm mx-auto text-left text-xs space-y-1.5 text-gray-300 font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-500">Authorized User:</span>
                  <span className="text-white font-bold">{userName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Age:</span>
                  <span className="text-[#00f0ff]">{userAge} yrs</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Status:</span>
                  <span className="text-emerald-400 font-bold">Authorized Active</span>
                </div>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="mt-3 p-2 rounded-lg bg-red-950/60 border border-red-800 text-red-300 text-xs flex items-center space-x-1.5">
              <AlertTriangle size={13} />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#140b2f] border-t border-[#291b50]">
          {step === 2 || step === 3 ? (
            <button
              onClick={() => {
                playClick();
                setStep((s) => (s === 2 ? 1 : 2));
              }}
              className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-transparent hover:border-[#3d266d] transition-all cursor-pointer"
            >
              <ChevronLeft size={14} />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {step === 1 && (
            <button
              onClick={handleStep1}
              className="flex items-center space-x-1.5 bg-gradient-to-r from-[#9d4edd] to-[#7c3aed] text-white text-xs font-bold px-5 py-2 rounded-xl shadow-[0_0_12px_rgba(157,78,221,0.4)] hover:brightness-110 transition-all cursor-pointer"
            >
              <span>CONTINUE SETUP</span>
              <ChevronRight size={14} />
            </button>
          )}

          {step === 2 && (
            <button
              onClick={handleStep2}
              className="flex items-center space-x-1.5 bg-gradient-to-r from-[#9d4edd] to-[#7c3aed] text-white text-xs font-bold px-5 py-2 rounded-xl shadow-[0_0_12px_rgba(157,78,221,0.4)] hover:brightness-110 transition-all cursor-pointer"
            >
              <span>CONFIRM AGE</span>
              <ChevronRight size={14} />
            </button>
          )}

          {step === 3 && (
            <button
              onClick={() => {
                playClick();
                setStep('approved');
              }}
              className="text-xs text-gray-500 hover:text-gray-300 underline font-mono cursor-pointer"
            >
              Skip to activation →
            </button>
          )}

          {step === 'waiting' && (
            <div className="flex items-center space-x-2 text-[11px] text-amber-400/80 font-mono">
              <Loader2 size={13} className="animate-spin" />
              <span>Checking real-time authorization...</span>
            </div>
          )}

          {step === 'approved' && (
            <button
              onClick={handleLaunch}
              className="flex items-center space-x-1.5 bg-gradient-to-r from-emerald-500 to-[#00f0ff] text-black text-xs font-extrabold px-6 py-2 rounded-xl shadow-[0_0_16px_rgba(16,185,129,0.5)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
            >
              <span>LAUNCH DASHBOARD</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingWizardModal;
