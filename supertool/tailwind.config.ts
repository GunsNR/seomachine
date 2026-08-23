import type { Config } from 'tailwindcss';
import { brand } from './brand.config';

const c = brand.colors;

export default {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: c.navy, soft: c.navySoft },
        brand: {
          DEFAULT: c.primary,
          dark: c.primaryDark,
          light: c.primaryLight,
          50: '#F2F7FF',
          100: c.primaryLight,
          200: '#C4DBFC',
          300: '#8FBBF8',
          400: '#4B93EC',
          500: c.primary,
          600: c.primaryDark,
          700: '#0B3C82',
          800: '#082D62',
          900: c.navy,
        },
        accent: { DEFAULT: c.accent, dark: c.accentDark },
        ink: c.ink,
        body: c.body,
        line: c.line,
        surface: { DEFAULT: c.surface, alt: c.surfaceAlt },
        ok: c.success,
        warn: c.warning,
        bad: c.danger,
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'Manrope', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Fluid display sizes — the SmartSites hero look without media queries.
        'display-xl': ['clamp(2.6rem, 5.4vw, 4.5rem)', { lineHeight: '1.04', letterSpacing: '-0.033em', fontWeight: '800' }],
        'display-lg': ['clamp(2.1rem, 4vw, 3.25rem)', { lineHeight: '1.1', letterSpacing: '-0.028em', fontWeight: '800' }],
        'display-md': ['clamp(1.65rem, 2.7vw, 2.35rem)', { lineHeight: '1.18', letterSpacing: '-0.022em', fontWeight: '700' }],
        'display-sm': ['clamp(1.3rem, 1.9vw, 1.6rem)', { lineHeight: '1.28', letterSpacing: '-0.015em', fontWeight: '700' }],
      },
      maxWidth: { container: '1220px' },
      borderRadius: { xl2: '1.25rem', '4xl': '2rem' },
      boxShadow: {
        card: '0 1px 2px rgba(7,24,46,.05), 0 8px 24px -12px rgba(7,24,46,.14)',
        lift: '0 12px 40px -14px rgba(7,24,46,.26)',
        glow: '0 18px 60px -20px rgba(20,102,216,.55)',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(to right, rgba(255,255,255,.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.055) 1px, transparent 1px)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(14px)' }, '100%': { opacity: '1', transform: 'none' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        pulseRing: { '0%': { opacity: '.65', transform: 'scale(.85)' }, '70%,100%': { opacity: '0', transform: 'scale(1.7)' } },
      },
      animation: {
        'fade-up': 'fade-up .55s cubic-bezier(.22,.68,0,1) both',
        marquee: 'marquee 38s linear infinite',
        'pulse-ring': 'pulseRing 2.4s cubic-bezier(.23,1,.32,1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
