/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-pragmata)', 'Inter', 'sans-serif'],
        mono: ['var(--font-pragmata-mono)', 'monospace'],
      },
      colors: {
        brand: {
          dark: '#0F172A',     // Deep Slate
          steel: '#334155',    // Steel Blue
          accent: '#0EA5E9',   // Electric Blue
          'accent-dark': '#0284C7', // Sky 600 - Hover
          surface: '#F8FAFC',  // Technical Gray
          border: '#E2E8F0',   // Slate 200
        }
      },
      borderRadius: {
        'pragmata': '4px', // Esquinas técnicas, no circulares
      },
      letterSpacing: {
        tighter: '-0.05em',
      }
    },
  },
  plugins: [],
}

