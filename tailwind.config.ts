import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0f1419',
          soft: '#3d4852',
          mute: '#6b7684',
        },
        surface: {
          DEFAULT: '#ffffff',
          sunk: '#f6f7f9',
          line: '#e3e6ea',
        },
        brand: {
          DEFAULT: '#0f5c52',
          soft: '#e6f2f0',
        },
        good: '#0f7b3d',
        warn: '#a86a00',
        bad: '#b3261e',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
