import { useCallback } from 'react';

export interface AudioHook {
  playSound: (src: string, volume?: number) => void;
  playClick: () => void;
  playHover: () => void;
  playAccessGranted: () => void;
  playAction: () => void;
  playAlert: () => void;
  playInit: () => void;
  playMic: () => void;
  playLoading: () => void;
  playTrading: () => void;
  playWebsearch: () => void;
}

export const useAudio = (): AudioHook => {
  const playSound = useCallback((nameOrSrc: string, volume = 0.5) => {
    try {
      let fileName = nameOrSrc;
      if (fileName.includes('/')) {
        const parts = fileName.split('/');
        fileName = parts[parts.length - 1];
      }
      if (!fileName.endsWith('.wav') && !fileName.endsWith('.mp3')) {
        fileName = `${fileName}.wav`;
      }

      const candidatePaths = [
        `/audio/${fileName}`,
        `audio/${fileName}`,
        `audio/audio/${fileName}`,
        `/audio/audio/${fileName}`,
      ];

      const tryPlayCandidate = (index: number) => {
        if (index >= candidatePaths.length) return;
        const audio = new Audio(candidatePaths[index]);
        audio.volume = Math.max(0, Math.min(1, volume));
        audio.play().catch(() => {
          tryPlayCandidate(index + 1);
        });
      };

      tryPlayCandidate(0);
    } catch (err) {
      console.warn('[useAudio] Playback failed for', nameOrSrc, err);
    }
  }, []);

  const playClick = useCallback(() => {
    playSound('button', 0.4);
  }, [playSound]);

  const playHover = useCallback(() => {
    playSound('hover', 0.25);
  }, [playSound]);

  const playAccessGranted = useCallback(() => {
    playSound('access_granted', 0.5);
  }, [playSound]);

  const playAction = useCallback(() => {
    playSound('action', 0.45);
  }, [playSound]);

  const playAlert = useCallback(() => {
    playSound('alert', 0.5);
  }, [playSound]);

  const playInit = useCallback(() => {
    playSound('initialize', 0.5);
  }, [playSound]);

  const playMic = useCallback(() => {
    playSound('mic', 0.45);
  }, [playSound]);

  const playLoading = useCallback(() => {
    playSound('loading', 0.4);
  }, [playSound]);

  const playTrading = useCallback(() => {
    playSound('trading', 0.45);
  }, [playSound]);

  const playWebsearch = useCallback(() => {
    playSound('websearch', 0.45);
  }, [playSound]);

  return {
    playSound,
    playClick,
    playHover,
    playAccessGranted,
    playAction,
    playAlert,
    playInit,
    playMic,
    playLoading,
    playTrading,
    playWebsearch,
  };
};
