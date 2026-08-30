import type { Config } from 'tailwindcss';

const config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--ksg-ui-font-sans)'],
        mono: ['var(--ksg-ui-font-mono)'],
      },
      colors: {
        canvas: 'var(--ksg-bg-canvas)',
        surface: 'var(--ksg-bg-surface)',
        elevated: 'var(--ksg-bg-elevated)',
        overlay: 'var(--ksg-bg-overlay)',
        rail: 'var(--ksg-ui-rail)',
        raised: 'var(--ksg-ui-raised)',
        'raised-hover': 'var(--ksg-ui-raised-hover)',
        selected: 'var(--ksg-ui-selected)',
      },
      textColor: {
        primary: 'var(--ksg-fg-primary)',
        secondary: 'var(--ksg-fg-secondary)',
        muted: 'var(--ksg-fg-muted)',
        inverse: 'var(--ksg-fg-inverse)',
        link: 'var(--ksg-fg-link)',
      },
      borderColor: {
        weak: 'var(--ksg-border-weak)',
        medium: 'var(--ksg-border-medium)',
        strong: 'var(--ksg-border-strong)',
        hairline: 'var(--ksg-ui-hairline)',
        'hairline-strong': 'var(--ksg-ui-hairline-strong)',
      },
      boxShadow: {
        panel: 'var(--ksg-ui-shadow-panel)',
        rail: 'var(--ksg-ui-shadow-rail)',
      },
      letterSpacing: {
        eyebrow: '0.08em',
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
