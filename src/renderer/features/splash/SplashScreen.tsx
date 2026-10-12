import React, { useEffect, useState, useRef } from 'react';

declare global {
  interface Window {
    electronAPI?: {
      notifyAppReady?: () => Promise<any>;
      [key: string]: any;
    };
  }
}

export interface SplashScreenProps {
  onFinished?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinished }) => {
  const [progress, setProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('INITIALIZING KERNEL...');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const starsRef = useRef<HTMLDivElement | null>(null);

  const stages = [
    'BIOS_CHECK :: OK',
    'LOADING_NEURAL_NETWORKS...',
    'DECRYPTING_USER_VAULT...',
    'ESTABLISHING_SECURE_LINK...',
    'OPTIMIZING_MEMORY_SHARDS...',
    'LOADING_CORE_MODULES...',
    'SYSTEM_READY',
  ];

  const hasFinishedCb = typeof onFinished !== 'undefined';

  useEffect(() => {
    // 34 background twinkling stars
    const container = starsRef.current;
    if (container) {
      container.innerHTML = '';
      const starCount = 34;
      for (let s = 0; s < starCount; s++) {
        const star = document.createElement('div');
        star.style.position = 'absolute';
        star.style.backgroundColor = '#ffffff';
        star.style.borderRadius = '50%';
        const size = Math.random() * 1.6 + 0.4 + 'px';
        star.style.width = size;
        star.style.height = size;
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.opacity = '0';
        star.style.animation = 'twinkle ' + (4 + Math.random() * 6) + 's ease-in-out infinite';
        star.style.animationDelay = Math.random() * 5 + 's';
        container.appendChild(star);
      }
    }

    if (!hasFinishedCb) {
      const generalStages = [
        'PROCESSING DATA STREAM...',
        'SYNCING NEURAL PATHWAYS...',
        'OPTIMIZING THREADS...',
        'CALCULATING COGNITIVE GRAPH...',
        'COMMUNICATION LINK STABLE',
      ];
      setStatusText(generalStages[0]);
      let idx = 0;
      const interval = setInterval(() => {
        idx = (idx + 1) % generalStages.length;
        setStatusText(generalStages[idx]);
      }, 3000);
      return () => clearInterval(interval);
    }

    let currentVal = 0;
    const progressInterval = setInterval(() => {
      const inc = Math.random() * 4 + 1;
      currentVal += inc;
      if (currentVal >= 100) {
        currentVal = 100;
        clearInterval(progressInterval);
        handleCompletion();
      }
      setProgress(currentVal);
      const stageIdx = Math.floor((currentVal / 100) * (stages.length - 1));
      setStatusText(stages[stageIdx]);
    }, 100);

    return () => clearInterval(progressInterval);
  }, [hasFinishedCb]);

  const handleCompletion = () => {
    // Notify electron main process
    try {
      if (window.electronAPI?.notifyAppReady) {
        window.electronAPI.notifyAppReady().catch(console.error);
      }
    } catch (e) {
      console.error('notifyAppReady error:', e);
    }

    if (onFinished) {
      setTimeout(() => {
        onFinished();
      }, 150);
    }
  };

  const progressWidth = hasFinishedCb ? `${progress}%` : '100%';

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#000000] text-white overflow-hidden select-none cursor-wait"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes twinkle {
              0%, 100% { opacity: 0.05; transform: scale(0.8); }
              50% { opacity: 0.55; transform: scale(1.1); }
            }
            @keyframes auraBreathe {
              0%, 100% { opacity: 0.35; transform: scale(1); }
              50% { opacity: 0.7; transform: scale(1.08); }
            }
            @keyframes ringSpin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            @keyframes ringSpinRev {
              from { transform: rotate(360deg); }
              to { transform: rotate(0deg); }
            }
            /* Shimmer that travels along the progress fill */
            @keyframes barSheen {
              0% { transform: translateX(-120%); }
              100% { transform: translateX(420%); }
            }
            /* Indeterminate sweep for general loading state */
            @keyframes barSweep {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(250%); }
            }
            @keyframes caretBlink {
              0%, 49% { opacity: 1; }
              50%, 100% { opacity: 0; }
            }
            @keyframes fadeUp {
              from { opacity: 0; transform: translateY(8px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `,
        }}
      />

      {/* Background Radial & Stars */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'radial-gradient(circle at 50% 42%, #06080c 0%, #000000 70%)' }}
      >
        <div
          className="absolute left-1/2 top-1/2 w-[640px] h-[640px] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(120,170,220,0.10) 0%, rgba(80,130,200,0.04) 38%, transparent 65%)',
            filter: 'blur(60px)',
            animation: 'auraBreathe 9s ease-in-out infinite',
          }}
        />
        <div ref={starsRef} className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_45%,rgba(0,0,0,0.92)_100%)]" />
      </div>

      {/* Center Branding & Progress */}
      <div className="relative z-10 flex flex-col items-center" style={{ animation: 'fadeUp 1s ease-out' }}>
        <div className="relative w-32 h-32 mb-9 flex items-center justify-center">
          <div
            className="absolute w-28 h-28 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(160,200,255,0.10) 0%, transparent 68%)',
              animation: 'auraBreathe 4s ease-in-out infinite',
            }}
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: '1px solid rgba(255,255,255,0.06)',
              borderTopColor: 'rgba(180,215,255,0.55)',
              animation: 'ringSpin 6s linear infinite',
            }}
          />
          <div
            className="absolute inset-[10px] rounded-full"
            style={{
              border: '1px solid rgba(255,255,255,0.04)',
              borderBottomColor: 'rgba(255,255,255,0.30)',
              animation: 'ringSpinRev 9s linear infinite',
            }}
          />
          <img
            src="./logo_withoutbackground.png"
            alt="AKKI Logo"
            className="w-[60px] h-[60px] object-contain relative z-10"
            style={{ filter: 'drop-shadow(0 0 12px rgba(180,215,255,0.25))' }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = './logo.png';
            }}
          />
        </div>

        <h1
          className="text-[28px] font-extralight tracking-[0.42em] text-white/90 pl-[0.42em]"
          style={{
            transform: 'translateZ(0)',
            willChange: 'transform',
            backfaceVisibility: 'hidden',
            WebkitFontSmoothing: 'antialiased',
            textRendering: 'geometricPrecision',
          }}
        >
          AKKI
        </h1>

        <div className="w-24 h-[1px] bg-gradient-to-r from-transparent via-white/25 to-transparent mt-3 mb-9" />

        <div className="w-[320px]">
          <div
            className="relative h-[3px] w-full rounded-full overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.06)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.03)',
            }}
          >
            {hasFinishedCb ? (
              <React.Fragment>
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: progressWidth,
                    background: 'linear-gradient(90deg, rgba(150,195,255,0.35) 0%, rgba(200,225,255,0.95) 100%)',
                    boxShadow: '0 0 10px rgba(170,210,255,0.6), 0 0 22px rgba(140,185,255,0.35)',
                    transition: 'width 0.18s ease-out',
                  }}
                />
                <div
                  className="absolute top-1/2 h-[7px] w-[7px] -translate-y-1/2 -translate-x-1/2 rounded-full pointer-events-none"
                  style={{
                    left: progressWidth,
                    background: '#eaf3ff',
                    boxShadow: '0 0 12px 3px rgba(200,225,255,0.85)',
                    transition: 'left 0.18s ease-out',
                  }}
                />
                <div
                  className="absolute inset-y-0 w-1/3 pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                    animation: 'barSheen 2.4s ease-in-out infinite',
                  }}
                />
              </React.Fragment>
            ) : (
              <div
                className="absolute inset-y-0 w-2/5 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(200,225,255,0.9), transparent)',
                  boxShadow: '0 0 12px rgba(170,210,255,0.5)',
                  animation: 'barSweep 1.6s ease-in-out infinite',
                }}
              />
            )}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span
              className="text-[10px] text-white/55 font-light tracking-[0.18em] uppercase"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              <span className="text-[#bcd8ff]" style={{ animation: 'caretBlink 1.1s step-end infinite' }}>
                &gt;
              </span>{' '}
              {statusText}
            </span>
            {hasFinishedCb && (
              <span
                className="text-[10px] text-white/70 font-light tracking-[0.1em] tabular-nums"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {progress.toFixed(0).padStart(3, '0')}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Fixed Footer Info */}
      <div
        className="absolute bottom-10 w-full px-12 flex justify-between items-end opacity-20 text-[9px] text-white/50 tracking-[0.2em] font-mono"
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        <div className="flex flex-col gap-1">
          <span>HOST: LOCALHOST</span>
          <span>PORT: SECURE:443</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span>STATUS: ACTIVE_SHIELD</span>
          <span>VER: 2.5.0-STAGE</span>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
