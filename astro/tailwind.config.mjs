/** @see ../tailwind.config.js — mismos tokens, rutas content del pilar público */
import base from '../tailwind.config.js';

/** @type {import('tailwindcss').Config} */
export default {
  ...base,
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
    './src/layouts/**/*.astro',
  ],
  theme: {
    ...base.theme,
    extend: {
      ...(base.theme?.extend ?? {}),
      colors: {
        ...(base.theme?.extend?.colors ?? {}),
        brand: {
          dark: 'var(--tw-brand-dark)',
          steel: 'var(--tw-brand-steel)',
          accent: 'var(--tw-brand-accent)',
          'accent-dark': 'var(--tw-brand-accent-dark)',
          surface: 'var(--tw-brand-surface)',
          border: 'var(--tw-brand-border)',
        },
      },
      keyframes: {
        ...(base.theme?.extend?.keyframes ?? {}),
        'ps-fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'ps-shimmer': {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        ...(base.theme?.extend?.animation ?? {}),
        'ps-fade-up': 'ps-fade-up 0.55s cubic-bezier(0.22, 1, 0.36, 1) both',
        'ps-shimmer': 'ps-shimmer 2.2s ease-in-out infinite',
      },
      fontFamily: {
        ...(base.theme?.extend?.fontFamily ?? {}),
        sans: ['var(--font-public-sans)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-public-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        ...(base.theme?.extend?.boxShadow ?? {}),
        'psy-soft': '0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 40px -20px rgba(15, 23, 42, 0.12)',
        'psy-glow': '0 0 0 1px rgba(14, 165, 233, 0.12), 0 20px 50px -24px rgba(14, 165, 233, 0.18)',
        'psy-glow-lg': '0 0 0 1px rgba(14, 165, 233, 0.2), 0 28px 70px -24px rgba(14, 165, 233, 0.22)',
      },
      backgroundImage: {
        ...(base.theme?.extend?.backgroundImage ?? {}),
        'psy-shine':
          'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.5) 50%, transparent 60%)',
      },
    },
  },
};
