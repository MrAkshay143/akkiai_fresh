/**
 * Real Audio Player & Sound FX Engine for AKKI AI
 * Connects directly to HTML5 Audio and Web Audio API with real BGM and UI sound effects.
 */

export interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  fallbackUrls?: string[];
  duration?: string;
}

export const PLAYLIST: Track[] = [
  {
    id: 'phir-bhi-tumko',
    title: 'Phir Bhi Tumko Chaahunga',
    artist: 'Half Girlfriend',
    url: '/audio/bgm.mp3',
    fallbackUrls: ['audio/bgm.mp3', 'audio/audio/bgm.mp3', '/audio/audio/bgm.mp3'],
    duration: '04:12',
  },
  {
    id: 'cyber-bgm',
    title: 'Cyberpunk Ambient Stream (BGM)',
    artist: 'Akki Synthwave Studio',
    url: '/audio/bgm.mp3',
    fallbackUrls: ['audio/bgm.mp3', 'audio/audio/bgm.mp3'],
    duration: '03:45',
  },
];

export type SfxName =
  | 'access_granted'
  | 'action'
  | 'alert'
  | 'button'
  | 'hover'
  | 'initialize'
  | 'loading'
  | 'mic'
  | 'trading'
  | 'websearch';

class AudioPlayerService {
  private audio: HTMLAudioElement | null = null;
  private currentTrackIndex = 0;
  private isMuted = false;
  private volume = 0.6;
  private currentTime = 0;
  private duration = 252; // 04:12 default
  private onStateChangeCb: ((isPlaying: boolean, track: Track) => void) | null = null;
  private onTimeUpdateCb: ((currentTime: number, duration: number) => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initAudio();
    }
  }

  private initAudio(): void {
    if (this.audio) return;
    this.audio = new Audio();
    this.audio.volume = this.volume;

    this.audio.addEventListener('play', () => {
      this.notifyState(true);
    });

    this.audio.addEventListener('pause', () => {
      this.notifyState(false);
    });

    this.audio.addEventListener('ended', () => {
      this.next();
    });

    this.audio.addEventListener('timeupdate', () => {
      if (this.audio) {
        this.currentTime = this.audio.currentTime;
        if (this.audio.duration && !isNaN(this.audio.duration)) {
          this.duration = this.audio.duration;
        }
        if (this.onTimeUpdateCb) {
          this.onTimeUpdateCb(this.currentTime, this.duration);
        }
      }
    });

    this.audio.addEventListener('loadedmetadata', () => {
      if (this.audio && this.audio.duration && !isNaN(this.audio.duration)) {
        this.duration = this.audio.duration;
      }
    });

    this.audio.addEventListener('error', (e) => {
      console.warn('[AudioPlayer] Audio playback error:', e);
      // Strictly never autoplay on error unless the user explicitly requested playback
      this.notifyState(false);
    });
  }

  public setOnStateChange(cb: (isPlaying: boolean, track: Track) => void): void {
    this.onStateChangeCb = cb;
  }

  public setOnTimeUpdate(cb: (currentTime: number, duration: number) => void): void {
    this.onTimeUpdateCb = cb;
  }

  private notifyState(isPlaying: boolean): void {
    if (this.onStateChangeCb) {
      this.onStateChangeCb(isPlaying, this.getCurrentTrack());
    }
  }

  public getCurrentTrack(): Track {
    return PLAYLIST[this.currentTrackIndex];
  }

  public isPlaying(): boolean {
    return !!this.audio && !this.audio.paused;
  }

  public async play(): Promise<void> {
    this.initAudio();
    if (!this.audio) return;
    try {
      if (!this.audio.src || this.audio.src === '') {
        this.audio.src = PLAYLIST[this.currentTrackIndex].url;
      }
      await this.audio.play();
      this.notifyState(true);
    } catch (err) {
      console.warn('[AudioPlayer] Play prevented, trying fallback path:', err);
      try {
        if (this.audio) {
          this.audio.src = 'audio/audio/bgm.mp3';
          await this.audio.play();
          this.notifyState(true);
        }
      } catch (e2) {
        this.notifyState(false);
      }
    }
  }

  public pause(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.notifyState(false);
  }

  public toggle(): Promise<void> | void {
    if (this.isPlaying()) {
      this.pause();
    } else {
      return this.play();
    }
  }

  public next(): void {
    this.currentTrackIndex = (this.currentTrackIndex + 1) % PLAYLIST.length;
    if (this.audio) {
      this.audio.src = PLAYLIST[this.currentTrackIndex].url;
      this.play();
    }
  }

  public prev(): void {
    this.currentTrackIndex = (this.currentTrackIndex - 1 + PLAYLIST.length) % PLAYLIST.length;
    if (this.audio) {
      this.audio.src = PLAYLIST[this.currentTrackIndex].url;
      this.play();
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(val: number): void {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.audio) {
      this.audio.volume = this.volume;
      this.audio.muted = this.volume === 0;
    }
  }

  public toggleMute(): boolean {
    if (!this.audio) return false;
    this.isMuted = !this.isMuted;
    this.audio.muted = this.isMuted;
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public seek(seconds: number): void {
    if (this.audio && !isNaN(seconds)) {
      this.audio.currentTime = Math.max(0, Math.min(this.duration, seconds));
    }
  }

  public getCurrentTime(): number {
    return this.currentTime;
  }

  public getDuration(): number {
    return this.duration;
  }

  /**
   * Plays native cyberpunk UI sound effects
   */
  public playSfx(name: SfxName): void {
    try {
      const src1 = `/audio/${name}.wav`;
      const sfx = new Audio(src1);
      sfx.volume = 0.35;
      sfx.play().catch(() => {
        const src2 = `audio/${name}.wav`;
        const fb1 = new Audio(src2);
        fb1.volume = 0.35;
        fb1.play().catch(() => {
          const src3 = `audio/audio/${name}.wav`;
          const fb2 = new Audio(src3);
          fb2.volume = 0.35;
          fb2.play().catch(() => {});
        });
      });
    } catch (_) {}
  }
}

export const audioPlayer = new AudioPlayerService();
