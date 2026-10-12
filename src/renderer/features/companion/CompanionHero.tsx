import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/state/useAppStore';
import { useAudio } from '@/shared/hooks/useAudio';
import { useGeminiLive } from '@/shared/hooks/useGeminiLive';
import { CompanionNodeTriggers } from './CompanionNodeTriggers';
import { CompanionOrbCard } from './CompanionOrbCard';

export const CompanionHero: React.FC = () => {
  const {
    assistantStatus,
    setAssistantStatus,
    setActiveModal,
  } = useAppStore();

  const { playClick, playInit } = useAudio();

  const {
    connect,
    handleStartStop,
    toggleMic,
    isMicMuted,
    isAISpeaking,
    status: liveStatus,
  } = useGeminiLive();

  // Auto-connect to Live Voice 1500ms after startup (matching legacy kb() and __akkiColdStart)
  useEffect(() => {
    if ((window as any).__akkiAutoStartDone) return;
    (window as any).__akkiAutoStartDone = true;
    const timer = setTimeout(() => {
      try {
        (window as any).__akkiColdStart = true;
        connect();
      } catch (err) {
        console.warn('[CompanionHero] Auto-start error:', err);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [connect]);

  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(window.innerWidth);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Resize observer to track exact available container width in center column
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);

    const el = wrapperRef.current?.parentElement || wrapperRef.current;
    let ro: ResizeObserver | null = null;
    if (el) {
      const updateWidth = () => {
        const w = el.getBoundingClientRect().width;
        if (w > 0) setContainerWidth(w);
      };
      updateWidth();
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0) {
            setContainerWidth(entry.contentRect.width);
          }
        }
      });
      ro.observe(el);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (ro) ro.disconnect();
    };
  }, []);

  // 1920x1080 is baseline perfect: gap is 340px, scale is 1
  // On narrower screen containers (1600x900, 1280x800), gap contracts and scale fits container perfectly
  const isLargeScreen = windowWidth >= 1900 || containerWidth >= 920;
  const baseGap = isLargeScreen ? 340 : Math.max(30, Math.min(340, containerWidth - 620));
  const naturalWidth = 220 + baseGap + 400; // 620 + baseGap
  const scale = isLargeScreen ? 1 : Math.min(1, Math.max(0.4, (containerWidth - 12) / naturalWidth));
  const gapToGlobe = baseGap;

  // Camera Management
  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    setIsCameraOn(false);
  };

  const handleToggleCamera = async () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 480, height: 320 },
          audio: false,
        });
        cameraStreamRef.current = stream;
        setIsCameraOn(true);
        setTimeout(() => {
          if (previewVideoRef.current) {
            previewVideoRef.current.srcObject = stream;
          }
        }, 50);
      } catch (err) {
        console.warn('[CompanionHero] Camera permission or device error:', err);
        stopCamera();
      }
    }
  };

  // Screen Share Management
  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);
  };

  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        screenStreamRef.current = stream;
        setIsScreenSharing(true);
        stream.getVideoTracks()[0].onended = () => {
          stopScreenShare();
        };
        setTimeout(() => {
          if (previewVideoRef.current) {
            previewVideoRef.current.srcObject = stream;
          }
        }, 50);
      } catch (err) {
        console.warn('[CompanionHero] Screen sharing error:', err);
        stopScreenShare();
      }
    }
  };

  const legacyStatus =
    liveStatus === 'speaking' || liveStatus === 'listening'
      ? 'CONNECTED'
      : liveStatus === 'thinking'
      ? 'CONNECTING'
      : 'STANDBY';

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full flex items-center justify-center overflow-hidden"
    >
      <div
        className="flex items-center justify-center shrink-0 relative pt-2 md:pt-4 transition-transform duration-200 origin-center"
        style={{
          gap: gapToGlobe,
          transform: scale < 1 ? `scale(${scale})` : undefined,
        }}
      >
        {/* ── Left Trigger Nodes (Memory, Soul, Skills, Settings with dynamic SVG fiber lines) ── */}
        <div className="w-[220px] shrink-0 z-0 flex flex-col justify-center">
          <CompanionNodeTriggers
            setIsMemoryModalOpen={() => setActiveModal('memory')}
            setMemoryModalTab={() => setActiveModal('memory')}
            setIsSoulModalOpen={() => setActiveModal('soul')}
            setIsSkillsModalOpen={() => setActiveModal('skills')}
            setIsSettingsModalOpen={() => setActiveModal('settings')}
            playClick={playClick}
            gapToGlobe={gapToGlobe + 20}
          />
        </div>

        {/* ── Center Stage Holographic Orb & Camera / Screen Hub ───────── */}
        <div className="relative z-10 flex flex-col items-center justify-center p-2 shrink-0 h-full origin-center">
          <video ref={previewVideoRef} autoPlay playsInline muted className="hidden" aria-hidden="true" />
          <canvas width={640} height={480} className="hidden" aria-hidden="true" />
          <CompanionOrbCard
            status={legacyStatus}
            isAISpeaking={assistantStatus === 'speaking'}
            handleStartStop={handleStartStop}
            isMicMuted={isMicMuted}
            toggleMic={toggleMic}
            isCameraOn={isCameraOn}
            isScreenSharing={isScreenSharing}
            previewVideoRef={previewVideoRef as any}
            toggleCamera={handleToggleCamera}
            toggleScreenShare={handleToggleScreenShare}
            playClick={playClick}
          />
        </div>
      </div>
    </div>
  );
};
