/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        semaforo: {
          verde: '#10b981',
          amarillo: '#f59e0b',
          rojo: '#ef4444',
        }
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0,0,0,.04), 0 1px 2px -1px rgba(0,0,0,.04)',
        'card-hover': '0 4px 12px -2px rgba(0,0,0,.08), 0 2px 4px -2px rgba(0,0,0,.04)',
        'elevated': '0 8px 24px -4px rgba(0,0,0,.08), 0 4px 8px -4px rgba(0,0,0,.04)',
      },
    },
  },
  plugins: [],
}
