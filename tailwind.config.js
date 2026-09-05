/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Kept in sync with constants/Colors.ts — one yellow-on-near-black
        // identity, not the generic-template blue/slate.
        primary: {
          50: '#FFFDF2',
          100: '#FFF7CC',
          200: '#FFEB99',
          300: '#FFDD5C',
          400: '#FFD027',
          500: '#F5C400',
          600: '#CCA200',
          700: '#997A00',
          800: '#665200',
          900: '#332900',
        },
        surface: {
          dark: '#0A0A0A',
          darkCard: '#161616',
          darkElevated: '#242424',
          light: '#FAFAFA',
          lightCard: '#FFFFFF',
          lightElevated: '#F0F0F0',
        },
        success: '#10B981',
        danger: '#EF4444',
        warning: '#F59E0B',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
