import React from 'react';
import { Camera, Monitor, Mic, MicOff, Loader2 } from 'lucide-react';
import { NexusAvatarView } from './NexusAvatarView';
import { HolographicOrb } from './HolographicOrb';

interface CompanionOrbCardProps {
  status: string; // 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'STANDBY' | 'ONLINE'
  isAISpeaking: boolean;
  analyser?: AnalyserNode | null;
  micAnalyser?: AnalyserNode | null;
  handleStartStop: () => void;
  isMicMuted: boolean;
  toggleMic: () => void;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  previewVideoRef: React.RefObject<HTMLVideoElement>;
  toggleCamera: () => void;
  toggleScreenShare: () => void;
  isCameraLoading?: boolean;
  isScreenLoading?: boolean;
  playClick: () => void;
}

export const CompanionOrbCard: React.FC<CompanionOrbCardProps> = ({
  status,
  isAISpeaking,
  analyser,
  micAnalyser,
  handleStartStop,
  isMicMuted,
  toggleMic,
  isCameraOn,
  isScreenSharing,
  previewVideoRef,
  toggleCamera,
  toggleScreenShare,
  isCameraLoading = false,
  isScreenLoading = false,
  playClick,
}) => {
  const isOnline = status === 'CONNECTED' || status === 'ONLINE';
  const isConnecting = status === 'CONNECTING';

  return (
    <div className="flex flex-col items-center justify-center z-10 w-[400px] h-[400px]">
      <div className="w-full h-full rounded-[2.5rem] border border-[rgba(0,229,255,0.12)] bg-[#0b141b] shadow-[0_4px_60px_rgba(0,0,0,0.6),0_0_30px_rgba(0,229,255,0.05)] relative flex flex-col items-center justify-center p-5 overflow-hidden gap-2">
        {/* ── Top Controls: Camera & Screen Share ──────────────────────── */}
        <div className="absolute right-6 top-6 z-30 flex flex-col gap-2.5">
          {/* Camera Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              playClick();
              toggleCamera();
            }}
            disabled={isCameraLoading}
            title={isCameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
            className={`w-[36px] h-[36px] flex items-center justify-center rounded-full border transition-all duration-300 shadow-lg focus:outline-none focus:ring-0 focus-visible:outline-none ${
              isCameraOn
                ? 'bg-red-500/10 text-red-500 border-red-500/40 hover:bg-red-500/20 hover:border-red-500 hover:shadow-[0_0_12px_rgba(239,68,68,0.25)]'
                : 'bg-[#0b141b]/80 text-white/45 border-white/10 hover:bg-white/5 hover:border-white/20 hover:text-white'
            }`}
          >
            {isCameraLoading ? (
              <Loader2 size={15} className="animate-spin text-j-cyan" />
            ) : (
              <Camera size={15} />
            )}
          </button>

          {/* Screen Share Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              playClick();
              toggleScreenShare();
            }}
            disabled={isScreenLoading}
            title={isScreenSharing ? 'Stop Screen Share' : 'Start Screen Share'}
            className={`w-[36px] h-[36px] flex items-center justify-center rounded-full border transition-all duration-300 shadow-lg focus:outline-none focus:ring-0 focus-visible:outline-none ${
              isScreenSharing
                ? 'bg-red-500/10 text-red-500 border-red-500/40 hover:bg-red-500/20 hover:border-red-500 hover:shadow-[0_0_12px_rgba(239,68,68,0.25)]'
                : 'bg-[#0b141b]/80 text-white/45 border-white/10 hover:bg-white/5 hover:border-white/20 hover:text-white'
            }`}
          >
          {isScreenLoading ? (
            <Loader2 size={15} className="animate-spin text-j-cyan" />
          ) : (
            <Monitor size={15} />
          )}
        </button>
      </div>

      {/* Connection dot indicator */}
      <div
        className="absolute left-5 top-1/2 -translate-y-1/2 w-[4px] h-[4px] rounded-full bg-[#60a5fa]"
        style={{ boxShadow: '0 0 10px 1px rgba(59, 130, 246, 0.8)' }}
      />

      {/* ── Center Stage: Video Preview or Holographic Earth Globe ────── */}
      <div className="relative flex-none w-full h-[250px] flex items-center justify-center mt-1">
        {isCameraOn || isScreenSharing ? (
          <div
            className={`relative overflow-hidden bg-[#0a1118]/80 transition-all duration-500 flex items-center justify-center ${
              isScreenSharing
                ? 'w-[280px] h-[180px] rounded-2xl border border-j-cyan/35 shadow-[0_0_25px_rgba(0,229,255,0.25)]'
                : 'w-[200px] h-[200px] rounded-full border border-red-500/35 shadow-[0_0_25px_rgba(239,68,68,0.25)]'
            }`}
          >
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex gap-2">
              {isCameraOn && (
                <div className="px-2.5 py-0.5 rounded-full bg-red-500/85 backdrop-blur-md text-[8px] font-bold text-white uppercase tracking-wider animate-pulse flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" /> Live
                </div>
              )}
              {isScreenSharing && (
                <div className="px-2.5 py-0.5 rounded-full bg-j-cyan/85 backdrop-blur-md text-[8px] font-bold text-black uppercase tracking-wider flex items-center gap-1">
                  <Monitor size={9} /> Screen
                </div>
              )}
            </div>
            <video
              ref={previewVideoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover ${
                isScreenSharing ? 'rounded-2xl' : 'rounded-full'
              }`}
            />
          </div>
        ) : (
          <div className="pointer-events-none w-full flex justify-center">
            <NexusAvatarView
              isSpeaking={isAISpeaking}
              isConnected={isOnline}
              isConnecting={isConnecting}
              analyser={analyser}
              micAnalyser={micAnalyser}
              size={250}
            />
          </div>
        )}
      </div>

      {/* ── Status Text & Pulsing Bars ─────────────────────────────────── */}
      <div className="flex flex-col items-center gap-3 w-full shrink-0 z-20 mt-1">
        <div className="flex items-center gap-3">
          <div
            className={`w-1 h-1 rounded-full ${
              isOnline
                ? 'bg-[#00E5FF] shadow-[0_0_8px_#00E5FF] animate-pulse'
                : 'bg-white/20'
            }`}
          />
          <span
            className={`text-[9px] font-black tracking-[0.4em] uppercase font-mono ${
              isOnline
                ? 'text-[#00E5FF] text-glow'
                : isConnecting
                ? 'text-[#FFC700]'
                : 'text-[#4B636B]'
            }`}
          >
            {isOnline
              ? 'System Active'
              : isConnecting
              ? 'Calibrating...'
              : 'System Standby'}
          </span>
          <div
            className={`w-1 h-1 rounded-full ${
              isOnline
                ? 'bg-[#00E5FF] shadow-[0_0_8px_#00E5FF] animate-pulse'
                : 'bg-white/20'
            }`}
          />
        </div>

        {/* ── Start / Stop AI & Mic Button ─────────────────────────────── */}
        <div className="relative flex items-center justify-center w-[260px] h-10 mt-2">
          <button
            onClick={handleStartStop}
            className={`w-[170px] h-[34px] rounded-full border text-[10px] font-black transition-all duration-300 uppercase tracking-[0.3em] flex items-center justify-center focus:outline-none focus:ring-0 focus-visible:outline-none ${
              isOnline
                ? 'border-red-500/40 text-red-500 bg-red-500/10 shadow-[0_0_15px_rgba(239,68,68,0.15)] hover:bg-red-500/20 hover:border-red-500 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]'
                : 'border-j-cyan/30 text-j-cyan bg-j-cyan/5 shadow-[0_0_15px_rgba(0,229,255,0.05)] hover:bg-j-cyan/15 hover:border-j-cyan hover:text-[#fff] hover:shadow-[0_0_20px_rgba(0,229,255,0.2)]'
            }`}
          >
            {isOnline ? 'Terminate' : 'Start AI'}
          </button>

          {/* Mic Button positioned to the right of Start AI */}
          <div
            className={`absolute right-0 flex items-center transition-all duration-500 ${
              isOnline ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'
            }`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMic();
              }}
              className={`w-[36px] h-[36px] flex items-center justify-center rounded-full border transition-all duration-300 shadow-lg focus:outline-none focus:ring-0 focus-visible:outline-none ${
                isMicMuted
                  ? 'bg-red-500/15 text-red-400 border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.25)]'
                  : 'bg-j-cyan/15 text-j-cyan border-j-cyan/40 shadow-[0_0_12px_rgba(0,229,255,0.25)]'
              }`}
              title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              {isMicMuted ? <MicOff size={15} /> : <Mic size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};
