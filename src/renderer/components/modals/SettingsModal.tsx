import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Settings,
  Cpu,
  User,
  Radio,
  Sparkles,
  RefreshCw,
  MessageSquare,
  Key,
  Eye,
  EyeOff,
  Check,
  CheckCircle,
  ExternalLink,
  LogOut,
  Loader2,
  Info,
  ShieldCheck,
  QrCode,
  Flame,
  Wrench,
} from 'lucide-react';
import { useAppStore } from '@/state/useAppStore';
import { useAudio } from '@/shared/hooks/useAudio';

interface UserProfileData {
  name?: string;
  location?: string;
  profession?: string;
  bio?: string;
  [key: string]: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT Ok: WhatsApp Remote Link Tab
// ─────────────────────────────────────────────────────────────────────────────

const WhatsAppTab: React.FC<{ electronAPI?: any; playClick: () => void }> = ({
  electronAPI,
  playClick,
}) => {
  const [waState, setWaState] = useState<{
    status: string;
    reason?: string | null;
    isReady?: boolean;
    isInitializing?: boolean;
    qrCode?: string | null;
    qrError?: string | null;
    qrGeneratedAt?: number | null;
    reconnectAttempts?: number;
  }>({
    status: 'disconnected',
    isReady: false,
    isInitializing: false,
    qrCode: null,
    qrError: null,
    reconnectAttempts: 0,
  });

  const [autoConnect, setAutoConnect] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const pollTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!electronAPI) return;

    electronAPI.invoke?.('whatsapp-get-state')?.then((state: any) => {
      if (state) setWaState(state);
    });

