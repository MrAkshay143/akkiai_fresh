/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'j-cyan': 'var(--j-cyan, #00e5ff)',
        'j-blue': 'var(--j-blue, #0085ff)',
        'j-void': 'var(--j-void, #020406)',
        'j-panel': 'var(--j-panel, #0b141b)',
        'j-amber': 'var(--j-amber, #ffc700)',
        'j-crimson': 'var(--j-crimson, #ff2e2e)',
        'j-hologram': 'var(--j-hologram, #00ffa3)',
        'j-steel': 'var(--j-steel, #1e2d38)',
        'j-surface': 'var(--j-surface, #111e28)',
        'j-text-primary': 'var(--j-text-primary, #e1f8ff)',
        'j-text-secondary': 'var(--j-text-secondary, #8ba7b0)',
        'j-text-muted': 'var(--j-text-muted, #4b636b)',
        cyber: {
          bg: '#020406',
          card: '#0b141b',
          'card-glass': 'rgba(11, 20, 27, 0.75)',
          border: 'rgba(0, 229, 255, 0.12)',
          'border-glow': 'rgba(0, 229, 255, 0.3)',
          cyan: '#00e5ff',
          'cyan-glow': 'rgba(0, 229, 255, 0.4)',
          purple: '#9d4edd',
          'purple-glow': 'rgba(157, 78, 221, 0.4)',
          pink: '#f72585',
          emerald: '#10b981',
          amber: '#ffc700',
          crimson: '#ff2e2e',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'SF Pro Display', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
        ibm: ['IBM Plex Mono', 'monospace'],
      },
      boxShadow: {
        'neon-cyan': '0 0 15px rgba(0, 240, 255, 0.35)',
        'neon-purple': '0 0 15px rgba(157, 78, 221, 0.35)',
        'neon-pink': '0 0 15px rgba(247, 37, 133, 0.35)',
      }
    },
  },
  plugins: [],
};
