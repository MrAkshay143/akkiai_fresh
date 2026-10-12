import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  Layers,
  Sparkles,
  Download,
  Printer,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Hand,
  GitBranch,
} from 'lucide-react';
import mermaid from 'mermaid';
import { useAppStore } from '@/state/useAppStore';
import { useAudio } from '@/shared/hooks/useAudio';

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  securityLevel: 'loose',
  themeVariables: {
    background: '#0a0d14',
    mainBkg: '#0d1117',
    secondaryColor: '#111827',
    tertiaryColor: '#161b22',
    clusterBkg: '#111827',
    edgeLabelBackground: '#0d1117',
    primaryBorderColor: '#00e5ff33',
    secondaryBorderColor: '#1e293b',
    tertiaryBorderColor: '#1e293b',
    nodeBorder: '#00e5ff33',
    clusterBorder: '#1e293b',
    primaryColor: '#0d1117',
    primaryTextColor: '#e2e8f0',
    secondaryTextColor: '#94a3b8',
    tertiaryTextColor: '#e2e8f0',
    lineColor: '#00e5ff70',
    titleColor: '#00e5ff',
    fontFamily: 'Inter, ui-sans-serif, sans-serif',
    fontSize: '13px',
  },
});

interface VisualHistoryItem {
  type: 'image' | 'diagram';
  data: string;
  label: string;
  timestamp: number;
}

const detectDiagramType = (code: string): string => {
  if (!code) return 'DIAGRAM';
  const firstLine = code.trim().toLowerCase().split('\n')[0];
  if (firstLine.includes('graph') || firstLine.includes('flowchart')) return 'FLOWCHART';
  if (firstLine.includes('sequence') || firstLine.includes('sequencediagram')) return 'SEQUENCE';
  if (firstLine.includes('erdiagram') || firstLine.includes('er')) return 'ER';
  if (firstLine.includes('classdiagram') || firstLine.includes('class')) return 'CLASS';
  if (firstLine.includes('statediagram')) return 'STATE';
  if (firstLine.includes('gantt')) return 'GANTT';
  if (firstLine.includes('pie')) return 'PIE';
  if (firstLine.includes('gitgraph')) return 'GIT';
  if (firstLine.includes('mindmap')) return 'MINDMAP';
  if (firstLine.includes('timeline')) return 'TIMELINE';
  return 'DIAGRAM';
};

