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
    },
  },
  plugins: [],
} satisfies Config;
