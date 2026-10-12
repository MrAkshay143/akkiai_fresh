import React, { useRef, useState, useLayoutEffect } from 'react';
import { Database, Sparkles, Cpu, Settings } from 'lucide-react';

interface CompanionNodeTriggersProps {
  setIsMemoryModalOpen: (open: boolean) => void;
  setMemoryModalTab?: (tab: string) => void;
  setIsSettingsModalOpen: (open: boolean) => void;
  setIsSkillsModalOpen: (open: boolean) => void;
  setIsSoulModalOpen: (open: boolean) => void;
  playClick: () => void;
  gapToGlobe?: number;
}

interface NodeItem {
  label: string;
  color: string;
  Icon: React.ComponentType<{ size: number; strokeWidth?: number; className?: string }>;
}

const NODES: NodeItem[] = [
  { label: 'Memory', color: '#22c55e', Icon: Database },
  { label: 'Soul', color: '#94a3b8', Icon: Sparkles },
  { label: 'Skills', color: '#06b6d4', Icon: Cpu },
  { label: 'Settings', color: '#ef4444', Icon: Settings },
];

export const CompanionNodeTriggers: React.FC<CompanionNodeTriggersProps> = ({
  setIsMemoryModalOpen,
  setMemoryModalTab,
  setIsSettingsModalOpen,
  setIsSkillsModalOpen,
  setIsSoulModalOpen,
  playClick,
  gapToGlobe = 56,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);

  const [svgWidth, setSvgWidth] = useState(240);
  const [svgHeight, setSvgHeight] = useState(320);
  const [globeX, setGlobeX] = useState(240);
  const [globeY, setGlobeY] = useState(160);
  const [trunkStartX, setTrunkStartX] = useState(0);
  const [paths, setPaths] = useState<
    Array<{ d: string; color: string; x1: number; y1: number }>
  >([]);

  useLayoutEffect(() => {
    const updateGeometry = () => {
      const el = containerRef.current;
      if (!el) return;

      const w = el.offsetWidth || el.getBoundingClientRect().width;
      const h = el.offsetHeight || el.getBoundingClientRect().height;
      const targetX = w + gapToGlobe;
      const centerY = h / 2;

      setSvgWidth(targetX);
      setSvgHeight(h);
      setGlobeX(targetX);
      setGlobeY(centerY);

      const trunkStart = w + gapToGlobe * 0.35;
      setTrunkStartX(trunkStart);

      const calculatedPaths = buttonRefs.current.map((btn, idx) => {
        const fallback = { d: '', color: NODES[idx].color, x1: w, y1: centerY };
        if (!btn) return fallback;

        const startX = btn.offsetLeft + btn.offsetWidth;
        const startY = btn.offsetTop + btn.offsetHeight / 2;
        const controlXDist = trunkStart - startX;
        const cp1X = startX + controlXDist * 0.55;
        const cp2X = trunkStart - controlXDist * 0.15;

        const pathD = `M ${startX.toFixed(1)} ${startY.toFixed(1)} C ${cp1X.toFixed(1)} ${startY.toFixed(1)}, ${cp2X.toFixed(1)} ${centerY.toFixed(1)}, ${trunkStart.toFixed(1)} ${centerY.toFixed(1)}`;

        return {
          d: pathD,
          color: NODES[idx].color,
          x1: startX,
          y1: startY,
        };
      });

      setPaths(calculatedPaths);
    };

    updateGeometry();
    const observer = new ResizeObserver(updateGeometry);
    if (containerRef.current) observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [gapToGlobe]);

  const handleClicks = [
    () => {
      playClick();
      setMemoryModalTab?.('memory');
      setIsMemoryModalOpen(true);
    },
    () => {
      playClick();
      setIsSoulModalOpen(true);
    },
    () => {
      playClick();
      setIsSkillsModalOpen(true);
    },
    () => {
      playClick();
      setIsSettingsModalOpen(true);
    },
  ];

  const hasCompletePaths = paths.length === 4 && svgWidth > 0;

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col justify-center gap-[22px] w-full py-8"
    >
      {/* ── Dynamic Animated SVG Fiber Optic Lines ──────────────────────── */}
      <svg
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: svgWidth,
          height: svgHeight,
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: 0,
        }}
        aria-hidden="true"
      >
        <defs>
          {paths.map((p, idx) => (
            <linearGradient
              key={idx}
              id={`tc-grad-${idx}`}
              gradientUnits="userSpaceOnUse"
              x1={p.x1}
              y1={p.y1}
              x2={globeX}
              y2={globeY}
            >
              <stop offset="0%" stopColor={p.color} stopOpacity="1" />
              <stop offset="100%" stopColor={p.color} stopOpacity="0.6" />
            </linearGradient>
          ))}
          <filter id="tc-blur-soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
          </filter>
          <filter id="tc-blur-mid" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="tc-node-halo" x="-300%" y="-300%" width="700%" height="700%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Individual Node Paths with Moving Light Sparks */}
        {paths.map(
          (p, idx) =>
            p.d && (
              <g key={idx}>
                {/* Wide soft glow underlay */}
                <path
                  id={`tc-path-${idx}`}
                  d={p.d}
                  stroke={p.color}
                  strokeWidth="7"
                  fill="none"
                  strokeLinecap="round"
                  opacity="0.1"
                  filter="url(#tc-blur-soft)"
                />
                {/* Mid glow */}
                <path
                  d={p.d}
                  stroke={`url(#tc-grad-${idx})`}
                  strokeWidth="2.5"
                  fill="none"
                  strokeLinecap="round"
                  opacity="0.45"
                  filter="url(#tc-blur-mid)"
                />
                {/* Crisp sharp laser core */}
                <path
                  d={p.d}
                  stroke={`url(#tc-grad-${idx})`}
                  strokeWidth="1.2"
                  fill="none"
                  strokeLinecap="round"
                  opacity="1"
                />
                {/* Moving dash pattern */}
                <path
                  d={p.d}
                  stroke={p.color}
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray="10 500"
                  opacity="0.85"
                  filter="url(#tc-blur-mid)"
                >
                  <animate
                    attributeName="strokeDashoffset"
                    from="510"
                    to="0"
                    dur={`${2.4 + idx * 0.28}s`}
                    repeatCount="indefinite"
                  />
                </path>
                {/* Anchor connection pin */}
                <line
                  x1={p.x1}
                  y1={p.y1 - 5}
                  x2={p.x1}
                  y2={p.y1 + 5}
                  stroke={p.color}
                  strokeWidth="1.2"
                  opacity="0.55"
                  strokeLinecap="round"
                />
                <circle cx={p.x1} cy={p.y1} r="2.4" fill={p.color} opacity="0.9" filter="url(#tc-blur-mid)" />
                <circle cx={p.x1} cy={p.y1} r="1.2" fill="white" opacity="0.7" />

                {/* Traveling photon packets */}
                <circle r="2.2" fill={p.color} opacity="0.95" filter="url(#tc-blur-mid)">
                  <animateMotion dur={`${1.6 + idx * 0.25}s`} begin={`${idx * 0.4}s`} repeatCount="indefinite">
                    <mpath href={`#tc-path-${idx}`} />
                  </animateMotion>
                </circle>
                <circle r="1.3" fill={p.color} opacity="0.55">
                  <animateMotion
                    dur={`${1.6 + idx * 0.25}s`}
                    begin={`${idx * 0.4 + (1.6 + idx * 0.25) * 0.5}s`}
                    repeatCount="indefinite"
                  >
                    <mpath href={`#tc-path-${idx}`} />
                  </animateMotion>
                </circle>
              </g>
            )
        )}

        {/* Combined Main Trunk Energy Beam */}
        {hasCompletePaths && (
          <g>
            <path id="tc-main-trunk" d={`M ${trunkStartX} ${globeY} L ${globeX} ${globeY}`} fill="none" />
            <circle cx={trunkStartX} cy={globeY} r="4" fill="none" stroke="#00C2FF" strokeWidth="2" opacity="0.8" filter="url(#tc-node-halo)" />
            <circle cx={trunkStartX} cy={globeY} r="2" fill="white" opacity="0.9" />

            {/* Glowing trunk layers */}
            <path d={`M ${trunkStartX} ${globeY} L ${globeX} ${globeY}`} stroke="#1e3a8a" strokeWidth="14" opacity="0.6" filter="url(#tc-blur-soft)" strokeLinecap="round" />
            <path d={`M ${trunkStartX} ${globeY} L ${globeX} ${globeY}`} stroke="#2563eb" strokeWidth="5" opacity="0.8" filter="url(#tc-blur-mid)" strokeLinecap="round" />
            <path d={`M ${trunkStartX} ${globeY} L ${globeX} ${globeY}`} stroke="#60a5fa" strokeWidth="2" opacity="1" strokeLinecap="round" />
            <path
              d={`M ${trunkStartX} ${globeY} L ${globeX} ${globeY}`}
              stroke="#93c5fd"
              strokeWidth="3.5"
              strokeDasharray="25 150"
              opacity="0.9"
              filter="url(#tc-blur-mid)"
              strokeLinecap="round"
            >
              <animate attributeName="strokeDashoffset" from="175" to="0" dur="1.2s" repeatCount="indefinite" />
            </path>

            {/* Traveling trunk photons */}
            <circle r="3.5" fill="#60a5fa" opacity="1" filter="url(#tc-blur-mid)">
              <animateMotion dur="1.2s" repeatCount="indefinite">
                <mpath href="#tc-main-trunk" />
              </animateMotion>
            </circle>
            <circle r="2" fill="#ffffff" opacity="0.9">
              <animateMotion dur="1.2s" begin="0.3s" repeatCount="indefinite">
                <mpath href="#tc-main-trunk" />
              </animateMotion>
            </circle>
            <circle r="2.5" fill="#3b82f6" opacity="0.9" filter="url(#tc-blur-mid)">
              <animateMotion dur="1.2s" begin="0.8s" repeatCount="indefinite">
                <mpath href="#tc-main-trunk" />
              </animateMotion>
            </circle>

            <circle cx={globeX} cy={globeY} r="3" fill="#3b82f6" opacity="1" filter="url(#tc-blur-mid)" />
            <line x1={globeX} y1={globeY - 5} x2={globeX} y2={globeY + 5} stroke="#00C2FF" strokeWidth="1.2" opacity="0.55" strokeLinecap="round" />
            <circle cx={globeX} cy={globeY} r="2.4" fill="#00C2FF" opacity="0.9" filter="url(#tc-blur-mid)" />
            <circle cx={globeX} cy={globeY} r="1.2" fill="white" opacity="0.7" />
          </g>
        )}
      </svg>

      {/* ── Left 4 Node Buttons ────────────────────────────────────────── */}
      {NODES.map((node, idx) => (
        <div
          key={idx}
          ref={(el) => {
            buttonRefs.current[idx] = el;
          }}
          className="relative z-10 w-[140px] md:w-[192px]"
        >
          <button
            onClick={handleClicks[idx]}
            className="w-full flex items-center gap-[13px] px-[16px] py-[13px] rounded-xl select-none bg-[#070c12]/85 backdrop-blur-md border border-white/[0.07] hover:border-white/[0.18] hover:bg-[#0b1520]/90 transition-all duration-200 group"
            style={{
              boxShadow: `0 0 0 1px ${node.color}12, 0 2px 8px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)`,
            }}
          >
            <span
              className="flex items-center justify-center w-[34px] h-[34px] rounded-[10px] shrink-0 transition-all duration-200 group-hover:scale-110"
              style={{
                background: `${node.color}16`,
                border: `1px solid ${node.color}38`,
                color: node.color,
                boxShadow: `0 0 10px ${node.color}18`,
              }}
            >
              <node.Icon size={18} strokeWidth={1.7} />
            </span>
            <span className="text-[13px] font-semibold tracking-[0.05em] text-white/55 group-hover:text-white/85 transition-colors capitalize leading-none font-sans">
              {node.label}
            </span>
            <span
              className="ml-auto w-[3px] h-[3px] rounded-full shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
              style={{ background: node.color }}
            />
          </button>
        </div>
      ))}
    </div>
  );
};
