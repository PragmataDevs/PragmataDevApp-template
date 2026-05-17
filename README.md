# PragmataDevApp Template

Plantilla base para apps web **offline-first** con arquitectura feature-based.

## Stack

- React + Vite + TypeScript
- Tailwind CSS
- Supabase (Auth, DB, Storage)
- PowerSync (sincronización offline en el ERP, con feature flag; si está apagado, lectura/escritura **online** directa a Supabase)
- **Entrega:** aplicaciones **web** en navegador (despliegue en hosting); no es una app nativa “descargable” de serie — ver **`docs/architecture.md`** secciones **0.1**–**0.3** (PWA / service worker opcional por proyecto; no ligado al flag de PowerSync).

Arquitectura completa: `docs/architecture.md` · PWA / service worker (propuesta): `docs/pwa-service-worker-proposal.md` · **Vercel + Astro (adapter, runtime, Supabase SSR):** `docs/template-handoff-vercel-y-astro.md`

**¿Acabas de crear el repo?** Lee primero **`docs/PARA-INICIAR.md`** (pasos en orden + Vercel resumido). Luego profundiza en `docs/SETUP.md` cuando necesites cada módulo.

Base de datos (schema): scripts en `docs/database/`; flujo industrial con Supabase CLI en **`docs/SETUP.md`** sección 3 (`supabase/migrations`, `db push`).  
Nuevo feature ERP paso a paso: **`docs/playbook-new-module.md`**.

## Requisitos

- Node.js 20+
- pnpm 9+
- Supabase CLI (sistema) si vas a aplicar migraciones, desplegar Edge Functions o usar **`supabase start`** (stack local en Docker) — **`docs/SETUP.md`** secciones 1.1 y **1.2** (Studio, usuario god, `.env`)

## Inicio rápido

1. Instala dependencias:

```bash
pnpm install
```

2. Crea tu entorno local a partir del ejemplo:

```bash
cp .env.example .env
```

3. Completa variables en `.env`.

4. (Opcional) Sitio público Astro — una vez:

```bash
cd astro && pnpm install && cd ..
```

5. Levanta la app **desde la raíz del repo** (`PragmataDevApp-template/`, no dentro de `astro/`):

Solo ERP (`http://localhost:7070`):

```bash
pnpm dev
```

ERP + Astro (`:7070` y `:4321`):

```bash
pnpm dev:all
```

Si estás dentro de `astro/`, puedes usar `pnpm dev:all` igualmente (reenvía al `package.json` raíz).

URLs y variables (local vs producción vs staging): **`docs/deployment-environments.md`**. Detalle del pilar Astro en **`docs/SETUP.md`** (sección 8, Pilar público).

## Variables de entorno

Crea **`.env`** en la raíz (`cp .env.example .env`). Sin `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` el login del ERP falla. Tras `supabase start`, copia URL y **Publishable** de `supabase status`. Reinicia `pnpm dev` al cambiar el archivo.

Este proyecto requiere:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_POWERSYNC_URL`
- `VITE_ENABLE_POWERSYNC`

En **desarrollo**, si abres Astro o el ERP por **IP de red** (móvil, LAN), los enlaces «Iniciar sesión» y la API Supabase en el navegador usan esa IP automáticamente (puertos `7070` / `54321`); ver `docs/SETUP.md` §2.2.1 y `docs/architecture.md`.

`VITE_ENABLE_POWERSYNC` controla el modo:

- `true`: lectura local con PowerSync/SQLite (offline-first)
- `false`: fallback directo a Supabase (modo online)

## Mantenimiento y CI

- Cambios recientes (URLs LAN automáticas, `.env` obligatorio, usuario dios): **`docs/template-maintenance.md`**
- Usuario dios en frontend: **`docs/security-god-user-frontend.md`**
- Workflow mínimo de CI (GitHub Actions): **`docs/ci-workflow.md`**

## Scripts

- `pnpm dev`: solo ERP (Vite, `:7070`)
- `pnpm dev:astro`: solo sitio público Astro (`:4321`; requiere `cd astro && pnpm install` antes)
- `pnpm dev:all`: ERP + Astro en paralelo — script **solo en la raíz** (desde `astro/` también: mismo comando gracias a `pnpm --dir ..`)
- `pnpm build`: build de producción del ERP
- `pnpm preview`: preview del build
- `pnpm lint`: lint del proyecto
- `pnpm db:seed`: seed de recursos de seguridad

## Performance (por defecto)

La plantilla ya incluye optimizaciones para reducir el costo del primer render:

- **Code-splitting por rutas** con `React.lazy` + `Suspense`.
- **Carga condicional de PowerSync**: si `VITE_ENABLE_POWERSYNC=false`, no inicializa runtime offline.
- **Chunking manual en build** (`vite.config.ts`) para separar vendor críticos:
	- `react-vendor` (react, react-dom, react-router-dom)
	- `supabase`
	- `powersync` (cuando aplica)

Esto mejora caché y evita un único bundle grande en la entrada de la app.

## Estructura

- `src/features`: lógica de negocio por módulo
- `src/components`: componentes reutilizables
- `src/lib`: infraestructura (db, supabase, storage, auth)
- `src/pages`: rutas/páginas
- `docs`: arquitectura, deployment y diseño

## Publicación como template en GitHub

1. Inicializa git en esta carpeta:

```bash
git init
git add .
git commit -m "chore: bootstrap template"
```

2. Crea el repo en GitHub y súbelo:

```bash
git branch -M main
git remote add origin <TU_REPO_URL>
git push -u origin main
```

3. En GitHub: **Settings → General → Template repository**.

## Notas

- No subas `.env` real; usa siempre `.env.example`.
- Mantén consistencia con `pnpm` en proyectos derivados.
