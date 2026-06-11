import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        galaxy: {
          bg: '#0a0a1a',
          surface: '#12122b',
          primary: '#7c3aed',
          accent: '#22d3ee',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'galaxy-radial': 'radial-gradient(ellipse at top, #1e1b4b 0%, #0a0a1a 60%)',
      },
      // Shared motion vocabulary — curves the whole app can pull from via
      // `ease-out-expo` etc. The concrete entrance animations live in globals.css
      // as plain utilities so they never depend on a config reload.
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
