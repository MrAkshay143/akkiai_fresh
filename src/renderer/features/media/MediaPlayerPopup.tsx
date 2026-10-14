import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  X,
  Music,
} from 'lucide-react';

interface MediaPlayerPopupProps {
  videoId: string;
  onClose: () => void;
  isFloatingWindow?: boolean;
}

const THEME_ACCENTS: Record<string, string> = {
  akki: '#00E5FF',
  'electric-cyan': '#00D2FF',
  'violet-void': '#A822FF',
  'solar-amber': '#FF5500',
  'crimson-neon': '#FF003C',
};

export const MediaPlayerPopup: React.FC<MediaPlayerPopupProps> = ({
  videoId,
  onClose,
  isFloatingWindow: initialFloating,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Check URL query parameters for floating window mode (?mode=player)
  const isFloatingMode = (() => {
    if (initialFloating) return true;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(
        window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
      );
      return (
        searchParams.get('mode') === 'player' || hashParams.get('mode') === 'player'
      );
    } catch {
      return false;
    }
  })();

  const [isPlaying, setIsPlaying] = useState(true);
  const [showFeedback, setShowFeedback] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const [vol, setVol] = useState<number>(() => {
    try {
      const s = localStorage.getItem('akki_player_vol');
      return s !== null ? parseInt(s, 10) : 80;
    } catch {
      return 80;
    }
  });

  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('akki_player_muted') === 'true';
    } catch {
      return false;
    }
  });

  const [themeColor, setThemeColor] = useState<string>(() => {
    try {
      const s = localStorage.getItem('akki_theme') || 'akki';
      return THEME_ACCENTS[s] || '#00E5FF';
    } catch {
      return '#00E5FF';
    }
  });

  // Theme synchronization
  useEffect(() => {
    try {
      const api = (window as any).electronAPI;
      if (api && api.invoke) {
        api.invoke('get-theme').then((t: any) => {
          if (t && typeof t === 'string' && THEME_ACCENTS[t]) {
            setThemeColor(THEME_ACCENTS[t]);
          }
        }).catch(() => {});
      }
      if (api && api.on) {
        const unsubscribe = api.on('theme-changed', (a: any, b: any) => {
          const t = (typeof a === 'string' && THEME_ACCENTS[a])
            ? a
            : ((typeof b === 'string' && THEME_ACCENTS[b]) ? b : (a?.theme || null));
          if (t && THEME_ACCENTS[t]) setThemeColor(THEME_ACCENTS[t]);
        });
        return () => {
          if (typeof unsubscribe === 'function') unsubscribe();
        };
      }
    } catch (_) {}
  }, []);

  const formatTime = (sec: number): string => {
    if (!sec || isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  };

  const postYt = (msg: Record<string, unknown>) => {
    try {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage(JSON.stringify(msg), '*');
      }
    } catch (_) {}
  };

  const sendYt = (func: string, args: unknown[] = []) => {
    postYt({ event: 'command', func, args });
  };

  const pingYt = () => {
    postYt({ event: 'listening' });
    sendYt('getDuration');
    sendYt('getCurrentTime');
  };

  const seekToTime = (target: number | string): boolean => {
    let sec = Number(target);
    if (typeof target === 'string' && target.includes(':')) {
      const p = target.split(':');
      if (p.length === 2) {
        sec = (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
      }
    }
    if (isNaN(sec) || sec < 0) return false;
    if (duration > 0 && sec > duration) return false;
    sendYt('seekTo', [sec, true]);
    setCurrentTime(sec);
    return true;
  };

  const togglePlay = () => {
    setIsPlaying((prev) => {
      const next = !prev;
      sendYt(next ? 'playVideo' : 'pauseVideo');
      setShowFeedback(true);
      setTimeout(() => setShowFeedback(false), 700);
      return next;
    });
  };

  const handleVolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    setVol(v);
    try {
      localStorage.setItem('akki_player_vol', String(v));
    } catch (_) {}
    sendYt('setVolume', [v]);
    if (v === 0) {
      setMuted(true);
      sendYt('mute');
    } else if (muted) {
      setMuted(false);
      sendYt('unMute');
    }
  };

  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('akki_player_muted', String(next));
      } catch (_) {}
      sendYt(next ? 'mute' : 'unMute');
      if (!next) {
        sendYt('setVolume', [vol || 80]);
      }
      return next;
    });
  };

  // YouTube postMessage handshake and response listener
  useEffect(() => {
    const handleMsg = (ev: MessageEvent) => {
      try {
        const data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        if (!data) return;
        const info = data.info || (data.event === 'infoDelivery' ? data : null);
        if (info) {
          if (typeof info.currentTime === 'number' && !isSeeking) {
            setCurrentTime(info.currentTime);
          }
          if (typeof info.duration === 'number' && info.duration > 0) {
            setDuration(info.duration);
          }
          if (typeof info.playerState === 'number') {
            setIsPlaying(info.playerState === 1);
          }
        }
      } catch (_) {}
    };

    window.addEventListener('message', handleMsg);
    pingYt();
    const t1 = setTimeout(pingYt, 600);
    const t2 = setTimeout(pingYt, 1500);
    const iv = setInterval(pingYt, 2000);

    return () => {
      window.removeEventListener('message', handleMsg);
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(iv);
    };
  }, [isSeeking]);

  // Smooth local timeline progression when playing
  useEffect(() => {
    if (!isPlaying || isSeeking) return;
    const ticker = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.5;
        return duration > 0 && next > duration ? duration : next;
      });
    }, 500);
    return () => clearInterval(ticker);
  }, [isPlaying, isSeeking, duration]);

  // IPC media-player-control listener from main process
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api && api.on) {
      const unsubscribe = api.on('media-player-control', (a: any, b: any) => {
        const payload = b !== undefined && b !== null ? b : a;
        const action = payload?.action || payload;
        const val = payload?.value !== undefined ? payload.value : undefined;

        if (action === 'play') {
          setIsPlaying(true);
          sendYt('playVideo');
        } else if (action === 'pause') {
          setIsPlaying(false);
          sendYt('pauseVideo');
        } else if (action === 'forward') {
          const step = Number(val) || 10;
          setCurrentTime((cur) => {
            const t = cur + step;
            seekToTime(t);
            return t;
          });
        } else if (action === 'rewind' || action === 'backward') {
          const step = Number(val) || 10;
          setCurrentTime((cur) => {
            const t = Math.max(0, cur - step);
            seekToTime(t);
            return t;
          });
        } else if (action === 'seek') {
          seekToTime(val);
        } else if (action === 'set_player_volume') {
          const v = Math.min(100, Math.max(0, parseInt(val, 10) || 80));
          setVol(v);
          try {
            localStorage.setItem('akki_player_vol', String(v));
          } catch (_) {}
          sendYt('setVolume', [v]);
          if (v === 0) {
            setMuted(true);
            sendYt('mute');
          } else if (muted) {
            setMuted(false);
            sendYt('unMute');
          }
        } else if (action === 'player_volume_up') {
          setVol((cur) => {
            const v = Math.min(100, cur + (Number(val) || 10));
            try {
              localStorage.setItem('akki_player_vol', String(v));
            } catch (_) {}
            sendYt('setVolume', [v]);
            return v;
          });
        } else if (action === 'player_volume_down') {
          setVol((cur) => {
            const v = Math.max(0, cur - (Number(val) || 10));
            try {
              localStorage.setItem('akki_player_vol', String(v));
            } catch (_) {}
            sendYt('setVolume', [v]);
            return v;
          });
        } else if (action === 'mute_player') {
          setMuted(true);
          try {
            localStorage.setItem('akki_player_muted', 'true');
          } catch (_) {}
          sendYt('mute');
        } else if (action === 'unmute_player') {
          setMuted(false);
          try {
            localStorage.setItem('akki_player_muted', 'false');
          } catch (_) {}
          sendYt('unMute');
          sendYt('setVolume', [vol || 80]);
        }
      });

      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [duration, muted, vol]);

  // Initial volume setup on load
  useEffect(() => {
    if (!videoId) return;
    const t = setTimeout(() => {
      sendYt('setVolume', [vol]);
      if (muted) sendYt('mute');
      else sendYt('unMute');
      pingYt();
    }, 1000);
    return () => clearTimeout(t);
  }, [videoId]);

  if (!videoId) return null;

  const handleClose = () => {
    if (isFloatingMode) {
      const api = (window as any).electronAPI;
      if (api && api.invoke) {
        api.invoke('close-window');
      } else {
        window.close();
      }
    } else {
      onClose();
    }
  };

  const originUrl = encodeURIComponent(
    typeof window !== 'undefined' && window.location ? window.location.origin : 'http://127.0.0.1:45678'
  );

  const playerContent = (
    <div
      style={{ backgroundColor: '#0B141B' }}
      className={`flex flex-col bg-[#0B141B] shadow-2xl overflow-hidden select-none ${
        isFloatingMode
          ? 'h-screen w-screen border-none'
          : 'relative w-full max-w-3xl h-[520px] rounded-2xl border border-cyan-500/25 ring-1 ring-white/5'
      }`}
    >
      {/* ── Top Header Bar ─────────────────────────────────────────── */}
      <div
        style={{ WebkitAppRegion: 'drag', backgroundColor: '#0B141B' } as any}
        className="flex items-center justify-between px-4 py-2.5 bg-[#0B141B] border-b border-white/5 cursor-move select-none"
      >
        <div className="flex items-center gap-2.5">
          {/* Status Indicator */}
          <div
            className="w-2.5 h-2.5 rounded-full shadow-sm"
            style={{
              backgroundColor: themeColor,
              boxShadow: `0 0 8px ${themeColor}`,
            }}
          />
          <div className="flex items-center gap-1.5 text-xs font-mono tracking-wider uppercase text-white/80">
            <Music size={13} style={{ color: themeColor }} className="animate-pulse" />
            <span>Akki Neural Player</span>
          </div>
        </div>

        {/* Window Action Buttons */}
        <div
          style={{ WebkitAppRegion: 'no-drag' } as any}
          className="flex items-center gap-1"
        >
          {isFloatingMode && (
            <>
              <button
                onClick={() => (window as any).electronAPI?.invoke('minimize-window')}
                className="p-1.5 hover:bg-white/10 rounded-md text-white/50 hover:text-white transition-colors"
                title="Minimize"
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <button
                onClick={() => (window as any).electronAPI?.invoke('maximize-window')}
                className="p-1.5 hover:bg-white/10 rounded-md text-white/50 hover:text-white transition-colors"
                title="Maximize"
              >
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
              </button>
              <button
                onClick={() => (window as any).electronAPI?.invoke('fullscreen-window')}
                className="p-1.5 hover:bg-white/10 rounded-md text-white/50 hover:text-white transition-colors"
                title="Fullscreen"
              >
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              </button>
              <div className="w-px h-4 bg-white/10 mx-1" />
            </>
          )}

          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-red-500/20 rounded-md text-white/50 hover:text-red-400 transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── YouTube Video Player Viewport ─────────────────────────── */}
      <div className="relative w-full flex-1 overflow-hidden bg-black flex items-center justify-center select-none">
        {/* Soft background theme glow */}
        <div
          className="absolute inset-0 blur-3xl rounded-full pointer-events-none opacity-20"
          style={{ backgroundColor: themeColor }}
        />

        <iframe
          ref={iframeRef}
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&disablekb=1&fs=0&modestbranding=1&playsinline=1&rel=0&showinfo=0&iv_load_policy=3&enablejsapi=1&origin=${originUrl}`}
          title="Akki Media Player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '100%',
            height: '180%',
            transform: 'translate(-50%, -50%)',
            border: 'none',
            pointerEvents: 'none',
          }}
        />

        {/* Center Screen Click to Toggle Play/Pause */}
        <button
          onClick={togglePlay}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 11,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            width: '100%',
            height: '100%',
          }}
          aria-label="Toggle Play"
        />

        {/* Play/Pause Animated Feedback Ripple */}
        {showFeedback && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none transition-all duration-300">
            <div className="w-16 h-16 rounded-full bg-black/70 backdrop-blur-md flex items-center justify-center border border-white/20 text-white shadow-2xl scale-110 transition-transform">
              {isPlaying ? (
                <svg width={28} height={28} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={2}>
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              ) : (
                <svg width={28} height={28} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={2}>
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Custom Bottom Player Controls Bar ─────────────────────── */}
      <div
        style={{ backgroundColor: '#0B141B' }}
        className="px-4 py-2 bg-[#0B141B] flex flex-col gap-1.5 border-t border-white/5 select-none"
      >
        {/* Progress Timeline Slider */}
        <div className="w-full flex items-center gap-3">
          <span className="text-[10px] font-mono text-white/60 min-w-[34px] text-right">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="1"
            value={currentTime}
            onMouseDown={() => setIsSeeking(true)}
            onMouseUp={() => setIsSeeking(false)}
            onTouchStart={() => setIsSeeking(true)}
            onTouchEnd={() => setIsSeeking(false)}
            onChange={(e) => {
              const val = Number(e.target.value);
              setCurrentTime(val);
              seekToTime(val);
            }}
            style={{ accentColor: themeColor }}
            className="flex-1 h-1 rounded-full cursor-pointer bg-white/20 transition-all hover:h-1.5"
            title="Timeline"
          />
          <span className="text-[10px] font-mono text-white/40 min-w-[34px]">
            {formatTime(duration)}
          </span>
        </div>

        {/* Buttons Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Play/Pause Button */}
            <button
              onClick={togglePlay}
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-all"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={2}>
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={2}>
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>

            {/* Rewind -10s */}
            <button
              onClick={() => seekToTime(Math.max(0, currentTime - 10))}
              className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition-all text-[11px] font-mono px-1.5"
              title="Rewind 10s"
            >
              -10s
            </button>

            {/* Forward +10s */}
            <button
              onClick={() => seekToTime(currentTime + 10)}
              className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition-all text-[11px] font-mono px-1.5"
              title="Forward 10s"
            >
              +10s
            </button>

            <div className="w-px h-3.5 bg-white/10 mx-1" />

            {/* Volume Control */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleMute}
                className="p-1 rounded text-white/70 hover:text-white transition-colors"
                title={muted || vol === 0 ? 'Unmute Player' : 'Mute Player'}
              >
                {muted || vol === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={muted ? 0 : vol}
                onChange={handleVolChange}
                style={{ accentColor: themeColor }}
                className="w-16 h-1 bg-white/20 rounded-lg cursor-pointer"
                title="Player Volume"
              />
              <span className="text-[10px] font-mono text-white/50 w-7">
                {muted ? 0 : vol}%
              </span>
            </div>
          </div>

          {/* Right Status Badge */}
          <div className="flex items-center gap-3 text-[10px] font-medium select-none">
            <span className="flex items-center gap-1.5 uppercase tracking-tighter text-white/50">
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{
                  backgroundColor: themeColor,
                  boxShadow: `0 0 6px ${themeColor}`,
                }}
              />
              Akki Neural Player
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  if (isFloatingMode) {
    return playerContent;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      {playerContent}
    </div>
  );
};
