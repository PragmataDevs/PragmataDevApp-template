# Workflow mínimo de CI (GitHub Actions)

Este documento describe el **CI mínimo recomendado** para la template. El repo puede no traer el archivo YAML hasta que el equipo lo active; el objetivo es que cada clon sepa qué validar en cada push/PR.

## Qué es un workflow mínimo de CI

**CI** (Continuous Integration) ejecuta automáticamente una batería corta de comprobaciones en un servidor limpio cada vez que alguien hace push o abre un pull request. Un workflow **mínimo** no despliega ni corre E2E pesados: solo verifica que el código **compila, pasa lint y no rompe el build** de los dos pilares (ERP + Astro).

### Por qué importa en esta template

| Riesgo sin CI | Qué lo evita el workflow |
|---------------|-------------------------|
| TypeScript roto en `src/` | `pnpm build` (ERP) |
| Regresión en sitio público | `pnpm --dir astro build` |
| Estilo/errores obvios | `pnpm lint` |
| Tipos Astro desalineados | `pnpm --dir astro check` |

No sustituye tests E2E ni revisión manual; evita merges que dejan la template **no compilable**.

## Jobs recomendados (un solo workflow)

Nombre sugerido: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Astro workspace
        run: pnpm install --frozen-lockfile
        working-directory: astro

      - name: Lint ERP
        run: pnpm lint

      - name: Typecheck + build ERP
        run: pnpm build
        env:
          # Placeholders: Vite inyecta env en build; no llaman a Supabase real.
          VITE_SUPABASE_URL: https://placeholder.supabase.co
          VITE_SUPABASE_ANON_KEY: placeholder-anon-key
          VITE_ENABLE_POWERSYNC: 'false'

      - name: Astro check
        run: pnpm check
        working-directory: astro
        env:
          PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
          PUBLIC_SUPABASE_ANON_KEY: placeholder-anon-key

      - name: Build Astro
        run: pnpm build
        working-directory: astro
        env:
          PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
          PUBLIC_SUPABASE_ANON_KEY: placeholder-anon-key
          PUBLIC_SITE_URL: https://example.com
          PUBLIC_APP_URL: https://app.example.com
```

### Qué hace cada paso

1. **checkout** — Código del commit bajo prueba.
2. **pnpm + Node 20** — Misma versión que `package.json` / documentación.
3. **install** — Raíz y `astro/` (monorepo con workspace).
4. **lint** — ESLint en el ERP.
5. **build ERP** — `tsc -b` + `vite build`; falla si hay errores de tipos o imports.
6. **astro check** — Validación de tipos y plantillas Astro.
7. **build Astro** — Confirma que el pilar público compila en modo hybrid.

Variables `env` con placeholders evitan depender de secretos reales en CI; el build no debe llamar a Supabase en tiempo de compilación.

## Extensiones opcionales (no “mínimo”)

| Añadido | Cuándo |
|---------|--------|
| `pnpm test` | Cuando existan tests unitarios |
| Playwright E2E | Flujos críticos login + workspace |
| `supabase db lint` | Si el pipeline tiene Supabase CLI + proyecto linkado |
| Deploy preview (Vercel) | Tras CI verde en PRs |

## Activación en tu fork

1. Copia el YAML anterior a `.github/workflows/ci.yml`.
2. Ajusta ramas en `on.push.branches` si usas `develop`.
3. En GitHub → **Settings → Actions**, habilita workflows.
4. Abre un PR de prueba; debe aparecer el check **CI / validate**.

## Relación con otros docs

- Mantenimiento template: `docs/template-maintenance.md`
- Setup local: `docs/SETUP.md`
- Deploy: `docs/deployment-environments.md`
