import React, { useRef, useMemo, useEffect } from 'react';

interface HolographicOrbProps {
  isSpeaking?: boolean;
  isConnected?: boolean;
  isConnecting?: boolean;
  analyser?: AnalyserNode | null;
  micAnalyser?: AnalyserNode | null;
  size?: number;
}

interface ParticlePoint {
  x: number;
  y: number;
  z: number;
  isLand: boolean;
  type: number;
  offset: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

export const HolographicOrb: React.FC<HolographicOrbProps> = ({
  isSpeaking = false,
  isConnected = false,
  isConnecting = false,
  analyser = null,
  micAnalyser = null,
  size = 250,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioLevelRef = useRef<number>(0);

  const PARTICLE_COUNT = 1200;
  const radius = size * 0.35;
  const perspective = size * 0.8;
  const themeAccent = typeof window !== 'undefined'
    ? getComputedStyle(document.documentElement).getPropertyValue('--accent-cyan')?.trim() || '#00E5FF'
    : '#00E5FF';

  const COLORS = {
    cyan: themeAccent,
    amber: '#FFD600',
    white: '#FFFFFF',
    void: '#050D0F',
  };

  // Generate 3D sphere point cloud with land/ocean distribution
  const points = useMemo(() => {
    const pts: ParticlePoint[] = [];
    const isLandCheck = (lat: number, lon: number) => {
      // Coarse approximation of earth continents
      if (lon > -100 && lon < -30 && lat > -40 && lat < 50) return true; // Americas
      if (lon > -20 && lon < 140 && lat > -35 && lat < 70) {
        if (lon > 40 && lon < 100 && lat < 10) return false; // Indian ocean
        return true; // Eurasia & Africa
      }
      if (lon > 110 && lon < 155 && lat > -45 && lat < -10) return true; // Australia
      return false;
    };

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const z = Math.random() * 2 - 1;
      const phi = Math.random() * 2 * Math.PI;
      const rad = Math.sqrt(1 - z * z);
      const lat = Math.asin(z) * (180 / Math.PI);
      const lon = phi * (180 / Math.PI) - 180;

      pts.push({
        x: rad * Math.cos(phi),
        y: rad * Math.sin(phi),
        z: z,
        isLand: isLandCheck(lat, lon),
        type: Math.random() > 0.5 ? 1 : 0,
        offset: Math.random() * Math.PI * 2,
      });
    }
    return pts;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rotY = 0;
    const rotX = 0.3;
    let waveTime = 0;
    const targetFpsInterval = 1000 / 30;
    let lastTime = 0;

    const dynamicPoints = points.map((p) => ({ ...p, rx: 0, ry: 0, rz: 0 }));
    const speakerData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const micData = micAnalyser ? new Uint8Array(micAnalyser.frequencyBinCount) : null;

    const render = (time: number) => {
      animFrameRef.current = requestAnimationFrame(render);
      if (time - lastTime < targetFpsInterval) return;

      const delta = lastTime === 0 ? 16.67 : time - lastTime;
      const speedFactor = Math.min(delta / 16.67, 3);
      lastTime = time;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      ctx.clearRect(0, 0, w, h);

      const isActive = isConnected || isSpeaking;
      let audioInput = 0;

      const calcVolume = (aNode: AnalyserNode, buf: any) => {
        aNode.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        return sum / buf.length / 128;
      };

      if (analyser && speakerData) audioInput += calcVolume(analyser, speakerData);
      if (micAnalyser && micData) audioInput += calcVolume(micAnalyser, micData);
      audioInput = Math.min(1, audioInput);

      audioLevelRef.current += (audioInput - audioLevelRef.current) * Math.min(1, 0.15 * speedFactor);

      const rotSpeed = isActive
        ? 0.008 + audioLevelRef.current * 0.02
        : 0.003;
      rotY += rotSpeed * speedFactor;
      waveTime += 0.04 * speedFactor;

      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);

      // Rotate points
      for (let i = 0; i < dynamicPoints.length; i++) {
        const p = dynamicPoints[i];
        const px = p.x * cosY - p.z * sinY;
        let pz = p.x * sinY + p.z * cosY;
        const py = p.y * cosX - pz * sinX;
        pz = p.y * sinX + pz * cosX;

        p.rx = px;
        p.ry = py;
        p.rz = pz;
      }

      // Sort points back to front (depth order)
      dynamicPoints.sort((a, b) => (a.rz ?? 0) - (b.rz ?? 0));

      // Draw radial halo glow
      const glowOpacity = isActive ? 0.15 + audioLevelRef.current * 0.1 : 0.05;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.4);
      grad.addColorStop(0, isActive ? `rgba(0, 229, 255, ${glowOpacity})` : `rgba(200, 200, 200, ${glowOpacity})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Render particles
      dynamicPoints.forEach((p) => {
        const rz = p.rz ?? 0;
        const scale = perspective / (perspective - rz * radius);
        const wave = isActive ? Math.sin(waveTime * 3 + p.offset) * 1.5 : 0;
        const audioDisplacement = audioLevelRef.current * 18 * Math.random();
        const totalDisplacement = wave + audioDisplacement;

        const screenX = (p.rx ?? 0) * (radius + totalDisplacement) * scale + cx;
        const screenY = (p.ry ?? 0) * (radius + totalDisplacement) * scale + cy;
        const depthAlpha = (rz + 1) / 2;
        let alpha = Math.max(0.1, depthAlpha);

        if (!isActive) {
          alpha *= 0.3;
          ctx.fillStyle = COLORS.white;
        } else {
          const color = p.x < 0 ? COLORS.cyan : COLORS.amber;
          if (p.isLand) {
            ctx.fillStyle = color;
            alpha = Math.min(1, alpha + 0.4 + audioLevelRef.current * 0.4);
            if (audioLevelRef.current > 0.1) {
              const pulse = (Math.sin(waveTime * 6 + p.offset) + 1) / 2;
              alpha = 0.6 + pulse * 0.4;
            }
          } else {
            ctx.fillStyle = COLORS.cyan;
            alpha *= 0.2;
          }
        }

        ctx.globalAlpha = Math.min(1, alpha);
        const pSize = (p.isLand ? 1.5 : 0.8) * scale;
        ctx.fillRect(screenX, screenY, pSize, pSize);
      });

      // Active orbital energy rings
      if (isActive) {
        const reactiveOffset = audioLevelRef.current * 25;
        ctx.globalAlpha = 0.1 + audioLevelRef.current * 0.3;

        ctx.strokeStyle = COLORS.amber;
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius * 1.15 + reactiveOffset, radius * 0.25 + reactiveOffset * 0.4, rotY * 0.3, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = COLORS.cyan;
        ctx.beginPath();
        ctx.ellipse(cx, cy, radius * 1.25 + reactiveOffset, radius * 0.35 + reactiveOffset * 0.4, -rotY * 0.2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
      } else {
        if (!animFrameRef.current) {
          lastTime = 0;
          animFrameRef.current = requestAnimationFrame(render);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [points, isSpeaking, isConnected, isConnecting, analyser, micAnalyser, radius, perspective]);

  return (
    <div
      className="relative flex items-center justify-center overflow-hidden"
      style={{ width: size, height: size }}
    >
      {/* Background Soft Glow */}
      <div
        className={`absolute inset-0 rounded-full transition-all duration-700 ${
          isSpeaking ? 'opacity-20 scale-100' : 'opacity-0 scale-90'
        }`}
        style={{
          background: `radial-gradient(circle at center, ${COLORS.cyan} 0%, transparent 70%)`,
        }}
      />
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="relative z-10"
      />
    </div>
  );
};
