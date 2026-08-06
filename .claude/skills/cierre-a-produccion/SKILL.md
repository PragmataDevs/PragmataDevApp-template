---
name: cierre-a-produccion
description: >-
  Checklist para sacar una app PragmataDevApp a PRODUCCIÓN y dejarla en uso real.
  Úsala cuando vayas a hacer deploy, cuando preguntes "¿está listo para prod?",
  antes de entregar a un cliente, o cuando un proyecto esté al 80-90% y haya que
  cerrarlo. Cubre pre-flight, seguridad, datos, env y deploy a Vercel + Supabase.
allowed-tools: Read, Grep, Glob, Bash
---

# Cierre a producción — PragmataDevApp

"Listo" no es "compila". **Listo = corre en producción y el cliente la usa.** Esta skill es el checklist para llegar ahí sin sorpresas. No marques un paso como hecho hasta **comprobarlo** (corré el comando, mirá el output). Si algo falla, dilo con la evidencia.

> El detalle vivo está en el repo del cliente: `/docs/security-checklist.md`, `/docs/deployment-environments.md`, `/docs/SETUP.md`, `/docs/PARA-INICIAR.md` y `vercel.json`. Leélos cuando un paso lo pida — son la fuente de verdad.

## 1. Pre-flight (calidad) ✈️
- [ ] `pnpm build` (ERP) y `cd astro && pnpm build` corren **sin errores** de TypeScript ni de Vite.
- [ ] `pnpm lint` + `pnpm check` (typecheck) + `pnpm build` pasan. ⚠️ **Hoy el template NO tiene suite de tests** — el CI es lint+typecheck+build; la verificación real de comportamiento es **manual** (ver paso 6).
- [ ] No quedó código muerto, `console.log` de debug, ni `TODO` críticos.

## 2. Seguridad 🔒 (la Tríada no se negocia)
- [ ] Revisá `/docs/security-checklist.md` punto por punto.
- [ ] **RLS activo** en toda tabla; cada policy arranca con `is_god() OR …`.
- [ ] El **god user** está sembrado correctamente (`access_level='god'` + `team.is_platform_owner=TRUE`).
- [ ] **Llaves y secretos:** `anon key` pública OK; `service_role` **nunca** en el front; nada de credenciales hardcodeadas. `.env` **no** commiteado.
- [ ] CORS y redirects de Auth apuntan al dominio de prod, no a localhost.

## 3. Datos y migraciones 🗄️
- [ ] Todas las migraciones aplicadas en remoto: `supabase db push` sin pendientes.
- [ ] Operaciones idempotentes (no truenan si se re-corren).
- [ ] Plan de reversa claro: si algo sale mal, sabés qué migración lo revierte (recordá: el template es forward-only, "undo" = migración nueva que revierte).
- [ ] Edge Functions desplegadas si el proyecto las usa (`supabase functions deploy`).

## 4. Environment 🌱
- [ ] `.env` de producción **completo** (es obligatorio; sin él, Auth falla). Cruzá contra la matriz de `/docs/deployment-environments.md`.
- [ ] `VITE_SUPABASE_URL`/`ANON_KEY` apuntan al proyecto **de prod**, no al local ni staging.
- [ ] Feature flags correctos (`VITE_ENABLE_POWERSYNC`, `_ECOMMERCE`, `_AI`, `_MULTI_ENTITY`) según lo que el cliente realmente usa.
- [ ] Variables `PUBLIC_*` del sitio Astro con el dominio real (OG tags, sitemap).

## 5. Deploy 🚀 (dos proyectos Vercel desde un repo)
- [ ] Proyecto **ERP** (root) → `app.<dominio>` · Proyecto **Web/Astro** (`astro/`) → `www.<dominio>`. Ver `vercel.json`.
- [ ] **`rootDirectory` explícito en cada proyecto: `.` para el ERP y `astro` para el sitio.**
      Es el paso que más se olvida y falla **en silencio**: sin `rootDirectory`, Vercel lee el
      `vercel.json` de la raíz (el del ERP, con `noindex`) y **publica el ERP bajo el nombre del
      sitio público**. El build sale verde y la liga responde 200 — solo que sirve la app
      equivocada, invisible a Google. Le pasó a Clibsa y nadie lo notó (detectado 2026-08-05).
      Verificalo: `curl -s https://<web> | grep -E '<title>|robots|/_astro/'` → debe traer
      `/_astro/` y `robots: index, follow`, nunca `id="root"` ni `noindex`.
- [ ] **Ambos proyectos conectados al MISMO repo y branch** (solo cambia `rootDirectory`). Así un
      push despliega las dos ligas. Sin git conectado el proyecto solo sale por CLI manual y se
      queda atrás sin avisar. Ojo: **un proyecto de Vercel = un repo** — no reciclés el proyecto
      del sitio de un cliente para el `astro/` de otro repo suyo; el último deploy pisa al otro.
- [ ] Env vars cargadas en **cada** proyecto Vercel, en el scope correcto (Production).
- [ ] Push a `main` → auto-deploy. Confirmá que ambos buildearon en verde.
- [ ] ¿El cliente **necesita** sitio público? Si la app es interna (PMO, back-office), el pilar
      Astro no se despliega: un solo proyecto y listo. No todo repo son dos ligas.

## 6. Verificación post-deploy ✅ (el paso que la gente olvida)
- [ ] Entrá a la URL de prod y **logueá de verdad** (no asumas).
- [ ] El god user entra; un usuario normal ve solo lo suyo (RLS funciona en vivo).
- [ ] Flujo crítico del cliente probado de punta a punta.
- [ ] El sitio público carga y enlaza al login correcto.

## Al terminar
Reportá a Praxia: qué quedó en producción (URLs), qué verificaste con evidencia, y **si algo quedó pendiente para que el cliente la use de verdad** (capacitación, carga de datos inicial, etc.). Una app en prod que nadie usa todavía **no está cerrada** — dilo claro.
