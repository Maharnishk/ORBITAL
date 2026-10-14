/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#0A0C0B',
        panel: '#111512',
        elevated: '#171C18',
        border: '#292F2A',
        primary: '#E6E9E3',
        secondary: '#929A91',
        phosphor: '#B7F397',
        amber: '#E6B566',
        coral: '#E77C72',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'Geist', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', '"Geist Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
