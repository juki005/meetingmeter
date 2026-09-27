/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/client/index.html",
    "./src/client/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: {
          DEFAULT: '#090A0F',
          base: '#0B1326',
          slate: '#0F172A',
        },
        surface: {
          DEFAULT: '#12141C',
          card: '#1E293B',
          container: '#171F33',
          elevated: '#1A1D28',
          inset: '#0B1120',
          bright: '#31394D',
        },
        brand: {
          primary: '#10B981',
          'primary-hover': '#059669',
          'primary-glow': 'rgba(16, 185, 129, 0.25)',
          secondary: '#0D9488',
          cyan: '#00F0FF',
        },
        status: {
          active: '#10B981',
          paused: '#F59E0B',
          left: '#94A3B8',
          unknown: '#6366F1',
          danger: '#EF4444',
        },
        border: {
          subtle: '#232736',
          active: '#3B4259',
          divider: '#334155',
        },
        ink: {
          primary: '#F8FAFC',
          secondary: '#94A3B8',
          muted: '#64748B',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'glow-emerald': '0 0 16px -2px rgba(16, 185, 129, 0.35)',
        'glow-cyan': '0 0 16px -2px rgba(0, 240, 255, 0.35)',
        'glow-danger': '0 0 16px -2px rgba(239, 68, 68, 0.35)',
        'hud-modal': '0 12px 32px -4px rgba(0, 0, 0, 0.60), 0 0 0 1px rgba(255, 255, 255, 0.12)',
      },
    },
  },
  plugins: [],
}
