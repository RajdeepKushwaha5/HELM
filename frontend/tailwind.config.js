/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 900: '#0a0e27', 800: '#0f1535', 700: '#1a2040', 600: '#1e2a4a' },
        coral: { 500: '#00d4aa', 400: '#00e8bb', 300: '#33ecc6' },
        danger: '#ef4444',
        warn:   '#f59e0b',
        safe:   '#22c55e',
      },
    },
  },
  plugins: [],
}