    const unsubscribe = electronAPI.on?.('whatsapp-event', (data: any) => {
      if (!data?.event) return;
      if (data.event === 'status') {
        setWaState((prev) => ({
          ...prev,
          status: data.data.status,
          reason: data.data.reason || null,
          reconnectAttempts: data.data.reconnectAttempts ?? prev.reconnectAttempts,
          isReady: data.data.status === 'connected',
          isInitializing: data.data.status === 'initializing',
        }));
      } else if (data.event === 'qr') {
        setWaState((prev) => ({
          ...prev,
          qrCode: data.data.qrCode,
          qrError: null,
          status: 'scan_qr',
        }));
      } else if (data.event === 'qr-error') {
        setWaState((prev) => ({ ...prev, qrError: data.data.error, qrCode: null }));
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [electronAPI]);

  const handleInit = async () => {
    playClick();
    setIsLoading(true);
    try {
      const res = await electronAPI?.invoke?.('whatsapp-init');
      if (res?.state) setWaState(res.state);
    } catch (e) {
      console.error('[WhatsApp UI] Init error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    playClick();
    setIsLoading(true);
    try {
      await electronAPI?.invoke?.('whatsapp-logout');
      setWaState({
        status: 'disconnected',
        isReady: false,
        isInitializing: false,
        qrCode: null,
        qrError: null,
        reconnectAttempts: 0,
      });
    } catch (e) {
      console.error('[WhatsApp UI] Logout error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const isConnected = waState.status === 'connected' && waState.isReady;
  const isScanning = waState.status === 'scan_qr' && !!waState.qrCode;
  const isInitializing = waState.status === 'initializing' || waState.isInitializing || isLoading;

  return (
    <div className="space-y-4">
      <div className="p-5 rounded-2xl border border-white/5 bg-white/[0.01] flex flex-col items-center text-center space-y-4">
        {isConnected ? (
          <div className="space-y-3 py-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle size={28} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">WhatsApp Connected & Active</h4>
              <p className="text-[11px] text-emerald-400/80 font-mono mt-1">Status: READY · REMOTE LINKED</p>
            </div>
            <button
              onClick={handleLogout}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-all mt-2"
            >
              Disconnect Session
            </button>
          </div>
        ) : isScanning ? (
          <div className="space-y-3 py-2 flex flex-col items-center">
            <div className="p-3 bg-white rounded-xl shadow-lg">
              <img
                src={waState.qrCode || ''}
                alt="WhatsApp QR Code"
                className="w-48 h-48 object-contain"
              />
            </div>
            <p className="text-xs font-semibold text-white">Scan this QR Code with WhatsApp</p>
            <p className="text-[10px] text-white/40 max-w-xs leading-normal">
              Open WhatsApp on your phone → Linked Devices → Link a Device.
            </p>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] text-white/50 hover:text-white"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="space-y-4 py-4 flex flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-[#25D366]/10 border border-[#25D366]/20 flex items-center justify-center text-[#25D366]">
              <QrCode size={26} />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-white">No WhatsApp Device Linked</h4>
              <p className="text-[11px] text-white/40 max-w-sm leading-normal">
                Connect your WhatsApp account to enable remote queries, notes recording, and automated voice summaries on your personal chat.
              </p>
            </div>
            <button
              onClick={handleInit}
              disabled={isInitializing}
              className="px-6 py-2.5 rounded-xl bg-[#25D366] text-black font-bold text-xs hover:bg-[#25D366]/90 transition-all shadow-[0_0_20px_rgba(37,211,102,0.25)] flex items-center gap-2"
            >
              {isInitializing ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Initializing...
                </>
              ) : (
                'Link WhatsApp Web'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT Kk: Hermes & Model Config (Provider, Pills, Codex Device Handshake)
// ─────────────────────────────────────────────────────────────────────────────

interface KkProps {
  provider: 'gemini' | 'openrouter' | 'openai-codex';
  setProvider: (p: 'gemini' | 'openrouter' | 'openai-codex') => void;
  apiKey: string;
  setApiKey: (k: string) => void;
  modelId: string;
  setModelId: (m: string) => void;
  playClick: () => void;
  electronAPI: any;
}

const MkSuggestions = [
  'google/gemini-3.1-flash-lite',
  'google/gemini-3.5-flash',
  'anthropic/claude-sonnet-4.6',
  'openai/gpt-5.5',
  'moonshotai/kimi-k2.5',
];

const JkSuggestions = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
];

const ModelConfigTab: React.FC<KkProps> = ({
  provider,
  setProvider,
  apiKey,
  setApiKey,
  modelId,
  setModelId,
  playClick,
  electronAPI,
}) => {
  const [showKey, setShowKey] = useState(false);
  const [codexAuth, setCodexAuth] = useState<boolean | null>(null);
  const [codexState, setCodexState] = useState<'idle' | 'starting' | 'polling' | 'complete' | 'error'>('idle');
  const [codexCode, setCodexCode] = useState('');
  const [codexUrl, setCodexUrl] = useState('');
  const [codexError, setCodexError] = useState('');

  const isOpenRouter = provider === 'openrouter';
  const isGemini = provider === 'gemini';
  const isCodex = provider === 'openai-codex';

  const suggestionPills = isOpenRouter ? MkSuggestions : JkSuggestions;
  const keyPlaceholder = isOpenRouter ? 'sk-or-v1-...' : 'Your Gemini API key';
  const modelPlaceholder = isOpenRouter ? 'google/gemini-3.5-flash' : 'gemini-3.5-flash';
  const keyLink = isOpenRouter ? 'https://openrouter.ai/keys' : 'https://aistudio.google.com/app/apikey';

  const checkCodexAuth = useCallback(async () => {
    if (!electronAPI) return;
    try {
      const res = await electronAPI.invoke?.('get-codex-auth-status');
      setCodexAuth(!!(res && res.authenticated));
    } catch {
      setCodexAuth(false);
    }
  }, [electronAPI]);

  useEffect(() => {
    checkCodexAuth();
  }, [checkCodexAuth, provider]);

  useEffect(() => {
    if (!electronAPI) return;
    const unsub = electronAPI.on?.('codex-login-complete', (payload: any) => {
      console.log('[AKKI UI] Codex login complete payload:', payload);
      if (payload?.success) {
        setCodexState('complete');
        setCodexAuth(true);
        setModelId('gpt-5.5');
      } else {
        setCodexState('error');
        setCodexError(payload?.error || 'Authentication process failed.');
      }
    });
    return () => {
      if (unsub) unsub();
    };
  }, [electronAPI, setModelId]);

  const handleStartCodexLogin = async () => {
    if (codexState === 'starting' || codexState === 'polling') return;
    playClick();
    setCodexState('starting');
    setCodexError('');
    try {
      const res = await electronAPI?.invoke?.('start-codex-login');
      if (res && res.success) {
        setCodexCode(res.code);
        setCodexUrl(res.url || 'https://auth.openai.com/codex/device');
        setCodexState('polling');
      } else {
        setCodexState('error');
        setCodexError(res?.error || 'Failed to initialize device code flow.');
      }
    } catch (err: any) {
      setCodexState('error');
      setCodexError(err?.message || 'Unexpected error occurred.');
    }
  };

  const handleCancelCodexLogin = async () => {
    playClick();
    try {
      await electronAPI?.invoke?.('cancel-codex-login');
    } catch {}
    setCodexState('idle');
    checkCodexAuth();
  };

  const handleOpenCodexUrl = () => {
    playClick();
    if (electronAPI && codexUrl) {
      electronAPI.invoke?.('open-external-link', codexUrl);
    }
  };

  const isConfigured = isCodex
    ? codexAuth === true
    : apiKey.trim().length > 0 && modelId.trim().length > 0;

  return (
    <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] space-y-6">
      {/* Provider Selector Cards */}
      <div className="space-y-3">
        <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">
          Select AI Provider
        </p>
        <div className="grid grid-cols-3 gap-3">
          {/* OpenRouter */}
          <button
            type="button"
            onClick={() => {
              playClick();
              setProvider('openrouter');
              setModelId('google/gemini-3.1-flash-lite');
            }}
            className={`relative p-3 rounded-xl border text-left transition-all duration-300 ${
              isOpenRouter
                ? 'border-purple-500/40 bg-purple-500/[0.08] shadow-[0_0_24px_rgba(168,85,247,0.08)]'
                : 'border-white/5 bg-black/20 hover:border-white/10 hover:bg-white/[0.03]'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div
                className={`p-1.5 rounded-lg transition-colors ${
                  isOpenRouter ? 'bg-purple-500/20' : 'bg-white/5'
                }`}
              >
                <Cpu size={14} className={isOpenRouter ? 'text-purple-400' : 'text-white/30'} />
              </div>
              {isOpenRouter && (
                <div className="w-3.5 h-3.5 rounded-full bg-purple-400 flex items-center justify-center">
                  <Check size={8} className="text-black" />
                </div>
              )}
            </div>
            <p className={`text-xs font-semibold transition-colors ${isOpenRouter ? 'text-white' : 'text-white/50'}`}>
              OpenRouter
            </p>
            <p className="text-[9px] text-white/25 mt-0.5 leading-none">200+ models</p>
          </button>

          {/* Google Gemini */}
          <button
            type="button"
            onClick={() => {
              playClick();
              setProvider('gemini');
              setModelId('gemini-3.1-flash-lite');
            }}
            className={`relative p-3 rounded-xl border text-left transition-all duration-300 ${
              isGemini
                ? 'border-blue-500/40 bg-blue-500/[0.08] shadow-[0_0_24px_rgba(59,130,246,0.08)]'
                : 'border-white/5 bg-black/20 hover:border-white/10 hover:bg-white/[0.03]'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div
                className={`p-1.5 rounded-lg transition-colors ${
                  isGemini ? 'bg-blue-500/20' : 'bg-white/5'
                }`}
              >
                <Sparkles size={14} className={isGemini ? 'text-blue-400' : 'text-white/30'} />
              </div>
              {isGemini && (
                <div className="w-3.5 h-3.5 rounded-full bg-blue-400 flex items-center justify-center">
                  <Check size={8} className="text-black" />
                </div>
              )}
            </div>
            <p className={`text-xs font-semibold transition-colors ${isGemini ? 'text-white' : 'text-white/50'}`}>
              Google Gemini
            </p>
            <p className="text-[9px] text-white/25 mt-0.5 leading-none">Direct API</p>
          </button>

          {/* ChatGPT Plus/Pro */}
          <button
            type="button"
            onClick={() => {
              playClick();
              setProvider('openai-codex');
              setModelId('gpt-5.5');
            }}
            className={`relative p-3 rounded-xl border text-left transition-all duration-300 ${
              isCodex
                ? 'border-emerald-500/40 bg-emerald-500/[0.08] shadow-[0_0_24px_rgba(16,185,129,0.08)]'
                : 'border-white/5 bg-black/20 hover:border-white/10 hover:bg-white/[0.03]'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div
                className={`p-1.5 rounded-lg transition-colors ${
                  isCodex ? 'bg-emerald-500/20' : 'bg-white/5'
                }`}
              >
                <Cpu size={14} className={isCodex ? 'text-emerald-400' : 'text-white/30'} />
              </div>
              {isCodex && (
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-400 flex items-center justify-center">
                  <Check size={8} className="text-black" />
                </div>
              )}
            </div>
            <p className={`text-xs font-semibold transition-colors ${isCodex ? 'text-white' : 'text-white/50'}`}>
              ChatGPT Plus/Pro
            </p>
            <p className="text-[9px] text-white/25 mt-0.5 leading-none">Subscription</p>
          </button>
        </div>
      </div>

      <div className="border-t border-white/5" />

      {/* Provider Details Form */}
      {isCodex ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-emerald-500/10 bg-emerald-500/[0.02] flex items-start gap-3">
            <Cpu size={14} className="text-emerald-400 mt-0.5 flex-shrink-0 animate-pulse" />
            <div className="space-y-1">
              <h4 className="text-[11px] font-semibold text-emerald-300">
                ChatGPT Pro/Plus Engine Integration
              </h4>
              <p className="text-[10px] text-white/40 leading-normal font-light">
                Is feature se Agent Town aur Chat Window ke sabhi agents aapke personal ChatGPT Pro browser account ke backend ko use karenge. Is option ke liye paid ChatGPT account hona zaroori hai.
              </p>
            </div>
          </div>

          {codexAuth === null ? (
            <div className="p-8 rounded-xl border border-white/5 bg-black/40 flex items-center justify-center gap-2">
              <Loader2 size={16} className="text-[#00e5ff] animate-spin" />
              <span className="text-xs text-white/40">Checking connection status...</span>
            </div>
          ) : codexAuth && codexState !== 'polling' ? (
            <div className="p-5 rounded-xl border border-emerald-500/15 bg-black/40 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Check size={16} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Connected & Authorized</p>
                  <p className="text-[10px] text-white/30">Your ChatGPT Pro session is successfully linked</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleStartCodexLogin}
                  className="px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 bg-white/[0.02] text-[10px] font-medium text-white/60 hover:text-white transition-all"
                >
                  Re-connect / Refresh Session
                </button>
              </div>
            </div>
          ) : codexState === 'polling' ? (
            <div className="p-6 rounded-xl border border-[#00e5ff]/20 bg-black/50 space-y-6">
              <div className="space-y-2 text-center">
                <h4 className="text-xs font-semibold text-white tracking-tight uppercase">
                  Authorize Device Handshake
                </h4>
                <p className="text-[10px] text-white/45 max-w-sm mx-auto leading-normal">
                  Apne browser me link open karein aur neeche diya gaya verification code enter karein login process complete karne ke liye.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 text-center space-y-1">
                <span className="text-[9px] uppercase font-bold tracking-widest text-white/30">
                  Verification Code
                </span>
                <p className="text-2xl font-mono font-bold text-[#00e5ff] tracking-wider select-all">
                  {codexCode}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2.5 text-xs text-white/40">
                <Loader2 size={13} className="text-[#00e5ff] animate-spin" />
                <span>Waiting for browser handshake approval...</span>
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                <button
                  type="button"
                  onClick={handleOpenCodexUrl}
                  className="w-full py-2.5 rounded-xl bg-[#00e5ff] text-black hover:bg-[#00e5ff]/90 text-xs font-bold transition-all shadow-[0_0_20px_rgba(0,229,255,0.2)] flex items-center justify-center gap-1.5"
                >
                  Open Verification Page <ExternalLink size={12} />
                </button>
                <button
                  type="button"
                  onClick={handleCancelCodexLogin}
                  className="w-full py-2.5 rounded-xl border border-white/10 hover:border-white/15 bg-white/[0.02] hover:bg-white/[0.05] text-xs font-semibold text-white/60 hover:text-white transition-all"
                >
                  Cancel Auth
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-xl border border-white/5 bg-black/40 text-center space-y-5">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-white/70">ChatGPT Account Link Required</p>
                <p className="text-[10px] text-white/35 max-w-xs mx-auto leading-normal font-light">
                  Click the button below to retrieve your 8-digit device code and secure authentication callback server link.
                </p>
              </div>
              {codexState === 'starting' ? (
                <button
                  type="button"
                  disabled
                  className="px-6 py-2.5 rounded-xl bg-white/5 border border-white/5 text-white/30 text-xs font-semibold flex items-center gap-2 mx-auto cursor-not-allowed"
                >
                  <Loader2 size={13} className="animate-spin text-[#00e5ff]" /> Requesting User Code...
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartCodexLogin}
                  className="px-6 py-2.5 rounded-xl bg-emerald-500 text-black hover:bg-emerald-400 text-xs font-bold transition-all shadow-[0_0_20px_rgba(16,185,129,0.25)] mx-auto"
                >
                  Connect ChatGPT Account
                </button>
              )}
              {codexState === 'error' && (
                <p className="text-[10px] text-red-400 font-medium">{codexError}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* API Key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-white/50">
                {isOpenRouter ? 'OpenRouter API Key' : 'Gemini API Key'}
              </label>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  electronAPI?.invoke?.('open-external-link', keyLink);
                }}
                className="flex items-center gap-1 text-[10px] text-[#00e5ff]/60 hover:text-[#00e5ff] transition-colors"
              >
                Get Key <ExternalLink size={9} />
              </a>
            </div>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={keyPlaceholder}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-[#00e5ff]/30 focus:ring-1 focus:ring-[#00e5ff]/10 transition-all pr-12 placeholder:text-white/20"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-white/25 hover:text-white/70 transition-colors"
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Model ID & Suggestion Pills */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-white/50">Model ID</label>
              {isOpenRouter && (
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    electronAPI?.invoke?.('open-external-link', 'https://openrouter.ai/models');
                  }}
                  className="flex items-center gap-1 text-[10px] text-[#00e5ff]/60 hover:text-[#00e5ff] transition-colors"
                >
                  Browse Models <ExternalLink size={9} />
                </a>
              )}
            </div>
            <input
              type="text"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder={modelPlaceholder}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-[#00e5ff]/30 focus:ring-1 focus:ring-[#00e5ff]/10 transition-all placeholder:text-white/20"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {suggestionPills.map((pill) => (
                <button
                  key={pill}
                  type="button"
                  onClick={() => {
                    playClick();
                    setModelId(pill);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-all duration-200 ${
                    modelId === pill
                      ? 'bg-[#00e5ff]/15 border-[#00e5ff]/30 text-[#00e5ff]'
                      : 'bg-white/[0.03] border-white/5 text-white/35 hover:border-white/15 hover:text-white/60'
                  }`}
                >
                  {pill}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Status Footer Pill */}
      <div
        className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-300 ${
          isConfigured ? 'bg-[#00e5ff]/[0.04] border-[#00e5ff]/15' : 'bg-black/20 border-white/5'
        }`}
      >
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 transition-all ${
            isConfigured
              ? 'bg-[#00e5ff] animate-pulse shadow-[0_0_8px_rgba(0,229,255,0.5)]'
              : 'bg-white/20'
          }`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-white/55 truncate">
            {isConfigured
              ? isCodex
                ? 'ChatGPT Pro Subscription Active (no api keys)'
                : `${isOpenRouter ? 'OpenRouter' : 'Gemini'} · ${modelId.trim()}`
              : 'Not configured — using Hermes defaults'}
          </p>
          <p className="text-[9px] text-white/25 mt-0.5">
            {isConfigured
              ? 'Agent Town will use this provider and model'
              : 'Set API key and model ID or authorize subscription above to activate'}
          </p>
        </div>
        {isConfigured && <Cpu size={13} className="text-[#00e5ff]/50 flex-shrink-0" />}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: ToolsTab (Per-Tool Models & Keys Config)
// ─────────────────────────────────────────────────────────────────────────────

const ToolsTab: React.FC<{ electronAPI?: any; playClick: () => void }> = ({
  electronAPI,
  playClick,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showHfToken, setShowHfToken] = useState(false);

  const [enableGlobalFallback, setEnableGlobalFallback] = useState(true);
  const [defaultGlobalFallbackModel, setDefaultGlobalFallbackModel] = useState('gemini-3.5-flash-lite');

  const [tools, setTools] = useState<any>({
    web_search: {
      model: 'gemini-3.5-flash-lite',
      fallbackModel: 'gemini-3.5-flash-lite',
      enableFallback: true,
    },
    whatsapp_transcribe: {
      model: 'gemini-3.8-flash',
      fallbackModel: 'gemini-3.5-flash-lite',
      enableFallback: true,
    },
    dashboard_fetch: {
      model: 'gemini-3.8-flash',
      fallbackModel: 'gemini-3.5-flash-lite',
      enableFallback: true,
    },
    subagent_runner: {
      model: 'gemini-3.8-flash',
      fallbackModel: 'gemini-3.5-flash-lite',
      enableFallback: true,
    },
    voice_live: {
      model: 'gemini-3.8-flash-exp',
      fallbackModel: 'gemini-3.8-flash',
      enableFallback: false,
    },
    image_generation: {
      provider: 'huggingface',
      model: 'black-forest-labs/FLUX.1-schnell',
      token: '',
    },
  });

  useEffect(() => {
    if (!electronAPI?.invoke) {
      setLoading(false);
      return;
    }
    electronAPI
      .invoke('get-tools-config')
      .then((cfg: any) => {
        if (cfg) {
          if (cfg.enableGlobalFallback !== undefined) setEnableGlobalFallback(cfg.enableGlobalFallback);
          if (cfg.defaultGlobalFallbackModel) setDefaultGlobalFallbackModel(cfg.defaultGlobalFallbackModel);
          if (cfg.tools) {
            setTools((prev: any) => ({
              ...prev,
              ...cfg.tools,
              image_generation: {
                ...prev.image_generation,
                ...(cfg.tools.image_generation || {}),
              },
            }));
          }
        }
        setLoading(false);
      })
      .catch((e: any) => {
        console.warn('Failed to load tools config:', e);
        setLoading(false);
      });
  }, [electronAPI]);

  const handleSave = async () => {
    playClick();
    setSaving(true);
    try {
      const fullConfig = {
        version: 1,
        enableGlobalFallback,
        defaultGlobalFallbackModel,
        tools,
      };
      await electronAPI?.invoke?.('save-tools-config', fullConfig);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (e) {
      console.warn('Failed to save tools config:', e);
    } finally {
      setSaving(false);
    }
  };

  const updateTool = (toolName: string, field: string, value: any) => {
    setTools((prev: any) => ({
      ...prev,
      [toolName]: {
        ...prev[toolName],
        [field]: value,
      },
    }));
  };

  const modelOptions = [
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-3.8-flash-exp',
  ];

  const toolDisplayList = [
    {
      key: 'web_search',
      title: 'Web & Live Market Search',
      desc: 'Google Search grounding, web scraping, and live financial data queries',
    },
    {
      key: 'whatsapp_transcribe',
      title: 'WhatsApp Voice Transcribe',
      desc: 'High-accuracy neural transcription for incoming WhatsApp voice messages',
    },
    {
      key: 'dashboard_fetch',
      title: 'Dashboard & System Fetch',
      desc: 'System health metrics, Arduino serial telemetry, and local desktop queries',
    },
    {
      key: 'subagent_runner',
      title: 'Sub-Agent Autonomous Runner',
      desc: 'Dedicated inference model for Leo, Rancho, Raju, and Chatur task execution',
    },
    {
      key: 'voice_live',
      title: 'Gemini Live Voice Session',
      desc: 'Bidirectional ultra-low-latency real-time voice streaming with interruption support',
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-white/40 space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-[#00e5ff]" />
        <span className="text-xs font-mono">Loading tools configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header & Description */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white/90">Tools & Model Routing</h3>
          <p className="text-[11px] text-white/40 mt-0.5">
            Configure per-tool AI model assignments, automatic fallback models, and image tokens
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-gradient-to-r from-[#00e5ff] to-[#00b8d4] hover:from-[#33ebff] hover:to-[#00c8e0] text-black font-semibold text-xs rounded-xl shadow-[0_0_20px_rgba(0,229,255,0.25)] flex items-center gap-1.5 transition-all disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : savedSuccess ? (
            <CheckCircle className="w-3.5 h-3.5 text-black" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          {saving ? 'Saving...' : savedSuccess ? 'Config Saved!' : 'Save Config'}
        </button>
      </div>

      {/* Global Fallback Card */}
      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-white/80">Global Model Fallback</div>
            <div className="text-[10px] text-white/40">
              When a primary model experiences rate-limits or 503 outages, automatically switch to backup
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              playClick();
              setEnableGlobalFallback((prev) => !prev);
            }}
            className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
              enableGlobalFallback ? 'bg-[#00e5ff]' : 'bg-white/10'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                enableGlobalFallback ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {enableGlobalFallback && (
          <div className="pt-2 border-t border-white/5 flex items-center gap-3">
            <span className="text-[11px] text-white/60 whitespace-nowrap">Default Fallback Model:</span>
            <select
              value={defaultGlobalFallbackModel}
              onChange={(e) => setDefaultGlobalFallbackModel(e.target.value)}
              className="bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white/90 focus:outline-none focus:border-[#00e5ff]/50"
            >
              {modelOptions.map((m) => (
                <option key={m} value={m} className="bg-[#111] text-white">
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Per-Tool Models List */}
      <div className="space-y-3">
        <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider px-1">
          Per-Tool Model Assignment
        </div>

        {toolDisplayList.map((item) => {
          const cfg = tools[item.key] || {
            model: 'gemini-3.5-flash-lite',
            fallbackModel: 'gemini-3.5-flash-lite',
            enableFallback: true,
          };
          return (
            <div
              key={item.key}
              className="p-3.5 rounded-xl bg-white/[0.015] border border-white/5 hover:border-white/10 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="space-y-0.5 max-w-sm">
                <div className="text-xs font-medium text-white/85">{item.title}</div>
                <div className="text-[10px] text-white/40 leading-relaxed">{item.desc}</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Primary Model */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-white/40">Model:</span>
                  <select
                    value={cfg.model || 'gemini-3.5-flash-lite'}
                    onChange={(e) => updateTool(item.key, 'model', e.target.value)}
                    className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-[#00e5ff] font-mono focus:outline-none focus:border-[#00e5ff]/50"
                  >
                    {modelOptions.map((m) => (
                      <option key={m} value={m} className="bg-[#111] text-white">
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Fallback Model */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-white/40">Fallback:</span>
                  <select
                    value={cfg.fallbackModel || 'gemini-3.5-flash-lite'}
                    onChange={(e) => updateTool(item.key, 'fallbackModel', e.target.value)}
                    className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-amber-400 font-mono focus:outline-none focus:border-amber-400/50"
                  >
                    {modelOptions.map((m) => (
                      <option key={m} value={m} className="bg-[#111] text-white">
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Fallback Switch */}
                <button
                  type="button"
                  title="Enable Fallback for this tool"
                  onClick={() => {
                    playClick();
                    updateTool(item.key, 'enableFallback', !cfg.enableFallback);
                  }}
                  className={`w-7 h-4 rounded-full p-0.5 transition-colors ${
                    cfg.enableFallback !== false ? 'bg-amber-400' : 'bg-white/10'
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-black transition-transform ${
                      cfg.enableFallback !== false ? 'translate-x-3' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Image Generation Config */}
      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-white/85">Neural Image Generation (FLUX.1 Schnell)</div>
            <div className="text-[10px] text-white/40">
              Black Forest Labs FLUX.1 high-speed image diffusion model hosted on Hugging Face Inference
            </div>
          </div>
          <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-md text-[10px] font-mono">
            HuggingFace
          </span>
        </div>

        <div className="pt-2 border-t border-white/5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-white/60 whitespace-nowrap">Model Target:</span>
            <input
              type="text"
              readOnly
              value={tools.image_generation?.model || 'black-forest-labs/FLUX.1-schnell'}
              className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white/70 font-mono w-full focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-white/60 whitespace-nowrap">API Token:</span>
            <div className="relative w-full">
              <input
                type={showHfToken ? 'text' : 'password'}
                placeholder="hf_..."
                value={tools.image_generation?.token || ''}
                onChange={(e) =>
                  setTools((prev: any) => ({
                    ...prev,
                    image_generation: {
                      ...prev.image_generation,
                      token: e.target.value,
                    },
                  }))
                }
                className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white/90 font-mono focus:outline-none focus:border-[#00e5ff]/50 pr-8"
              />
              <button
                type="button"
                onClick={() => setShowHfToken((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70"
              >
                {showHfToken ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SettingsModal COMPONENT (Matches Sk)
// ─────────────────────────────────────────────────────────────────────────────

export const SettingsModal: React.FC = () => {
  const { activeModal, setActiveModal, setIsGuideModalOpen, setGuideFromSettings } = useAppStore();
  const { playClick, playAccessGranted } = useAudio();

  const electronAPI = (window as any).electronAPI;

  // Tabs
  const [activeTab, setActiveTab] = useState<
    'voice' | 'agent_town' | 'tools' | 'setup_guide' | 'system' | 'profile' | 'whatsapp'
  >('voice');

  // Voice tab states
  const [geminiKey, setGeminiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [voicePersona, setVoicePersona] = useState('Charon');
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [subAgentOverride, setSubAgentOverride] = useState(false);
  const [subAgentOpenRouterKey, setSubAgentOpenRouterKey] = useState('');
  const [showSubAgentKey, setShowSubAgentKey] = useState(false);
  const [subAgentModelId, setSubAgentModelId] = useState('google/gemini-3.1-flash-lite');

  // Agent Town states
  const [agentTownProvider, setAgentTownProvider] = useState<'gemini' | 'openrouter' | 'openai-codex'>('gemini');
  const [agentTownGeminiKey, setAgentTownGeminiKey] = useState('');
  const [agentTownOpenRouterKey, setAgentTownOpenRouterKey] = useState('');
  const [agentTownModelId, setAgentTownModelId] = useState('gemini-3.1-flash-lite');

  // System states
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);

  // Profile states
  const [userEmail, setUserEmail] = useState('');
  const [userProfile, setUserProfile] = useState<UserProfileData>({
    name: 'Akshay',
    location: 'West Bengal, India',
    profession: 'Senior Software Engineer',
    bio: '',
  });
  const [akPhotoURL, setAkPhotoURL] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Common UI states
  const [appVersion, setAppVersion] = useState('2.5.0-STAGE');
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const isOpen = activeModal === 'settings';

  // Toggle Wake Word
  const handleToggleWakeWord = () => {
    playClick();
    const nextVal = !wakeWordEnabled;
    setWakeWordEnabled(nextVal);
    electronAPI?.invoke?.('set-wake-word-enabled', nextVal);
  };

  // Toggle Auto Updates
  const handleToggleAutoUpdate = () => {
    playClick();
    const nextVal = !autoUpdateEnabled;
    setAutoUpdateEnabled(nextVal);
    electronAPI?.invoke?.('save-auto-update-enabled', nextVal);
  };

  // Load on mount / open
  useEffect(() => {
    if (!isOpen || !electronAPI) return;

    electronAPI.invoke?.('get-app-version')?.then((v: string) => {
      if (v) setAppVersion(v);
    });

    electronAPI.invoke?.('get-gemini-token')?.then((k: string) => {
      if (k) setGeminiKey(k);
    });

    electronAPI.invoke?.('get-openrouter-token')?.then((k: string) => {
      if (k) setSubAgentOpenRouterKey(k);
    });

    electronAPI.invoke?.('get-sub-agent-config')?.then((cfg: any) => {
      if (cfg) {
        setSubAgentOverride(!!cfg.enabled);
        if (cfg.modelId) setSubAgentModelId(cfg.modelId);
      }
    });

    electronAPI.invoke?.('get-agent-town-config')?.then((cfg: any) => {
      if (cfg) {
        const prov = cfg.provider === 'openrouter' ? 'openrouter' : cfg.provider === 'openai-codex' ? 'openai-codex' : 'gemini';
        setAgentTownProvider(prov);
        if (cfg.geminiApiKey) setAgentTownGeminiKey(cfg.geminiApiKey);
        if (cfg.openRouterApiKey) setAgentTownOpenRouterKey(cfg.openRouterApiKey);
        if (cfg.modelId) setAgentTownModelId(cfg.modelId);
      }
    });

    electronAPI.invoke?.('auth-get-stored')?.then((auth: any) => {
      if (auth?.email) setUserEmail(auth.email);
    });

    electronAPI.invoke?.('get-google-photo-url')?.then((url: string) => {
      if (url) setAkPhotoURL(url);
    });

    electronAPI.invoke?.('get-wake-word-enabled')?.then((w: boolean) => {
      setWakeWordEnabled(!!w);
    });

    electronAPI.invoke?.('get-auto-update-enabled')?.then((u: boolean) => {
      setAutoUpdateEnabled(u !== false);
    });

    const savedVoice = localStorage.getItem('GEMINI_VOICE_NAME') || 'Charon';
    setVoicePersona(savedVoice);
  }, [isOpen, electronAPI]);

  // Save Settings
  const handleSave = async () => {
    playClick();
    setIsSaving(true);
    setToastMessage(null);

    try {
      const results = await Promise.all([
        electronAPI?.invoke?.('save-gemini-token', geminiKey),
        electronAPI?.invoke?.('save-voice-assistant-mode', 'unified'),
        electronAPI?.invoke?.('save-openrouter-token', subAgentOpenRouterKey),
        electronAPI?.invoke?.('save-sub-agent-config', {
          enabled: subAgentOverride,
          modelId: subAgentModelId.trim(),
        }),
        electronAPI?.invoke?.('save-agent-town-config', {
          provider: agentTownProvider,
          apiKey: agentTownProvider === 'openrouter' ? agentTownOpenRouterKey.trim() : agentTownGeminiKey.trim(),
          geminiApiKey: agentTownGeminiKey.trim(),
          openRouterApiKey: agentTownOpenRouterKey.trim(),
          modelId: agentTownModelId.trim(),
        }),
      ]);

      localStorage.setItem('GEMINI_VOICE_NAME', voicePersona);

      // Synchronize Soul to SOUL.md
      try {
        const isFemale = voicePersona === 'Despina';
        const maleTemplateId = localStorage.getItem('AKKI_SOUL_MALE_TEMPLATE_ID') || 'loyal_butler';
        const maleCustomText = localStorage.getItem('AKKI_SOUL_MALE_CUSTOM_TEXT') || '';
        const femaleTemplateId = localStorage.getItem('AKKI_SOUL_FEMALE_TEMPLATE_ID') || 'caring_companion';
        const femaleCustomText = localStorage.getItem('AKKI_SOUL_FEMALE_CUSTOM_TEXT') || '';

        let soulContent = '';
        if (isFemale) {
          soulContent = femaleCustomText || 'You are Despina, a caring companion.';
        } else {
          soulContent = maleCustomText || 'You are Charon, a loyal butler companion.';
        }

        if (soulContent) {
          await electronAPI?.invoke?.('write-bootstrap-file', {
            filename: 'SOUL.md',
            content: soulContent,
          });
          console.log('[SettingsModal] Successfully synchronized active soul to SOUL.md');
        }
      } catch (err) {
        console.error('[SettingsModal] Failed to synchronize active soul to SOUL.md:', err);
      }

      const allSuccess = results.every((r) => r === true);
      if (allSuccess) {
        playAccessGranted();
        setToastMessage({ type: 'success', text: 'Settings updated successfully' });
        window.dispatchEvent(new CustomEvent('AKKI-settings-updated'));
        setTimeout(() => setToastMessage(null), 3000);
      } else {
        setToastMessage({ type: 'error', text: 'Error saving configuration' });
      }
    } catch (e) {
      setToastMessage({ type: 'error', text: 'Unexpected error occurred' });
    } finally {
      setIsSaving(false);
    }
  };

  // Secure Logout Flow
  const handleLogout = async () => {
    playClick();
    if (!electronAPI) return;

    setIsLoggingOut(true);
    const startTime = Date.now();

    try {
      if (userEmail) {
        const logoutPromise = electronAPI.invoke?.('auth-logout-device', { email: userEmail });
        const timeoutPromise = new Promise((resolve) =>
          setTimeout(() => resolve({ success: false, error: 'timeout' }), 2500)
        );
        await Promise.race([logoutPromise, timeoutPromise]);
      }
    } catch (e) {
      console.error('Logout request failed:', e);
    }

    try {
      await electronAPI.invoke?.('auth-delete');
      await electronAPI.invoke?.('auth-stop-callback-server');
    } catch (e) {
      console.error('Local cleanup failed:', e);
    }

    localStorage.removeItem('akki_onboarding_seen');
    localStorage.removeItem('akki_onboarding_name');
    localStorage.removeItem('akki_onboarding_age');
    localStorage.removeItem('akki_guide_seen');

    const elapsed = Date.now() - startTime;
    if (elapsed < 1500) {
      await new Promise((r) => setTimeout(r, 1500 - elapsed));
    }

    window.location.reload();
  };

  if (!isOpen) return null;

  const tabsConfig = [
    { id: 'voice', label: 'Voice Assistant', desc: 'Gemini Live & Persona', icon: Radio },
    { id: 'agent_town', label: 'Agent Town', desc: 'Hermes & Model Config', icon: Cpu },
    { id: 'tools', label: 'Tools Config', desc: 'Per-Tool Models & Keys', icon: Wrench },
    { id: 'setup_guide', label: 'Setup Guide', desc: 'How to use Akki Ai', icon: Flame },
    { id: 'system', label: 'System Settings', desc: 'Updates & Performance', icon: Settings },
    { id: 'profile', label: 'User Profile', desc: 'Account & Authentication', icon: User },
    { id: 'whatsapp', label: 'WhatsApp Link', desc: 'Remote Control', icon: MessageSquare },
  ] as const;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={() => setActiveModal(null)} />

      <div className="relative w-full max-w-5xl h-[85vh] max-h-[780px] bg-[#0c0c0c] border border-white/10 rounded-3xl flex flex-col overflow-hidden shadow-[0_0_60px_-15px_rgba(255,255,255,0.12)]">
        {/* Secure Logout Overlay */}
        {isLoggingOut && (
          <div className="absolute inset-0 z-[250] flex flex-col items-center justify-center bg-black/95 backdrop-blur-lg animate-in fade-in duration-300">
            <style
              dangerouslySetInnerHTML={{
                __html: `
                @keyframes shimmer-bar-modal {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(200%); }
                }
                .animate-shimmer-bar-modal {
                  animation: shimmer-bar-modal 1.5s infinite linear;
                }
              `,
              }}
            />
            <div className="flex flex-col items-center max-w-md px-6 text-center space-y-6">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full border-2 border-t-red-500 border-r-transparent border-b-transparent border-l-transparent animate-spin"
                  style={{ animationDuration: '0.8s' }}
                />
                <div className="absolute inset-2 bg-red-500/10 rounded-full blur-md animate-pulse" />
                <div className="relative z-10 w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <LogOut size={20} className="text-red-400 animate-pulse" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-white tracking-tight">Logging Out Securely</h3>
                <p className="text-xs text-white/40 leading-relaxed font-light">
                  Revoking device authorization from AKKI Cloud and clearing credentials cache...
                </p>
              </div>
              <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden relative">
                <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-red-500 to-amber-500 rounded-full animate-shimmer-bar-modal w-1/2" />
              </div>
            </div>
          </div>
        )}

        {/* Modal Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-gradient-to-r from-white/[0.01] to-transparent">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 shadow-inner">
              <Settings size={18} className="text-white/80" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight">System Configuration</h2>
              <p className="text-[11px] text-white/40 font-light">
                Manage your core agent credentials, voice parameters, and active links
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveModal(null)}
            className="p-2 rounded-xl hover:bg-white/5 text-white/40 hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Left Sidebar + Right Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Tabs Bar */}
          <div className="w-full md:w-[260px] bg-black/30 border-b md:border-b-0 md:border-r border-white/5 p-4 flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible md:overflow-y-auto scrollbar-none">
            {tabsConfig.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              let activeBorderClass = '';
              let activeTextClass = 'text-white/40 group-hover:text-white/70';

              if (isActive) {
                if (tab.id === 'voice') {
                  activeBorderClass = 'bg-[#00e5ff]/[0.07] border-[#00e5ff]/20 text-white';
                  activeTextClass = 'text-[#00e5ff]';
                } else if (tab.id === 'agent_town') {
                  activeBorderClass = 'bg-purple-500/[0.07] border-purple-500/20 text-white';
                  activeTextClass = 'text-purple-400';
                } else if (tab.id === 'tools') {
                  activeBorderClass = 'bg-cyan-500/[0.07] border-cyan-500/20 text-white';
                  activeTextClass = 'text-cyan-400';
                } else if (tab.id === 'system') {
                  activeBorderClass = 'bg-amber-500/[0.07] border-amber-500/20 text-white';
                  activeTextClass = 'text-amber-400';
                } else if (tab.id === 'profile') {
                  activeBorderClass = 'bg-[#d4a853]/[0.07] border-[#d4a853]/20 text-white';
                  activeTextClass = 'text-[#d4a853]';
                } else if (tab.id === 'whatsapp') {
                  activeBorderClass = 'bg-[#25D366]/[0.07] border-[#25D366]/20 text-white';
                  activeTextClass = 'text-[#25D366]';
                } else if (tab.id === 'setup_guide') {
                  activeBorderClass = 'bg-orange-500/[0.07] border-orange-500/20 text-white';
                  activeTextClass = 'text-orange-400';
                }
              }

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    playClick();
                    setActiveTab(tab.id as any);
                  }}
                  className={`group flex items-center gap-3.5 px-3.5 py-3 rounded-xl border text-left transition-all duration-200 w-auto md:w-full min-w-[150px] md:min-w-0 flex-shrink-0 ${
                    isActive
                      ? `${activeBorderClass} shadow-sm font-medium`
                      : 'border-transparent bg-transparent hover:bg-white/[0.02] text-white/60 hover:text-white'
                  }`}
                >
                  <div className="p-1.5 rounded-lg transition-all duration-200 bg-white/5">
                    <TabIcon size={14} className={activeTextClass} />
                  </div>
                  <div className="hidden md:block min-w-0">
                    <p className="text-xs leading-none font-semibold truncate">{tab.label}</p>
                    <p className="text-[9px] text-white/30 font-light mt-1 truncate">{tab.desc}</p>
                  </div>
                  <div className="md:hidden block text-xs font-semibold leading-none">{tab.label}</div>
                </button>
              );
            })}
          </div>

          {/* Right Tab Content View */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-6">
            {/* ── TAB 1: Voice Assistant ──────────────────────────────────── */}
            {activeTab === 'voice' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div>
                  <h3 className="text-sm font-semibold text-white/90">Voice Assistant Settings</h3>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    Customize your live voice assistant engine and response characteristics
                  </p>
                </div>

                {/* Gemini Live API Key */}
                <div className="p-5 rounded-2xl border border-white/5 bg-white/[0.01] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Key size={13} className="text-[#00e5ff]" />
                      <span className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">
                        Gemini Live API Key
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      <ShieldCheck size={10} className="text-emerald-400" />
                      <span className="text-[9px] font-medium text-emerald-400 uppercase">Secure</span>
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type={showGeminiKey ? 'text' : 'password'}
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="Enter your Gemini API Key"
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs font-mono focus:outline-none focus:border-[#00e5ff]/40 focus:ring-1 focus:ring-[#00e5ff]/10 transition-all pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGeminiKey(!showGeminiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-white/30 hover:text-white transition-colors"
                    >
                      {showGeminiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-white/30 leading-normal">
                    This API key is stored locally in your workspace cache and encrypted during transit to secure services.
                  </p>
                </div>

                {/* Persona Selector */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Radio size={13} className="text-[#00e5ff]" />
                    <span className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">
                      Select Voice Persona
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { id: 'Charon', label: 'Male Persona (Charon)', sub: 'Deep, crisp, professional tone', icon: '👨' },
                      { id: 'Despina', label: 'Female Persona (Despina)', sub: 'Clear, natural, helpful tone', icon: '👩' },
                    ].map((p) => {
                      const isSelected = voicePersona === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            playClick();
                            setVoicePersona(p.id);
                          }}
                          className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                            isSelected
                              ? 'border-[#00e5ff]/40 bg-[#00e5ff]/[0.04] shadow-sm'
                              : 'border-white/5 bg-white/[0.01] hover:border-white/10 hover:bg-white/[0.02]'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <span className="text-xl mb-1 block">{p.icon}</span>
                              <h4 className="text-xs font-semibold text-white">{p.label}</h4>
                              <p className="text-[10px] text-white/40 font-light leading-snug">{p.sub}</p>
                            </div>
                            {isSelected && (
                              <div className="p-0.5 rounded-full bg-[#00e5ff] text-black shadow-md">
                                <Check size={11} />
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Wake Word Detection Toggle */}
                <div className="p-5 rounded-2xl border border-white/5 bg-white/[0.01] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radio size={13} className="text-[#00e5ff]" />
                      <span className="text-[10px] font-semibold text-white/70 uppercase tracking-wider font-sans">
                        Wake Word Detection
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleWakeWord}
                      className={`relative w-9 h-5 rounded-full transition-all duration-200 border ${
                        wakeWordEnabled
                          ? 'bg-[#00e5ff] border-[#00e5ff] shadow-[0_0_10px_rgba(0,229,255,0.25)]'
                          : 'bg-transparent border-white/20'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all duration-200 shadow-sm ${
                          wakeWordEnabled ? 'left-[18px] bg-black' : 'left-0.5 bg-white/60'
                        }`}
                      />
                    </button>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-white">Listen for the wake word in the background</h4>
                    <p className="text-[10px] text-white/40 mt-0.5 leading-relaxed font-light">
                      When ON, a background process keeps listening to your microphone so you can activate the assistant hands-free. Turning it OFF (default) saves CPU and battery — you can still start the assistant manually anytime.
                    </p>
                  </div>
                </div>

                {/* Sub-Agent Model Config Override */}
                <div className="p-5 rounded-2xl border border-white/5 bg-white/[0.01] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu size={13} className="text-[#00e5ff]" />
                      <span className="text-[10px] font-semibold text-white/70 uppercase tracking-wider font-sans">
                        Sub-Agent Model Config
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        playClick();
                        setSubAgentOverride(!subAgentOverride);
                      }}
                      className={`relative w-9 h-5 rounded-full transition-all duration-200 border ${
                        subAgentOverride
                          ? 'bg-[#00e5ff] border-[#00e5ff] shadow-[0_0_10px_rgba(0,229,255,0.25)]'
                          : 'bg-transparent border-white/20'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all duration-200 shadow-sm ${
                          subAgentOverride ? 'left-[18px] bg-black' : 'left-0.5 bg-white/60'
                        }`}
                      />
                    </button>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-white">Override defaults with OpenRouter</h4>
                    <p className="text-[10px] text-white/40 mt-0.5 leading-relaxed font-light">
                      Enable this option to direct background sub-agents to use any customized OpenRouter model ID instead of Gemini.
                    </p>
                  </div>

                  {subAgentOverride && (
                    <div className="space-y-3.5 pt-3.5 border-t border-white/5 animate-in slide-in-from-top-1 duration-200">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-medium text-white/60">OpenRouter API Key</label>
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              electronAPI?.invoke?.('open-external-link', 'https://openrouter.ai/keys');
                            }}
                            className="flex items-center gap-1 text-[9px] text-[#00e5ff]/70 hover:text-[#00e5ff] transition-colors"
                          >
                            Get Key <ExternalLink size={8} />
                          </a>
                        </div>
                        <div className="relative">
                          <input
                            type={showSubAgentKey ? 'text' : 'password'}
                            value={subAgentOpenRouterKey}
                            onChange={(e) => setSubAgentOpenRouterKey(e.target.value)}
                            placeholder="sk-or-v1-..."
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-white text-xs font-mono focus:outline-none focus:border-[#00e5ff]/40 focus:ring-1 focus:ring-[#00e5ff]/10 transition-all pr-12 placeholder:text-white/25"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSubAgentKey(!showSubAgentKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-white/30 hover:text-white transition-colors"
                          >
                            {showSubAgentKey ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-medium text-white/60">Model ID</label>
                        <input
                          type="text"
                          value={subAgentModelId}
                          readOnly
                          placeholder="google/gemini-3.1-flash-lite"
                          className="w-full bg-black/20 border border-white/5 rounded-xl px-3.5 py-2 text-white/50 text-xs font-mono cursor-not-allowed focus:outline-none transition-all placeholder:text-white/25"
                        />
                      </div>
                    </div>
                  )}

                  <div
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${
                      subAgentOverride && subAgentModelId.trim()
                        ? 'bg-[#00e5ff]/[0.03] border-[#00e5ff]/15'
                        : 'bg-white/[0.01] border-white/5'
                    }`}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        subAgentOverride && subAgentModelId.trim() ? 'bg-[#00e5ff] animate-pulse' : 'bg-white/20'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium text-white/60 truncate leading-none">
                        {subAgentOverride && subAgentModelId.trim()
                          ? `Active Override: ${subAgentModelId.trim()}`
                          : `Default Engine: gemini-3.8-flash`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Model Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="p-4 rounded-xl border border-white/5 bg-black/20 flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-white/5 text-white/50 mt-0.5">
                      <Cpu size={13} />
                    </div>
                    <div>
                      <span className="text-[9px] font-semibold text-white/30 uppercase tracking-tight">
                        Main Assistant
                      </span>
                      <p className="text-xs font-medium text-white mt-0.5">gemini-3.1-flash-lite</p>
                      <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[8px] font-bold mt-1.5 tracking-wide uppercase">
                        Live Link
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-white/5 bg-black/20 flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-white/5 text-white/50 mt-0.5">
                      <ShieldCheck size={13} />
                    </div>
                    <div>
                      <span className="text-[9px] font-semibold text-white/30 uppercase tracking-tight">
                        Child Worker
                      </span>
                      <p className="text-xs font-medium text-white mt-0.5">
                        {subAgentOverride ? subAgentModelId : 'gemini-3.8-flash'}
                      </p>
                      <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[8px] font-bold mt-1.5 tracking-wide uppercase">
                        Background
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 2: Agent Town (Hermes & Model Config) ───────────────── */}
            {activeTab === 'agent_town' && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div>
                  <h3 className="text-sm font-semibold text-white/90">Agent Town Configuration</h3>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    Setup API endpoints and model paths specifically for Hermes agent simulations
                  </p>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-xl bg-purple-500/5 border border-purple-500/10">
                  <Info size={14} className="text-purple-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-purple-300/80 leading-normal font-light">
                    Agent Town (Hermes) ka simulator in credentials ko use karega. Ye credentials voice channel se bulk independent hain.
                  </p>
                </div>

                <ModelConfigTab
                  provider={agentTownProvider}
                  setProvider={setAgentTownProvider}
                  apiKey={agentTownProvider === 'openrouter' ? agentTownOpenRouterKey : agentTownGeminiKey}
                  setApiKey={agentTownProvider === 'openrouter' ? setAgentTownOpenRouterKey : setAgentTownGeminiKey}
                  modelId={agentTownModelId}
                  setModelId={setAgentTownModelId}
                  playClick={playClick}
                  electronAPI={electronAPI}
                />
              </div>
            )}

            {/* ── TAB: Tools Config (Per-Tool Models & Keys) ───────────────── */}
            {activeTab === 'tools' && (
              <ToolsTab electronAPI={electronAPI} playClick={playClick} />
            )}

            {/* ── TAB: Setup Guide ────────────────────────────────────────── */}
            {activeTab === 'setup_guide' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div>
                  <h3 className="text-sm font-semibold text-white/90">Application Walkthrough</h3>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    Learn how to orchestrate autonomous agents, real-time voice, and browser tools
                  </p>
                </div>

                <div className="flex justify-center items-center py-2">
                  <div className="w-full max-w-md p-6 rounded-2xl border border-white/5 bg-white/[0.01] flex flex-col items-center justify-center text-center space-y-6 shadow-2xl">
                    <div className="relative">
                      <div className="absolute inset-0 bg-orange-500/10 rounded-full blur-2xl transform scale-150 animate-pulse" />
                      <div className="relative p-6 rounded-3xl bg-orange-500/5 border border-orange-500/20 text-orange-400 shadow-[0_0_35px_rgba(249,115,22,0.08)]">
                        <Flame size={32} className="animate-[pulse_3s_infinite]" />
                      </div>
                    </div>
                    <div className="space-y-2 max-w-xs">
                      <h3 className="text-sm font-semibold text-white tracking-tight">Application Setup Guide</h3>
                      <p className="text-[11px] text-white/40 leading-relaxed font-light">
                        Read our complete in-app setup guide to configure workspaces, setup sub-agents, and start automations.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        playClick();
                        setGuideFromSettings(true);
                        setActiveModal(null);
                        setIsGuideModalOpen(true);
                      }}
                      className="px-8 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all shadow-[0_0_20px_rgba(249,115,22,0.2)] flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                    >
                      <Flame size={14} className="text-white" />
                      Open Setup Guide
                    </button>
                    <p className="text-[10px] text-white/20 font-light select-none">
                      Interactive quick setup walkthrough
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 4: System Settings ──────────────────────────────────── */}
            {activeTab === 'system' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div>
                  <h3 className="text-sm font-semibold text-white/90">System Settings</h3>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    Manage application updates and performance characteristics
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-white/5 bg-white/[0.01] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-white/5 text-amber-400">
                        <Settings size={14} />
                      </div>
                      <span className="text-[10px] font-semibold text-white/70 uppercase tracking-wider font-sans">
                        Automatic Updates
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleAutoUpdate}
                      className={`relative w-10 h-6 rounded-full transition-all duration-200 border ${
                        autoUpdateEnabled
                          ? 'bg-amber-500 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.25)]'
                          : 'bg-transparent border-white/20'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 shadow-sm ${
                          autoUpdateEnabled ? 'left-[20px] bg-black' : 'left-0.5 bg-white/60'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-medium text-white/80">
                      Automatically download and install updates
                    </h4>
                    <p className="text-[10px] text-white/40 leading-relaxed font-light">
                      When enabled, Akki Ai will automatically download new updates in the background and prompt you to install them. When disabled, you will get a notification when updates are available, letting you download them manually.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 5: User Profile ─────────────────────────────────────── */}
            {activeTab === 'profile' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div>
                  <h3 className="text-sm font-semibold text-white/90">User Profile</h3>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    Manage your active Akki Ai session and account parameters
                  </p>
                </div>

                {/* Profile card */}
                <div className="p-6 rounded-2xl border border-white/5 bg-white/[0.01] flex flex-col items-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-[#d4a853]/10 border border-[#d4a853]/20 flex items-center justify-center shadow-[0_0_20px_rgba(212,168,83,0.15)] overflow-hidden">
                    {akPhotoURL ? (
                      <img
                        src={akPhotoURL}
                        className="w-full h-full object-cover"
                        onError={() => setAkPhotoURL('')}
                        alt=""
                      />
                    ) : (
                      <span className="text-[#d4a853] font-bold text-2xl uppercase">
                        {userProfile.name ? userProfile.name.charAt(0) : 'A'}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-medium text-white">
                      {userEmail || 'akshaymondal143@gmail.com'}
                    </h4>
                    <p className="text-[10px] text-white/40 font-mono tracking-widest uppercase">
                      Logged-in User
                    </p>
                  </div>
                </div>

                {/* Access Whitelist Status */}
                <div className="p-4 rounded-xl border border-white/5 bg-black/20 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                      <ShieldCheck size={14} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white leading-none">Access Whitelist Status</p>
                      <p className="text-[10px] text-white/30 font-light mt-1">
                        Your email is verified and approved on the Akki cloud
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Approved
                  </span>
                </div>

                {/* Identity Details */}
                <div className="p-5 rounded-2xl border border-white/5 bg-white/[0.01] space-y-4">
                  <div className="flex items-center gap-2">
                    <User size={13} className="text-[#d4a853]" />
                    <span className="text-[10px] font-semibold text-white/70 uppercase tracking-wider">
                      Identity Details
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-[10px] font-medium text-white/50">Full Name</label>
                      <input
                        type="text"
                        value={userProfile.name || ''}
                        onChange={(e) => setUserProfile({ ...userProfile, name: e.target.value })}
                        placeholder="e.g. Akshay"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-[#d4a853]/40 focus:ring-1 focus:ring-[#d4a853]/10 transition-all placeholder:text-white/20"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-medium text-white/50">Primary Location</label>
                      <input
                        type="text"
                        value={userProfile.location || ''}
                        onChange={(e) => setUserProfile({ ...userProfile, location: e.target.value })}
                        placeholder="e.g. West Bengal, India"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-[#d4a853]/40 focus:ring-1 focus:ring-[#d4a853]/10 transition-all placeholder:text-white/20"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-medium text-white/50">Profession</label>
                      <input
                        type="text"
                        value={userProfile.profession || ''}
                        onChange={(e) => setUserProfile({ ...userProfile, profession: e.target.value })}
                        placeholder="e.g. Senior Software Engineer"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-[#d4a853]/40 focus:ring-1 focus:ring-[#d4a853]/10 transition-all placeholder:text-white/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-white/50">Bio / Personal Context</label>
                    <textarea
                      value={userProfile.bio || ''}
                      onChange={(e) => setUserProfile({ ...userProfile, bio: e.target.value })}
                      placeholder="Tell Akki more about yourself..."
                      rows={3}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-[#d4a853]/40 focus:ring-1 focus:ring-[#d4a853]/10 transition-all placeholder:text-white/20 resize-none no-scrollbar"
                    />
                  </div>
                </div>

                {/* Sign Out Account */}
                <div className="p-5 rounded-2xl border border-red-500/10 bg-red-500/[0.01] space-y-4">
                  <div>
                    <h4 className="text-xs font-medium text-white">Sign Out of Akki Ai</h4>
                    <p className="text-[10px] text-white/40 mt-0.5 leading-relaxed font-light">
                      Logging out will clear your local credentials cache and return you to the login gate. You will need to authenticate again to use the assistant.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full py-2.5 sm:w-auto px-5 rounded-xl border border-red-500/20 hover:border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-all flex items-center justify-center gap-2 active:scale-98"
                  >
                    <LogOut size={13} />
                    Sign Out Account
                  </button>
                </div>
              </div>
            )}

            {/* ── TAB 6: WhatsApp Link ────────────────────────────────────── */}
            {activeTab === 'whatsapp' && (
              <div className="h-full flex flex-col p-2 space-y-5 animate-in fade-in duration-300 overflow-y-auto">
                <div className="flex items-center gap-3.5">
                  <div className="relative p-3 rounded-2xl bg-[#25D366]/5 border border-[#25D366]/20 text-[#25D366] shadow-[0_0_35px_rgba(37,211,102,0.08)]">
                    <MessageSquare size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white tracking-tight">WhatsApp Remote Link</h3>
                    <p className="text-[11px] text-white/40 leading-relaxed font-light max-w-md">
                      Apne WhatsApp ko link karein aur &quot;Message Yourself&quot; chat se Akki Ai ko remotely command bhejein. Reply seedhe WhatsApp par aayega.
                    </p>
                  </div>
                </div>

                <div className="max-w-md">
                  <WhatsAppTab electronAPI={electronAPI} playClick={playClick} />
                </div>

                <div className="w-full max-w-md p-4 rounded-2xl border border-white/5 bg-white/[0.01] flex items-start gap-3.5 text-left">
                  <div className="p-2 rounded-lg bg-white/5 border border-white/5 text-white/40 shrink-0">
                    <Info size={13} />
                  </div>
                  <div>
                    <h4 className="text-[9px] font-semibold text-white/60 uppercase tracking-tight">Routing</h4>
                    <p className="text-[10px] text-white/30 font-light mt-0.5 leading-normal">
                      WhatsApp message uss runtime ko jata hai jo chat panel ke VOICE/CHAT toggle par select ho — VOICE = Gemini Live, CHAT = Hermes agent.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-8 py-4.5 border-t border-white/5 bg-[#080808] flex items-center justify-between flex-shrink-0">
          <div className="hidden sm:block">
            {toastMessage ? (
              <div
                className={`flex items-center gap-2 animate-in fade-in duration-250 ${
                  toastMessage.type === 'success' ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                <Check size={13} />
                <span className="text-xs font-medium">{toastMessage.text}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-white/30 text-[10px] font-mono tracking-tight select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 animate-pulse" />
                <span>Version: {appVersion}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto ml-auto">
            <button
              type="button"
              onClick={() => setActiveModal(null)}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl border border-white/10 text-white/60 text-xs font-semibold hover:bg-white/5 hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 sm:flex-none px-7 py-2.5 rounded-xl bg-white text-black text-xs font-bold hover:bg-white/90 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(255,255,255,0.08)] flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
