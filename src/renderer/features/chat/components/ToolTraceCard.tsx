import React, { useState } from 'react';
import { Sparkles, CircleAlert, Terminal, ChevronDown, ChevronRight } from 'lucide-react';
import { ToolTrace } from '../../../../shared/types';

export interface ToolTraceCardProps {
  trace: ToolTrace;
  toolCall?: {
    name?: string;
    args?: Record<string, any>;
    function?: {
      name?: string;
      arguments?: any;
    };
  };
  className?: string;
}

export const ToolTraceCard: React.FC<ToolTraceCardProps> = ({
  trace,
  toolCall,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const formatPayload = (val: any) => {
    if (!val) return null;
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  };

  const payload = formatPayload(toolCall?.function?.arguments || toolCall?.args);
  const isSuccess = trace.success;
  const borderColor = isSuccess ? 'border-j-cyan/20' : 'border-red-500/20';
  const bgColor = isSuccess ? 'bg-j-cyan/5' : 'bg-red-500/5';
  const hoverBg = isSuccess ? 'hover:bg-j-cyan/10' : 'hover:bg-red-500/10';
  const iconColor = isSuccess ? 'text-j-cyan' : 'text-red-400';
  const borderStyleColor = isSuccess ? 'rgba(0, 229, 255, 0.1)' : 'rgba(239, 68, 68, 0.1)';

  return (
    <div
      className={`flex flex-col w-full max-w-full rounded-xl overflow-hidden border ${borderColor} bg-[#0e1216] shadow-sm mb-2 transition-all duration-300 ${className}`}
    >
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${hoverBg} select-none overflow-hidden`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border ${borderColor} ${bgColor}`}
          >
            {isSuccess ? (
              <Sparkles size={13} className={iconColor} />
            ) : (
              <CircleAlert size={13} className={iconColor} />
            )}
          </div>
          <div className="flex items-center gap-2 text-[12px] font-medium min-w-0 truncate">
            <span className="text-white/40 whitespace-nowrap hidden sm:inline-block">
              Module:
            </span>
            <span className="text-white/85 font-mono tracking-wider bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.04]">
              {trace.name || 'Unknown Tool'}
            </span>
            {!isSuccess && (
              <span className="text-red-400 text-[10px] uppercase font-bold tracking-widest bg-red-500/10 px-1.5 py-0.5 rounded-[4px] ml-1">
                Failed
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 pl-2">
          <div className="flex items-center gap-1.5 opacity-60">
            <Terminal size={12} className="text-white/40 hidden sm:block" />
            <span className="text-white/40 text-[10px] font-mono whitespace-nowrap">
              {(trace.durationMs / 1000).toFixed(1)}s
            </span>
          </div>
          <div className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/5 transition-colors text-white/40">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
        </div>
      </div>

      <div
        className={`grid transition-[grid-template-rows,opacity,padding,border] duration-300 ease-in-out ${
          isOpen ? 'grid-rows-[1fr] opacity-100 border-t' : 'grid-rows-[0fr] opacity-0 border-t-0'
        }`}
        style={{ borderColor: borderStyleColor }}
      >
        <div className="overflow-hidden">
          <div className="p-3 pb-4 space-y-4 bg-black/40">
            {payload && payload !== '{}' && (
              <div className="space-y-1.5 animate-in fade-in duration-500 slide-in-from-top-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30 ml-1">
                  Input Payload
                </span>
                <div className="bg-[#0a0d10] rounded-lg p-2.5 border border-white/5 overflow-x-auto custom-scrollbar">
                  <pre className="text-[11px] font-mono text-white/60 leading-relaxed max-h-[150px] overflow-y-auto whitespace-pre-wrap break-all custom-scrollbar">
                    {payload}
                  </pre>
                </div>
              </div>
            )}

            {trace.outcome && (
              <div className="space-y-1.5 animate-in fade-in duration-500 slide-in-from-top-3">
                <span
                  className={`text-[10px] font-bold uppercase tracking-[0.15em] ml-1 ${
                    isSuccess ? 'text-j-cyan/40' : 'text-red-400/60'
                  }`}
                >
                  {isSuccess ? 'Response Output' : 'Error Log'}
                </span>
                <div
                  className={`rounded-lg p-2.5 border overflow-x-auto custom-scrollbar ${
                    isSuccess
                      ? 'bg-j-cyan/[0.02] border-j-cyan/10'
                      : 'bg-red-500/[0.02] border-red-500/10'
                  }`}
                >
                  <pre
                    className={`text-[11px] font-mono leading-relaxed max-h-[250px] overflow-y-auto whitespace-pre-wrap break-all custom-scrollbar ${
                      isSuccess ? 'text-white/70' : 'text-red-300/80'
                    }`}
                  >
                    {trace.outcome}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolTraceCard;
