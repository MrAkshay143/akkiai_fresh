import React from 'react';

export const Header: React.FC = () => {

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

      {/* Spacer balancing native titlebar controls */}
      <div style={{ width: '138px' }} />
    </header>
  );
};

export default Header;
