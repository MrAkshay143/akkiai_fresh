import React, { useState, useRef, useEffect } from 'react';
import { Palette, Check } from 'lucide-react';
import { useAppStore } from '../../state/useAppStore';

const THEMES = [
  { id: 'akki', name: 'Akki Legacy', color: '#00e5ff' },
  { id: 'violet-void', name: 'Violet Void', color: '#a822ff' },
  { id: 'solar-amber', name: 'Solar Amber', color: '#ff5500' },
  { id: 'electric-cyan', name: 'Electric Cyan', color: '#00d2ff' },
  { id: 'crimson-neon', name: 'Crimson Neon', color: '#ff003c' },
];

export const Header: React.FC = () => {
  const { theme, setTheme } = useAppStore();
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsThemeOpen(false);
      }
    };
    if (isThemeOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isThemeOpen]);

  return (
    <header
      className="w-full flex-none z-[100] flex items-center justify-between px-5 select-none relative"
      style={
        {
          height: '44px',
          WebkitAppRegion: 'drag',
          backgroundColor: '#07090c',
          borderBottom: '1px solid rgba(0, 229, 255, 0.08)',
        } as any
      }
    >
      {/* Background cybernetic cyan sheen */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, rgba(0,229,255,0.04) 0%, transparent 40%)',
        }}
      />

      {/* Brand logo & title */}
      <div
        className="flex items-center gap-2.5 relative z-10"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        <img
          src="./logo_withoutbackground.png"
          alt="Akki Ai"
          className="w-[18px] h-[18px] object-contain opacity-90"
          draggable={false}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = './logo.png';
          }}
        />
        <span
          className="text-[13px] font-semibold tracking-wide font-sans"
          style={{ color: 'rgba(255,255,255,0.82)', letterSpacing: '0.03em' }}
        >
          Akki Ai
        </span>
      </div>

      {/* Right controls: Theme Palette & titlebar spacer */}
      <div
        className="flex items-center gap-3 relative z-10"
        style={{ WebkitAppRegion: 'no-drag' } as any}
      >
        {/* Theme Palette Button */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setIsThemeOpen(!isThemeOpen)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-j-cyan hover:bg-white/5 transition-colors border border-transparent hover:border-j-cyan/20"
            title="Switch Cyberpunk Theme"
          >
            <Palette size={15} />
          </button>

          {/* Theme Dropdown */}
          {isThemeOpen && (
            <div className="absolute right-0 top-9 w-44 bg-[#0b141b] border border-[rgba(0,229,255,0.2)] rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.8)] py-1.5 z-[200] backdrop-blur-md">
              <div className="px-3 py-1 text-[10px] font-mono tracking-wider uppercase text-white/40 border-b border-white/5 mb-1">
                Select Theme
              </div>
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTheme(t.id);
                    setIsThemeOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors ${
                    theme === t.id
                      ? 'bg-j-cyan/15 text-j-cyan'
                      : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shadow-[0_0_6px_currentColor]"
                      style={{ backgroundColor: t.color, color: t.color }}
                    />
                    <span>{t.name}</span>
                  </div>
                  {theme === t.id && <Check size={13} className="text-j-cyan" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Spacer balancing native titlebar controls */}
        <div style={{ width: '138px' }} />
      </div>
    </header>
  );
};

export default Header;
