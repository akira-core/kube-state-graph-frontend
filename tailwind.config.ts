import type { Config } from 'tailwindcss';

const config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'var(--ksg-bg-canvas)',
        surface: 'var(--ksg-bg-surface)',
        elevated: 'var(--ksg-bg-elevated)',
        overlay: 'var(--ksg-bg-overlay)',
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
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