export const VisualHubOverlay: React.FC = () => {
  const { centerView, setCenterView, visualHubState, setVisualHubState } = useAppStore();
  const { playClick } = useAudio();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<VisualHistoryItem[]>([]);
  const [activeHistoryIdx, setActiveHistoryIdx] = useState<number | null>(null);
  const [isRenderingDiagram, setIsRenderingDiagram] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const diagramRef = useRef<HTMLDivElement | null>(null);
  const { mermaidCode, imageUrl } = visualHubState;

  // Sync incoming image
  useEffect(() => {
    if (imageUrl) {
      setHistory((prev) => [
        { type: 'image' as const, data: imageUrl, label: 'Image', timestamp: Date.now() },
        ...prev,
      ].slice(0, 5));
      setActiveHistoryIdx(0);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [imageUrl]);

  // Sync incoming diagram
  useEffect(() => {
    if (mermaidCode) {
      setHistory((prev) => [
        { type: 'diagram' as const, data: mermaidCode, label: detectDiagramType(mermaidCode), timestamp: Date.now() },
        ...prev,
      ].slice(0, 5));
      setActiveHistoryIdx(0);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [mermaidCode]);

  // Render diagram with Mermaid
  useEffect(() => {
    if (!mermaidCode) {
      setIsRenderingDiagram(false);
      return;
    }
    let cancelled = false;
    setIsRenderingDiagram(true);

    const renderMermaid = async () => {
      if (!diagramRef.current) {
        if (!cancelled) setIsRenderingDiagram(false);
        return;
      }
      diagramRef.current.innerHTML = '';
      try {
        const id = `mermaid-canvas-${Date.now()}`;
        const { svg } = await mermaid.render(id, mermaidCode);
        if (!cancelled && diagramRef.current) {
          diagramRef.current.innerHTML = svg;
          const svgEl = diagramRef.current.querySelector('svg');
          if (svgEl) {
            svgEl.style.maxWidth = '100%';
            svgEl.style.height = 'auto';
          }
        }
      } catch (err: any) {
        console.error('[VisualHub] Mermaid render error:', err);
        if (!cancelled && diagramRef.current) {
          diagramRef.current.innerHTML = `<div class="p-4 text-xs font-mono text-red-400 bg-red-500/10 rounded-xl border border-red-500/20">${err.message || 'Invalid Mermaid syntax'}</div>`;
        }
      } finally {
        if (!cancelled) setIsRenderingDiagram(false);
      }
    };

    const timer = setTimeout(renderMermaid, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mermaidCode, isExpanded]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!imageUrl && !mermaidCode) return;
    e.preventDefault();
    const factor = 1.1;
    setZoom((prev) => Math.min(Math.max(0.1, e.deltaY < 0 ? prev * factor : prev / factor), 5));
  }, [imageUrl, mermaidCode]);

  // Pan controls
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((imageUrl || mermaidCode) && !isRenderingDiagram) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [imageUrl, mermaidCode, isRenderingDiagram, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);
  const handleResetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);
  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z * 1.2, 5)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z / 1.2, 0.1)), []);

  const handleReset = useCallback(() => {
    playClick();
    setVisualHubState({ mermaidCode: null, imageUrl: null, imagePrompt: null, diagramTitle: null });
    setActiveHistoryIdx(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [playClick, setVisualHubState]);

  const handleDownload = useCallback(() => {
    playClick();
    if (imageUrl) {
      const a = document.createElement('a');
      a.href = imageUrl;
      a.download = `akki-image-${Date.now()}.png`;
      a.click();
    } else if (mermaidCode && diagramRef.current) {
      const svgEl = diagramRef.current.querySelector('svg');
      if (svgEl) {
        const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `akki-diagram-${Date.now()}.svg`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  }, [imageUrl, mermaidCode, playClick]);

  const handlePrint = useCallback(() => {
    playClick();
    window.print();
  }, [playClick]);

  const handleSelectHistory = useCallback((idx: number) => {
    playClick();
    const item = history[idx];
    if (item) {
      setActiveHistoryIdx(idx);
      if (item.type === 'image') {
        setVisualHubState({ imageUrl: item.data, mermaidCode: null });
      } else {
        setVisualHubState({ mermaidCode: item.data, imageUrl: null });
      }
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [history, playClick, setVisualHubState]);

  const hasContent = !!(imageUrl || mermaidCode);
  const isLoading = isRenderingDiagram;

  const contentCard = (
    <div
      className={`w-full h-full rounded-[2rem] border border-[rgba(0,229,255,0.18)] bg-[#0b141b] relative overflow-hidden flex flex-col shadow-[0_0_40px_rgba(0,229,255,0.08),inset_0_1px_0_rgba(0,229,255,0.05)] transition-all duration-300 hover:border-[rgba(0,229,255,0.25)]`}
    >
      {/* ── Top Header Bar (44px) ─────────────────────────────────── */}
      <div
        className="flex-none flex items-center justify-between px-5 relative z-20"
        style={{
          height: '44px',
          background: 'linear-gradient(90deg, rgba(6, 11, 15, 0.95) 0%, rgba(9, 17, 26, 0.95) 100%)',
          borderBottom: '1px solid rgba(0, 229, 255, 0.12)',
          userSelect: 'none',
        }}
      >
        <div className="flex items-center gap-2">
          {/* Status Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#00e5ff]/[0.06] border border-[#00e5ff]/10 rounded-lg">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                isLoading ? 'bg-[#00e5ff] animate-pulse' : hasContent ? 'bg-[#00e5ff] animate-ping' : 'bg-[#00e5ff]/40'
              }`}
            />
            <span
              className="text-[12px] font-mono text-[#00e5ff] font-bold tracking-[0.2em] uppercase"
              style={{ textShadow: '0 0 8px rgba(0, 229, 255, 0.3)' }}
            >
              Visual Hub
            </span>
            <div className="w-px h-3 bg-[#00e5ff]/15 mx-0.5" />
            <span className="text-[8px] font-mono text-white/30 uppercase tracking-wider">
              {isLoading ? 'Processing' : hasContent ? 'Active' : 'Ready'}
            </span>
          </div>

          {/* Diagram / Image Type Badge */}
          {mermaidCode && !isLoading && (
            <span className="px-2 py-0.5 text-[8px] font-mono uppercase tracking-[0.15em] border border-[#00e5ff]/20 text-[#00e5ff]/70 rounded-md bg-[#00e5ff]/5">
              {detectDiagramType(mermaidCode)}
            </span>
          )}
          {imageUrl && !isLoading && (
            <span className="px-2 py-0.5 text-[8px] font-mono uppercase tracking-[0.15em] border border-purple-500/20 text-purple-400/70 rounded-md bg-purple-500/5">
              IMAGE
            </span>
          )}
        </div>

        {/* Center Tab Switcher: Agent Town vs Visual Hub */}
        <div className="flex bg-black/50 border border-[#00e5ff]/25 rounded-lg p-0.5 gap-1 shadow-[0_0_15px_rgba(0,0,0,0.5),inset_0_0_8px_rgba(0,229,255,0.05)]">
          <button
            onClick={(e) => {
              e.stopPropagation();
              playClick();
              setCenterView('agent-town');
            }}
            className={`px-3.5 py-1 text-[11px] font-mono uppercase tracking-wider font-bold rounded-md transition-all ${
              centerView === 'agent-town'
                ? 'bg-gradient-to-br from-[#00e5ff]/20 to-[#0085ff]/20 text-[#00e5ff] border border-[#00e5ff]/40 shadow-[0_0_10px_rgba(0,229,255,0.15)]'
                : 'text-white/50 border border-transparent hover:text-white hover:bg-white/5'
            }`}
          >
            Agent Town
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              playClick();
              setCenterView('visual-hub');
            }}
            className={`px-3.5 py-1 text-[11px] font-mono uppercase tracking-wider font-bold rounded-md transition-all ${
              centerView === 'visual-hub'
                ? 'bg-gradient-to-br from-[#00e5ff]/20 to-[#0085ff]/20 text-[#00e5ff] border border-[#00e5ff]/40 shadow-[0_0_10px_rgba(0,229,255,0.15)]'
                : 'text-white/50 border border-transparent hover:text-white hover:bg-white/5'
            }`}
          >
            Visual Hub
          </button>
        </div>

        {/* Right Action Icons: Download, Print, Reset, Fullscreen */}
        <div className="flex items-center gap-1.5">
          {hasContent && !isLoading && (
            <>
              <button
                onClick={handleDownload}
                className="p-2 rounded-lg border bg-white/[0.03] border-white/[0.06] text-white/30 hover:text-[#00e5ff] hover:border-[#00e5ff]/25 hover:bg-[#00e5ff]/5 transition-all"
                title="Download"
              >
                <Download size={13} />
              </button>
              <button
                onClick={handlePrint}
                className="p-2 rounded-lg border bg-white/[0.03] border-white/[0.06] text-white/30 hover:text-[#00e5ff] hover:border-[#00e5ff]/25 hover:bg-[#00e5ff]/5 transition-all"
                title="Print"
              >
                <Printer size={13} />
              </button>
              <button
                onClick={handleReset}
                className="px-2.5 py-1.5 bg-white/[0.03] hover:bg-red-500/10 border border-white/[0.06] hover:border-red-500/25 rounded-lg text-[8px] font-mono text-white/30 hover:text-red-400 transition-all font-bold"
                title="Reset"
              >
                RESET
              </button>
            </>
          )}
          <button
            onClick={() => {
              playClick();
              setIsExpanded(!isExpanded);
            }}
            className={`p-2 rounded-lg border transition-all duration-200 flex items-center justify-center ${
              isExpanded
                ? 'bg-[#00e5ff]/15 border-[#00e5ff]/40 text-[#00e5ff] shadow-[0_0_16px_rgba(0,229,255,0.15)]'
                : 'bg-white/[0.03] border-white/[0.06] text-white/30 hover:text-[#00e5ff] hover:border-[#00e5ff]/25 hover:bg-[#00e5ff]/5'
            }`}
            title={isExpanded ? 'Minimize' : 'Fullscreen'}
          >
            {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* ── Main Canvas / Visual Body ─────────────────────────────── */}
      <div
        className={`flex-1 relative overflow-hidden flex items-center justify-center min-h-0 ${
          hasContent && !isLoading ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''
        }`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex flex-col items-center gap-5">
            <div className="relative">
              <div
                className="w-16 h-16 border border-[#00e5ff]/20 rounded-full animate-spin"
                style={{ borderTopColor: '#00e5ff' }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles size={20} className="text-[#00e5ff]" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <p className="text-[11px] font-mono text-[#00e5ff] tracking-[0.3em] uppercase font-semibold">
                Generating
              </p>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((k) => (
                  <div
                    key={k}
                    className="w-1 h-2.5 bg-[#00e5ff]/40 rounded-full animate-pulse"
                    style={{ animationDelay: `${k * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
            <p className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em] max-w-[240px] text-center">
              Synthesizing visual output...
            </p>
          </div>
        )}

        {/* Generated Image View */}
        {!isLoading && imageUrl && (
          <div
            className="transition-transform duration-75 ease-out will-change-transform"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            <img
              src={imageUrl}
              alt="Generated Output"
              className="max-w-[90vw] max-h-[75vh] object-contain rounded-2xl shadow-2xl pointer-events-none"
            />
          </div>
        )}

        {/* Generated Diagram View */}
        {!isLoading && mermaidCode && (
          <div
            className="w-full h-full flex items-center justify-center p-6 transition-opacity duration-300 ease-out will-change-transform"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              opacity: isRenderingDiagram ? 0 : 1,
            }}
          >
            <div ref={diagramRef} className="w-full pointer-events-none mermaid-viewer" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !hasContent && (
          <div className="flex flex-col items-center gap-5 px-6 text-center">
            <div className="w-14 h-14 rounded-full border border-dashed border-white/10 flex items-center justify-center group-hover:border-[#00e5ff]/30 group-hover:rotate-12 transition-all duration-700">
              <Layers className="text-white/20 group-hover:text-[#00e5ff]/50 transition-colors" size={26} />
            </div>
            <div>
              <h3 className="text-sm font-mono text-white/50 tracking-[0.2em] uppercase font-semibold mb-1">
                Visual Intelligence Hub
              </h3>
              <p className="text-[10px] font-mono text-white/20 max-w-[260px] leading-relaxed">
                Ask the AI to generate a diagram or image — it appears here instantly.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center max-w-[280px]">
              {['Flowchart', 'Mindmap', 'Sequence', 'ER', 'Class', 'Gantt', 'Timeline', 'Pie'].map((k) => (
                <span
                  key={k}
                  className="px-2.5 py-1 text-[8px] font-mono uppercase tracking-wider border border-[#00e5ff]/10 text-white/20 rounded-lg bg-[#00e5ff]/[0.03]"
                >
                  {k}
                </span>
              ))}
            </div>
            <p className="text-[8px] font-mono text-[#00e5ff]/25 uppercase tracking-[0.25em]">
              System Ready — Awaiting Data Input
            </p>
          </div>
        )}
      </div>

      {/* ── History Carousel Bar ─────────────────────────────────── */}
      {history.length > 1 && !isExpanded && (
        <div className="flex-none border-t border-white/[0.04] px-5 py-2.5 flex items-center gap-2">
          <span className="text-[8px] font-mono text-white/20 uppercase tracking-widest shrink-0">History</span>
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {history.map((k, idx) => (
              <button
                key={k.timestamp}
                onClick={() => handleSelectHistory(idx)}
                title={k.label}
                className={`shrink-0 w-9 h-9 rounded-lg border overflow-hidden transition-all duration-200 ${
                  idx === activeHistoryIdx
                    ? 'border-[#00e5ff]/50 shadow-[0_0_10px_rgba(0,229,255,0.2)] scale-105'
                    : 'border-white/[0.06] hover:border-[#00e5ff]/25 hover:scale-105'
                }`}
              >
                {k.type === 'image' ? (
                  <img src={k.data} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full bg-[#0d1117] flex items-center justify-center">
                    <GitBranch size={12} className={idx === activeHistoryIdx ? 'text-[#00e5ff]/70' : 'text-white/20'} />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Zoom / Pan Footer Controls ───────────────────────────── */}
      {hasContent && !isExpanded && (
        <div className="flex-none border-t border-white/[0.04] px-5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-[#00e5ff]/8 border border-white/[0.06] hover:border-[#00e5ff]/20 text-white/30 hover:text-[#00e5ff] transition-all"
              title="Zoom Out"
            >
              <ZoomOut size={13} />
            </button>
            <span className="px-2.5 text-[10px] font-mono text-[#00e5ff]/70 font-bold tabular-nums min-w-[44px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-[#00e5ff]/8 border border-white/[0.06] hover:border-[#00e5ff]/20 text-white/30 hover:text-[#00e5ff] transition-all"
              title="Zoom In"
            >
              <ZoomIn size={13} />
            </button>
            <button
              onClick={handleResetView}
              className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-amber-500/10 border border-white/[0.06] hover:border-amber-500/20 text-white/30 hover:text-amber-400 transition-all ml-1"
              title="Reset View"
            >
              <RotateCcw size={13} />
            </button>
          </div>
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-[#00e5ff]/[0.04] rounded-lg border border-[#00e5ff]/10">
            <Hand size={10} className="text-[#00e5ff]/50" />
            <span className="text-[8px] font-mono text-[#00e5ff]/40 uppercase tracking-wider">Drag to pan</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="w-full h-full relative flex items-stretch justify-center min-h-0">
        {isExpanded ? <div className="w-full h-full" /> : contentCard}
      </div>
      {isExpanded &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-x-0 bottom-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            style={{ top: '44px' }}
          >
            {contentCard}
          </div>,
          document.body
        )}
    </>
  );
};
