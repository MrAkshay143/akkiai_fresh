import React, { useState, useEffect, useRef } from 'react';
import { RotateCw, Maximize2, Minimize2, ExternalLink } from 'lucide-react';

const getWindyUrl = (lat?: number | null, lon?: number | null): string => {
  return `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=default&metricTemp=default&metricWind=default&zoom=5&overlay=wind&product=ecmwf&level=surface${
    lat && lon ? `&lat=${lat}&lon=${lon}&detailLat=${lat}&detailLon=${lon}` : ''
  }&detail=false&message=false`;
};

const getInitialWindyCoords = (): { lat: number; lon: number } | null => {
  try {
    const s = localStorage.getItem('akki_windy_coords');
    if (s) {
      const p = JSON.parse(s);
      if (p.lat && p.lon) return p;
    }
  } catch (_) {}
  return null;
};

export const WindyRadarWidget: React.FC = () => {
  const initialCoords = getInitialWindyCoords();
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(initialCoords);
  const [windyUrl, setWindyUrl] = useState<string>(
    getWindyUrl(initialCoords?.lat, initialCoords?.lon)
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const applyLoc = (lat: number, lon: number, locName?: string) => {
    try {
      localStorage.setItem('akki_windy_coords', JSON.stringify({ lat, lon }));
      if (locName) localStorage.setItem('akki_live_location', locName);
    } catch (_) {}
    setCoords({ lat, lon });
    const nu = getWindyUrl(lat, lon);
    setWindyUrl(nu);
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lon = Number(pos.coords.longitude.toFixed(6));
          fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
            { headers: { 'User-Agent': 'AkkiAI/1.0' } }
          )
            .then((r) => r.json())
            .then((geo) => {
              const name =
                geo && geo.address
                  ? geo.address.city ||
                    geo.address.town ||
                    geo.address.suburb ||
                    geo.display_name
                  : '';
              applyLoc(lat, lon, name);
            })
            .catch(() => applyLoc(lat, lon, ''));
        },
        () => {
          fetch('https://ipwho.is/')
            .then((r) => r.json())
            .then((data) => {
              if (data && data.success && data.latitude && data.longitude) {
                const lat = Number(data.latitude.toFixed(6));
                const lon = Number(data.longitude.toFixed(6));
                const name = `${data.city}, ${data.region}, ${data.country}`;
                applyLoc(lat, lon, name);
              }
            })
            .catch(() => {});
        },
        { timeout: 8000, enableHighAccuracy: true }
      );
    } else {
      fetch('https://ipwho.is/')
        .then((r) => r.json())
        .then((data) => {
          if (data && data.success && data.latitude && data.longitude) {
            const lat = Number(data.latitude.toFixed(6));
            const lon = Number(data.longitude.toFixed(6));
            const name = `${data.city}, ${data.region}, ${data.country}`;
            applyLoc(lat, lon, name);
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleReload = () => {
    setIsLoading(true);
    if (iframeRef.current) {
      iframeRef.current.src = windyUrl;
    }
    setTimeout(() => setIsLoading(false), 800);
  };

  return (
    <>
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#070c12]/90 shadow-[0_4px_24px_rgba(0,0,0,0.6)] flex flex-col group transition-all duration-300"
        style={{ height: isExpanded ? 360 : 220 }}
      >
        {/* ── Top Header Strip ────────────────────────────────────────── */}
        <div className="flex items-center justify-between h-8 px-3.5 border-b border-white/[0.05] bg-[#080d12]/80 z-20 select-none shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isLoading
                  ? 'animate-spin bg-amber-400 text-amber-400'
                  : 'animate-pulse bg-[#00e5ff] text-[#00e5ff]'
              } shadow-[0_0_8px_currentColor]`}
            />
            <span className="text-[10px] font-mono font-black text-[#00e5ff] tracking-[0.25em] uppercase">
              Windy Satellite Radar
            </span>
          </div>

          <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity duration-300">
            {/* Reload button */}
            <button
              onClick={handleReload}
              className="w-5 h-5 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/[0.06] transition-all"
              title="Reload Radar Stream"
            >
              <RotateCw size={11} className={isLoading ? 'animate-spin' : ''} />
            </button>

            {/* Height expand toggle */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-5 h-5 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/[0.06] transition-all"
              title={isExpanded ? 'Collapse panel' : 'Expand panel'}
            >
              {isExpanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            </button>

            {/* Fullscreen modal toggle */}
            <button
              onClick={() => setIsFullscreen(true)}
              className="w-5 h-5 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/[0.06] transition-all"
              title="Fullscreen Radar"
            >
              <ExternalLink size={11} />
            </button>
          </div>
        </div>

        {/* ── Windy Radar Iframe Embed ─────────────────────────────────── */}
        <div className="w-full flex-1 min-h-0 relative bg-[#060a0d]">
          <iframe
            ref={iframeRef}
            src={windyUrl}
            title="Windy Satellite Radar"
            className="w-full h-full border-none filter brightness-90 contrast-105"
            allow="geolocation"
          />
        </div>
      </div>

      {/* ── Fullscreen Overlay Portal ─────────────────────────────────── */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md flex flex-col p-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 px-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00e5ff] animate-pulse shadow-[0_0_10px_#00e5ff]" />
              <span className="text-xs font-mono font-bold text-white tracking-widest uppercase">
                Windy Satellite Radar — Live Stream
              </span>
            </div>
            <button
              onClick={() => setIsFullscreen(false)}
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-mono transition-colors"
            >
              Close [ESC]
            </button>
          </div>
          <div className="flex-1 w-full mt-3 rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
            <iframe
              src={windyUrl}
              title="Windy Fullscreen Radar"
              className="w-full h-full border-none"
              allow="geolocation"
            />
          </div>
        </div>
      )}
    </>
  );
};
