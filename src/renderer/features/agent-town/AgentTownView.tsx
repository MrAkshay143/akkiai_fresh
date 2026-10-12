import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Maximize2, RefreshCw, AlertCircle } from 'lucide-react';
import { useAppStore } from '@/state/useAppStore';

const AGENT_TOWN_URL = 'http://127.0.0.1:3000';

export const AgentTownView: React.FC = () => {
  const { centerView, setCenterView } = useAppStore();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [serverState, setServerState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [reloadCounter, setReloadCounter] = useState<number>(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const attemptsRef = useRef<number>(0);

  const checkHealth = useCallback(async () => {
    attemptsRef.current++;
    try {
      await fetch(AGENT_TOWN_URL, { method: 'HEAD', mode: 'no-cors' });
      setServerState('ready');
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    } catch {
      if (attemptsRef.current >= 90) {
        setServerState('error');
        setErrorMessage('Agent Town server is not responding.');
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }
    }
  }, []);

  useEffect(() => {
    checkHealth();
    pollTimerRef.current = setInterval(checkHealth, 2000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [checkHealth]);

  // Iframe event wiring matching reference build (tK)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || serverState !== 'ready') return;

    const handleLoad = () => {
      console.log('[AgentTownEmbed] Iframe loaded successfully');
      try {
        iframe.contentWindow?.postMessage({ type: 'expand-state', isExpanded }, '*');
      } catch {
        // ignore cross-origin postMessage errors
      }
    };

    const handleError = () => {
      console.error('[AgentTownEmbed] Iframe failed to load');
    };

    iframe.addEventListener('load', handleLoad);
    iframe.addEventListener('error', handleError);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      iframe.removeEventListener('error', handleError);
    };
  }, [serverState, reloadCounter, isExpanded]);

  // Sync expanded state to iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      try {
        iframe.contentWindow.postMessage({ type: 'expand-state', isExpanded }, '*');
      } catch {
        // ignore
      }
    }
  }, [isExpanded]);

  // Escape key to exit expanded state
  useEffect(() => {
    if (!isExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsExpanded(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  const handleRetry = () => {
    setServerState('loading');
    setErrorMessage('');
    attemptsRef.current = 0;
    setReloadCounter((prev) => prev + 1);
    if ((window as any).electronAPI?.invoke) {
      (window as any).electronAPI.invoke('start-agent-town-server').catch(() => {});
    }
    checkHealth();
    pollTimerRef.current = setInterval(checkHealth, 2000);
  };

  return (
    <div
      id="agent-town-container"
      className="relative w-full h-full rounded-[2rem] border border-[rgba(0,229,255,0.18)] bg-[#0c101c] overflow-hidden flex flex-col shadow-[0_0_40px_rgba(0,229,255,0.08),inset_0_1px_0_rgba(0,229,255,0.05)] select-none transition-all duration-300"
      style={
        isExpanded
          ? {
              position: 'fixed',
              top: '44px',
              left: 0,
              width: '100vw',
              height: 'calc(100vh - 44px)',
              zIndex: 9999,
              background: '#1b2740',
              borderRadius: 0,
            }
          : {}
      }
    >
      {/* ── Top Header Strip (Matching Legacy 'tK' exactly) ──────────────── */}
      <div className="flex items-center justify-between px-4 h-[44px] bg-gradient-to-r from-[rgba(6,11,15,0.95)] to-[rgba(9,17,26,0.95)] border-b border-[rgba(0,229,255,0.15)] z-10 shrink-0">
        <div className="flex items-center space-x-2.5">
          <span
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              serverState === 'ready'
                ? 'bg-[#00e5ff] shadow-[0_0_10px_#00e5ff]'
                : serverState === 'loading'
                ? 'bg-[#ffcc00] shadow-[0_0_10px_#ffcc00]'
                : 'bg-[#ff3b30] shadow-[0_0_10px_#ff3b30]'
            }`}
          />
          <span
            className="text-[#00e5ff] text-[10px] font-bold tracking-[0.18em] uppercase drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]"
            style={{ fontFamily: "'Press Start 2P', monospace" }}
          >
            AGENT TOWN
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {/* View Switcher Pill */}
          <div className="flex items-center bg-black/60 rounded-lg p-0.5 border border-[rgba(0,229,255,0.25)] shadow-[0_0_15px_rgba(0,0,0,0.5),inset_0_0_8px_rgba(0,229,255,0.05)]">
            <button
              onClick={() => setCenterView('agent-town')}
              className={`px-3 py-1 rounded text-[8px] font-bold tracking-wider transition-all ${
                centerView === 'agent-town'
                  ? 'bg-gradient-to-br from-[#00e5ff]/20 to-[#0085ff]/20 text-[#00e5ff] border border-[#00e5ff]/40 shadow-[0_0_10px_rgba(0,229,255,0.15)]'
                  : 'text-white/40 hover:text-white/80 border border-transparent'
              }`}
              style={{ fontFamily: "'Press Start 2P', monospace" }}
            >
              AGENT TOWN
            </button>
            <button
              onClick={() => setCenterView('visual-hub')}
              className={`px-3 py-1 rounded text-[8px] font-bold tracking-wider transition-all ${
                centerView === 'visual-hub'
                  ? 'bg-gradient-to-br from-[#00e5ff]/20 to-[#0085ff]/20 text-[#00e5ff] border border-[#00e5ff]/40 shadow-[0_0_10px_rgba(0,229,255,0.15)]'
                  : 'text-white/40 hover:text-white/80 border border-transparent'
              }`}
              style={{ fontFamily: "'Press Start 2P', monospace" }}
            >
              VISUAL HUB
            </button>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[#00e5ff]/70 hover:text-[#00e5ff] p-1 transition-colors"
            title="Toggle Expand"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Viewport: Only Mounts Iframe When Server Is Live (Prevents Caching ERR_CONNECTION_REFUSED) ───────────────────── */}
      <div className="relative flex-1 w-full h-[calc(100%-44px)] overflow-hidden bg-[#0a0e14]">
        {serverState === 'ready' && (
          <iframe
            ref={iframeRef}
            key={reloadCounter}
            src={AGENT_TOWN_URL}
            className="w-full h-full border-none block"
            style={{
              imageRendering: 'pixelated',
              background: '#1b2740',
            }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Agent Town Simulation"
          />
        )}

        {serverState === 'loading' && (
          <div className="absolute inset-0 z-20 w-full h-full flex flex-col items-center justify-center gap-4 bg-[#0a0e14]">
            <RefreshCw size={28} className="animate-spin text-[#00e5ff]" />
            <div className="flex flex-col items-center gap-1.5">
              <span
                className="text-[#00e5ff]/90 text-[10px] tracking-[0.15em] uppercase font-bold"
                style={{ fontFamily: "'Press Start 2P', monospace" }}
              >
                Starting Agent Town
              </span>
              <span className="text-white/40 text-[9px] font-mono tracking-wider">
                Initializing server & agents...
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-[#00e5ff]/60 animate-pulse"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {serverState === 'error' && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-[#0a0e14]">
            <AlertCircle size={30} className="text-red-400" />
            <div className="flex flex-col items-center gap-1">
              <span
                className="text-red-400 text-[10px] tracking-[0.15em] uppercase font-bold"
                style={{ fontFamily: "'Press Start 2P', monospace" }}
              >
                Connection Failed
              </span>
              <span className="text-white/40 text-[10px] font-mono max-w-[280px] text-center">
                {errorMessage || 'Agent Town server is not responding.'}
              </span>
            </div>
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-[#00e5ff]/10 border border-[#00e5ff]/30 rounded-md text-[#00e5ff] text-[9px] font-mono tracking-wider uppercase hover:bg-[#00e5ff]/20 transition-all font-bold"
            >
              <RefreshCw size={11} />
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
