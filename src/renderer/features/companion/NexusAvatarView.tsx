import React, { useEffect, useRef, useState } from 'react';
import { HolographicOrb } from './HolographicOrb';

interface NexusAvatarViewProps {
  isSpeaking: boolean;
  isConnected: boolean;
  isConnecting?: boolean;
  analyser?: AnalyserNode | null;
  micAnalyser?: AnalyserNode | null;
  size?: number;
}

export const NexusAvatarView: React.FC<NexusAvatarViewProps> = ({
  isSpeaking,
  isConnected,
  isConnecting = false,
  analyser,
  micAnalyser,
  size = 250,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const NexusAvatar = (window as any).NexusAvatar;

    if (!canvas || !NexusAvatar) {
      return;
    }

    try {
      NexusAvatar.init(canvas, {
        modelPath: './assets/nexus.glb',
        isSpeaking,
        isConnected,
        analyser: analyser || null,
        micAnalyser: micAnalyser || null,
        onReady: () => {
          setEngineReady(true);
        },
      });
    } catch (err) {
      console.warn('[NexusAvatarView] Failed to initialize Nexus avatar:', err);
      setHasError(true);
    }

    return () => {
      try {
        NexusAvatar?.destroy?.();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    const NexusAvatar = (window as any).NexusAvatar;
    if (!NexusAvatar || !engineReady) return;

    try {
      NexusAvatar.setAISpeaking?.(isSpeaking);
    } catch (_) {}
  }, [isSpeaking, engineReady]);

  useEffect(() => {
    const NexusAvatar = (window as any).NexusAvatar;
    if (!NexusAvatar || !engineReady) return;

    try {
      NexusAvatar.setConnected?.(isConnected);
    } catch (_) {}
  }, [isConnected, engineReady]);

  useEffect(() => {
    const NexusAvatar = (window as any).NexusAvatar;
    if (!NexusAvatar || !engineReady) return;

    try {
      if (analyser) NexusAvatar.setAudioAnalyser?.(analyser);
      if (micAnalyser) NexusAvatar.setMicAnalyser?.(micAnalyser);
    } catch (_) {}
  }, [analyser, micAnalyser, engineReady]);

  if (hasError) {
    return (
      <HolographicOrb
        isSpeaking={isSpeaking}
        isConnected={isConnected}
        isConnecting={isConnecting}
        analyser={analyser}
        micAnalyser={micAnalyser}
        size={size}
      />
    );
  }

  return (
    <div
      className="relative flex items-center justify-center overflow-hidden"
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className={`w-full h-full object-contain transition-opacity duration-700 ${
          engineReady ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {!engineReady && (
        <div className="absolute inset-0 flex items-center justify-center">
          <HolographicOrb
            isSpeaking={isSpeaking}
            isConnected={isConnected}
            isConnecting={isConnecting}
            analyser={analyser}
            micAnalyser={micAnalyser}
            size={size}
          />
        </div>
      )}
    </div>
  );
};
