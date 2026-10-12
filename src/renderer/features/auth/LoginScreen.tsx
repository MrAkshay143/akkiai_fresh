import React, { useState, useEffect } from 'react';
import { Lock, RefreshCw, LogOut, Copy, Check, MessageSquare, ShieldAlert } from 'lucide-react';
import { useAppStore } from '../../state/useAppStore';

export const LoginScreen: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [checkingApproval, setCheckingApproval] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [hardwareId, setHardwareId] = useState<string>('');
  const [isLocked, setIsLocked] = useState(false);
  const setIsAuthenticated = useAppStore(state => state.setIsAuthenticated);

  // Check stored session / access on mount
  useEffect(() => {
    checkSession();
    fetchHardwareId();

    const unsub = (window as any).electronAPI?.on?.('license-status-changed', (data: any) => {
      if (data?.status === 'approved') {
        setIsAuthenticated(true);
      } else if (data?.status === 'blocked') {
        setIsLocked(true);
      }
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [setIsAuthenticated]);

  // While locked/pending approval, poll Hostinger backend every 3 seconds for real-time unlock
  useEffect(() => {
    if (!isLocked) return;
    const interval = setInterval(async () => {
      try {
        if ((window as any).electronAPI?.invoke) {
          const res = await (window as any).electronAPI.invoke('auth-check-access');
          if (res && (res.access || res.approved)) {
            setIsAuthenticated(true);
          }
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [isLocked, setIsAuthenticated]);

  const fetchHardwareId = async () => {
    try {
      if ((window as any).electronAPI?.invoke) {
        const id = await (window as any).electronAPI.invoke('license-get-hardware-id');
        if (id) setHardwareId(id);
      }
    } catch {}
  };

  const checkSession = async () => {
    try {
      if ((window as any).electronAPI?.invoke) {
        const res = await (window as any).electronAPI.invoke('auth-check-access');
        if (res && res.user && res.user.email) {
          setUserEmail(res.user.email);
          if (res.access || res.approved) {
            setIsAuthenticated(true);
          } else {
            setIsLocked(true);
          }
        }
      }
    } catch (err) {
      console.warn('[LoginScreen] Error checking access:', err);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const result = await (window as any).electronAPI.invoke('auth-start-callback-server');
      if (result && result.success) {
        if (result.user?.email) {
          setUserEmail(result.user.email);
        }
        // Re-check access to see if user is pre-approved or locked
        const accessCheck = await (window as any).electronAPI.invoke('auth-check-access');
        if (accessCheck && (accessCheck.access || accessCheck.approved)) {
          setIsAuthenticated(true);
        } else {
          setIsLocked(true);
        }
      } else {
        console.error('Login failed:', result?.error);
      }
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckApproval = async () => {
    setCheckingApproval(true);
    try {
      const res = await (window as any).electronAPI.invoke('auth-check-access');
      if (res && (res.access || res.approved)) {
        setIsAuthenticated(true);
      }
    } catch (err) {
      console.error('Approval check error:', err);
    } finally {
      setCheckingApproval(false);
    }
  };

  const handleVerifyWhatsApp = async () => {
    try {
      if ((window as any).electronAPI?.invoke) {
        await (window as any).electronAPI.invoke('license-open-whatsapp', { email: userEmail });
      } else {
        const text = `Hello Akki Ai Support,\n\nPlease activate my account:\nEmail: ${userEmail}\nHardware ID: ${hardwareId}`;
        window.open(`https://wa.me/919732004563?text=${encodeURIComponent(text)}`, '_blank');
      }
    } catch {}
  };

  const handleCopyHwId = () => {
    if (!hardwareId) return;
    navigator.clipboard.writeText(hardwareId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      if ((window as any).electronAPI?.invoke) {
        await (window as any).electronAPI.invoke('auth-logout-device');
      }
    } catch {}
    setTimeout(() => {
      setUserEmail('');
      setIsLocked(false);
      setDisconnecting(false);
    }, 1500);
  };

  return (
    <div className="relative flex flex-col items-center justify-center w-screen h-screen bg-[#070510] text-gray-100 font-sans select-none overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Disconnecting Overlay */}
      {disconnecting && (
        <div className="absolute inset-0 z-50 bg-[#070510]/95 backdrop-blur-md flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-300">
          <div className="w-12 h-12 rounded-full border border-red-500/30 bg-red-500/10 flex items-center justify-center">
            <LogOut size={20} className="text-red-400 animate-pulse" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="text-base font-semibold text-white">Disconnecting Session</h3>
            <p className="text-xs text-gray-400 font-mono">Securing workspace and cleaning local device configurations...</p>
          </div>
        </div>
      )}

      {/* Top Banner for Locked Mode */}
      {isLocked && (
        <div className="absolute top-8 flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-mono tracking-widest uppercase">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          SYSTEM MODE: SLEEP / VERIFICATION REQUIRED
        </div>
      )}

      {isLocked ? (
        /* Legacy rk: Locked / Pending Approval Screen */
        <div className="relative z-10 flex flex-col items-center max-w-md w-full px-6 text-center space-y-6 animate-in zoom-in-95 duration-300">
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 bg-[#FF3B30]/15 blur-2xl rounded-full scale-150 animate-pulse pointer-events-none" />
            <div className="relative w-16 h-16 rounded-2xl bg-[#FF3B30]/10 border border-[#FF3B30]/30 flex items-center justify-center shadow-[0_0_30px_rgba(255,59,48,0.2)]">
              <ShieldAlert className="w-8 h-8 text-[#FF3B30]" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              AKKI CORE LOCKED
            </h2>
            <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
              AKKI core features are locked. Activate your license or get whitelisted to resume access.
            </p>
          </div>

          {/* User & Hardware ID Box */}
          <div className="w-full p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2 text-left font-mono">
            {userEmail && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-500 uppercase tracking-wider">Account</span>
                <span className="text-cyan-400 font-medium truncate max-w-[220px]">{userEmail}</span>
              </div>
            )}
            {hardwareId && (
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
                <span className="text-gray-500 uppercase tracking-wider">HW-ID</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-300">{hardwareId.slice(0, 12)}...</span>
                  <button
                    onClick={handleCopyHwId}
                    type="button"
                    className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                    title="Copy Hardware ID"
                  >
                    {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="w-full space-y-3 pt-2">
            <button
              onClick={handleVerifyWhatsApp}
              type="button"
              className="w-full py-3.5 border border-emerald-500/30 hover:border-emerald-500/60 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-bold rounded-xl transition-all text-xs tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.15)]"
            >
              <MessageSquare size={14} />
              <span>VERIFY ON WHATSAPP</span>
            </button>

            <button
              onClick={handleCheckApproval}
              disabled={checkingApproval}
              type="button"
              className="w-full py-3.5 border border-white/10 hover:border-white/25 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl transition-all text-xs tracking-widest uppercase flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={checkingApproval ? 'animate-spin' : ''} />
              <span>{checkingApproval ? 'CHECKING APPROVAL...' : 'CHECK SYSTEM APPROVAL'}</span>
            </button>

            <button
              onClick={handleDisconnect}
              type="button"
              className="w-full py-2.5 text-white/40 hover:text-red-400 transition-colors text-[11px] font-mono tracking-widest uppercase flex items-center justify-center gap-1.5 cursor-pointer bg-transparent border-none mt-2"
            >
              <LogOut size={13} />
              <span>DISCONNECT ACCOUNT</span>
            </button>
          </div>
        </div>
      ) : (
        /* Standard Google Sign In */
        <div className="relative z-10 flex flex-col items-center space-y-6">
          <h1 className="text-4xl font-bold tracking-widest text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]">
            AKKI AI - AUTHORIZED PERSONNEL ONLY
          </h1>
          <p className="text-sm tracking-[0.2em] text-gray-400 uppercase font-mono">
            VERIFIED BUILD · NO ERRORS DETECTED
          </p>
          
          <button
            onClick={handleLogin}
            disabled={loading}
            className="flex items-center space-x-3 bg-gray-800 hover:bg-gray-700 text-white py-3.5 px-7 rounded-xl transition-all border border-gray-600 hover:border-cyan-400/50 disabled:opacity-50 mt-8 shadow-lg hover:shadow-cyan-500/10 cursor-pointer active:scale-95"
          >
            <svg className="w-5 h-5" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            <span className="font-semibold text-base">
              {loading ? 'Authenticating...' : 'Sign In with Google'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

export default LoginScreen;

