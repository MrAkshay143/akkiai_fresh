import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
  Music,
} from 'lucide-react';

interface MediaPlayerPopupProps {
  videoId: string;
  onClose: () => void;
}

export const MediaPlayerPopup: React.FC<MediaPlayerPopupProps> = ({ videoId, onClose }) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
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

  const seekToTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) return;
    if (duration > 0 && sec > duration) return;
    sendYt('seekTo', [sec, true]);
    setCurrentTime(sec);
  };

  const togglePlay = () => {
    setIsPlaying((prev) => {
      const next = !prev;
      sendYt(next ? 'playVideo' : 'pauseVideo');
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

  // YouTube postMessage handshake
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

  // Smooth local timeline progression
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
      const unsubscribe = api.on('media-player-control', (_event: any, payload: any) => {
        const action = payload?.action || payload;
        const val = payload?.value;
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
          seekToTime(Number(val));
        } else if (action === 'set_player_volume') {
          const v = Math.min(100, Math.max(0, parseInt(val, 10) || 80));
          setVol(v);
          sendYt('setVolume', [v]);
        } else if (action === 'mute_player') {
          setMuted(true);
          sendYt('mute');
        } else if (action === 'unmute_player') {
          setMuted(false);
          sendYt('unMute');
          sendYt('setVolume', [vol || 80]);
        }
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [duration, muted, vol]);

  if (!videoId) return null;

  const originUrl = encodeURIComponent(
    typeof window !== 'undefined' && window.location ? window.location.origin : 'http://127.0.0.1'
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl rounded-2xl border border-[rgba(0,229,255,0.25)] bg-[#0B141B] shadow-[0_10px_50px_rgba(0,229,255,0.15)] overflow-hidden flex flex-col">
        {/* ── Top Header Strip ────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#080d12] border-b border-white/[0.06] select-none">
          <div className="flex items-center gap-3">
            {/* macOS traffic light dots */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onClose}
                className="w-3 h-3 rounded-full bg-[#ff5f56] hover:brightness-110 flex items-center justify-center text-[8px] text-black font-bold opacity-80 hover:opacity-100 transition-opacity"
                title="Close Player"
              >
                ✕
              </button>
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e] opacity-80" />
              <div className="w-3 h-3 rounded-full bg-[#27c93f] opacity-80" />
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-[#00e5ff] tracking-wider uppercase">
              <Music size={13} className="animate-pulse" />
              <span>Akki Media Player</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Embedded YouTube Video Player ────────────────────────────── */}
        <div className="w-full h-[400px] bg-black relative">
          <iframe
            ref={iframeRef}
            src={`https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&origin=${originUrl}&autoplay=1&controls=0&rel=0`}
            title="Akki Media Stream"
            className="w-full h-full border-none"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>

        {/* ── Custom Bottom Player Controls ────────────────────────────── */}
        <div className="px-5 py-3 bg-[#080d12] border-t border-white/[0.06] flex flex-col gap-2">
          {/* Progress Timeline Slider */}
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onMouseDown={() => setIsSeeking(true)}
              onChange={(e) => setCurrentTime(Number(e.target.value))}
              onMouseUp={(e) => {
                setIsSeeking(false);
                seekToTime(Number((e.target as HTMLInputElement).value));
              }}
              className="w-full h-1.5 rounded-lg bg-white/10 accent-[#00e5ff] cursor-pointer"
            />
            <span className="text-[10px] font-mono text-white/50 whitespace-nowrap min-w-[75px] text-right">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Action Buttons: Play/Pause, Rewind, Forward, Volume */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Rewind 10s */}
              <button
                onClick={() => {
                  const t = Math.max(0, currentTime - 10);
                  seekToTime(t);
                }}
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                title="Rewind 10 seconds"
              >
                <RotateCcw size={15} />
              </button>

              {/* Play / Pause */}
              <button
                onClick={togglePlay}
                className="w-8 h-8 rounded-full bg-[#00e5ff] hover:bg-[#00e5ff]/90 text-black flex items-center justify-center transition-all shadow-[0_0_12px_rgba(0,229,255,0.4)]"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
              </button>

              {/* Forward 10s */}
              <button
                onClick={() => {
                  const t = Math.min(duration || 9999, currentTime + 10);
                  seekToTime(t);
                }}
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-colors"
                title="Forward 10 seconds"
              >
                <RotateCw size={15} />
              </button>
            </div>

            {/* Volume Control */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="text-white/50 hover:text-white transition-colors"
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted || vol === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={muted ? 0 : vol}
                onChange={handleVolChange}
                className="w-20 h-1 rounded-lg bg-white/10 accent-[#00e5ff] cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
