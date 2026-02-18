# PragmataDevApp Template

Plantilla base para apps web **offline-first** con arquitectura feature-based.

## Stack

- React + Vite + TypeScript
- Tailwind CSS
- Supabase (Auth, DB, Storage)
- PowerSync (sincronización offline, con feature flag)

Arquitectura completa: `docs/architecture.md`

## Requisitos

- Node.js 20+
- pnpm 9+

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

4. Levanta el proyecto:

```bash
pnpm dev
```

La app corre por defecto en `http://localhost:7070`.

## Variables de entorno

Este proyecto requiere:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_POWERSYNC_URL`
- `VITE_ENABLE_POWERSYNC`

`VITE_ENABLE_POWERSYNC` controla el modo:

- `true`: lectura local con PowerSync/SQLite (offline-first)
- `false`: fallback directo a Supabase (modo online)

## Scripts

- `pnpm dev`: desarrollo local
- `pnpm build`: build de producción
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
