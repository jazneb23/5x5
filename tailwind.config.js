/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        iron: {
          950: 'var(--iron-950)',
          900: 'var(--iron-900)',
          800: 'var(--iron-800)',
          700: 'var(--iron-700)',
          600: 'var(--iron-600)',
        },
        chalk: {
          100: 'var(--chalk-100)',
          300: 'var(--chalk-300)',
          500: 'var(--chalk-500)',
        },
        signal: { DEFAULT: 'var(--signal)', dim: 'var(--signal-dim)' },
        fail: 'var(--fail)',
        record: 'var(--record)',
        plate: {
          45: 'var(--plate-45)',
          35: 'var(--plate-35)',
          25: 'var(--plate-25)',
          10: 'var(--plate-10)',
          5: 'var(--plate-5)',
          '2p5': 'var(--plate-2p5)',
          frac: 'var(--plate-frac)',
        },
      },
      fontFamily: {
        display: ['Archivo Variable', 'system-ui', 'sans-serif'],
        body: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'weight-hero': ['76px', { lineHeight: '0.9', letterSpacing: '-0.02em' }],
        'weight-lg': ['40px', { lineHeight: '1.0', letterSpacing: '-0.01em' }],
        'display-md': ['28px', { lineHeight: '1.15', letterSpacing: '-0.01em' }],
        title: ['20px', { lineHeight: '1.3' }],
        timer: ['52px', { lineHeight: '1.0', letterSpacing: '0.02em' }],
        data: ['15px', { lineHeight: '1.4' }],
        label: ['12px', { lineHeight: '1.2', letterSpacing: '0.12em' }],
      },
      borderRadius: { sm: '4px', md: '8px', lg: '12px', pill: '999px' },
      maxWidth: { app: '480px' },
      spacing: {
        4.5: '18px',
      },
    },
  },
  plugins: [],
};
