import colors from 'tailwindcss/colors';

// Design tokens (extend only — every stock Tailwind class keeps working).
//
//   brand    primary actions use brand-700 (white text 5.5:1; the old emerald-600 was ~3.8:1)
//   ink      text: DEFAULT / muted / subtle (subtle is gray-500, never the 2.5:1 gray-400)
//   surface  backgrounds and borders
//   success / warning / danger / info / quiet
//            semantic tones, each with fg (text on bg), bg, border and solid (white text on it).
//            Every fg/bg and white/solid pair is at least 4.5:1. `quiet` is the neutral tone; it
//            is not called `neutral` because Tailwind already ships a `neutral` palette.
//
// The shared mapping from tone to classes lives in src/components/ui/tones.ts.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: colors.emerald,
        ink: { DEFAULT: colors.gray[900], muted: colors.gray[600], subtle: colors.gray[500] },
        surface: {
          DEFAULT: '#ffffff',
          muted: colors.gray[50],
          sunken: colors.gray[100],
          border: colors.gray[200],
        },
        success: {
          fg: colors.emerald[800],
          bg: colors.emerald[50],
          border: colors.emerald[200],
          solid: colors.emerald[700],
        },
        warning: {
          fg: colors.amber[900],
          bg: colors.amber[50],
          border: colors.amber[200],
          solid: colors.amber[700],
        },
        danger: {
          fg: colors.red[800],
          bg: colors.red[50],
          border: colors.red[200],
          solid: colors.red[700],
        },
        info: {
          fg: colors.sky[900],
          bg: colors.sky[50],
          border: colors.sky[200],
          solid: colors.sky[700],
        },
        quiet: {
          fg: colors.gray[700],
          bg: colors.gray[100],
          border: colors.gray[200],
          solid: colors.gray[600],
        },
      },
      borderRadius: { control: '0.75rem', card: '1rem' },
      // Replaces the ad-hoc text-[11px] / text-[10px] sizes.
      fontSize: { '2xs': ['0.6875rem', { lineHeight: '1rem' }] },
      // Tamil-capable stack (was hard-coded on body in index.css).
      fontFamily: {
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          '"Noto Sans Tamil"',
          '"Lohit Tamil"',
          'sans-serif',
        ],
      },
      boxShadow: { card: '0 1px 2px 0 rgb(0 0 0 / 0.05)' },
    },
  },
  plugins: [],
};
