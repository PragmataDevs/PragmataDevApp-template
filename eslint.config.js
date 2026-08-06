import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `dist` es el build del ERP; `astro/.vercel` y `astro/dist` son output del
  // build de Astro (bundles minificados que se regeneran en cada deploy).
  // Lintar código generado no arregla nada y ensucia el reporte con errores
  // que no se pueden corregir en el fuente.
  globalIgnores(['dist', 'astro/.vercel', 'astro/dist', 'supabase/.temp']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // ── Overrides ──────────────────────────────────────────────────────────────
  // Van DESPUÉS del bloque general a propósito: en flat config el último objeto
  // que hace match es el que manda. Puestos antes, el `extends` de arriba los
  // vuelve a pisar y el override no surte efecto.

  // `env.d.ts` lo genera Astro (`astro sync`) y su única línea es la triple-slash
  // reference que el plugin de TS desaprueba. Cambiarla a `import` se pierde en la
  // siguiente regeneración, así que la regla se apaga aquí en vez de pelearse.
  {
    files: ['astro/src/env.d.ts'],
    rules: { '@typescript-eslint/triple-slash-reference': 'off' },
  },

  // Provider + su hook en el mismo archivo (`AuthProvider`/`useAuthContext`,
  // `ClientContext`/`useClientContext`, `ThemeProvider`/`useTheme`,
  // `ConfirmDialog`/`useConfirm`) es EL patrón de React Context: el hook es la
  // única vía legítima de consumir ese contexto y vive pegado a él a propósito.
  // Partirlos en dos archivos sólo para que el fast-refresh conserve estado en
  // dev es ruido (Tríada, regla 5) — el costo real es recargar la página al
  // editar esos 4 archivos. Se apaga aquí, con el alcance acotado.
  {
    files: [
      'src/features/**/providers/*.tsx',
      'src/features/**/context/*.tsx',
      'src/components/ui/ConfirmDialog.tsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
