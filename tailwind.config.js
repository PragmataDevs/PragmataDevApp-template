/** @type {import('tailwindcss').Config}
 *
 *  Paleta y tipografía espejadas desde el hub de marca:
 *    $PRAGMATA_HOME/data/brand/design/tokens/tokens.json
 *
 *  Los nombres `brand.*` se conservan para no romper las ~164 ocurrencias
 *  en `src/`, pero sus valores ahora apuntan a la paleta dark canónica
 *  (portal factory en $PRAGMATA_HOME/ops/factory). El alias `pg.*` está
 *  disponible para código nuevo.
 *
 *  Cualquier cambio empieza en `data/brand/design/tokens/tokens.json`
 *  y se espeja aquí — nunca al revés.
 */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Display / marca / headings · "la letra de Pragmata"
        sans: ['Syne', 'var(--font-pragmata)', 'Inter', 'sans-serif'],
        // Datos, métricas, labels técnicos, código
        mono: ['"JetBrains Mono"', 'var(--font-pragmata-mono)', 'ui-monospace', 'monospace'],
        display: ['Syne', 'Inter', 'sans-serif'],
      },
      colors: {
        // ── Marca Pragmata (alias canónicos) ─────────────────────────────
        pg: {
          bg:        '#05080f',
          bg2:       '#080d18',
          surface:   '#0b1120',
          card:      '#0d1525',
          border:    '#162033',
          border2:   '#1e2f48',
          fg:        '#ddeaf8',
          fg2:       '#8badc8',
          muted:     '#3d5a78',
          accent:    '#00b8e6',
          'accent-2':'#7c5cbf',
          green:     '#00d98b',
          yellow:    '#f0c040',
          red:       '#f04060',
        },
        // ── Aliases legacy `brand.*` mapeados al sistema dark ────────────
        // Se conservan los NOMBRES para no romper las 164 ocurrencias en src/.
        // El significado semántico se mantiene (dark = fondo profundo,
        // surface = superficie, accent = acción primaria, etc.).
        brand: {
          dark:          '#05080f', // antes #0F172A → ahora bg base oscuro
          steel:         '#8badc8', // antes #334155 → ahora texto secundario
          accent:        '#00b8e6', // antes #0EA5E9 → cian Pragmata
          'accent-dark': '#0099c2', // hover del accent
          surface:       '#0b1120', // antes #F8FAFC → superficie elevada dark
          border:        '#162033', // antes #E2E8F0 → borde sutil dark
        },
      },
      borderRadius: {
        'pragmata': '4px', // esquinas técnicas, no circulares
      },
      letterSpacing: {
        tighter: '-0.05em',
        brand:   '0.32em', // wordmark "PRAGMATA"
        label:   '0.18em', // labels mono uppercase
      },
      zIndex: {
        'sidebar-backdrop': 'var(--z-sidebar-backdrop)',
        sidebar: 'var(--z-sidebar)',
        header: 'var(--z-header)',
        'header-dropdown': 'var(--z-header-dropdown)',
        floating: 'var(--z-floating)',
        overlay: 'var(--z-overlay)',
        modal: 'var(--z-modal)',
        'modal-elevated': 'var(--z-modal-elevated)',
        sheet: 'var(--z-sheet)',
        datatable: 'var(--z-datatable)',
      },
    },
  },
  plugins: [],
}

