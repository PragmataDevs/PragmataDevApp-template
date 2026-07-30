# Para iniciar — después de crear el repo

Guía corta en castellano: qué hacer **en orden** cuando arrancas un proyecto nuevo con esta template. Si te atoras en un paso, el detalle técnico está en **`docs/SETUP.md`** y lo de dominios/Vercel en **`docs/deployment-environments.md`**.

---

## 0. Qué tienes en las manos

Un **monorepo**: el **ERP** (React + Vite, carpeta raíz) y el **sitio público** (Astro en `astro/`). Los dos hablan con **Supabase** (base + auth). Puedes trabajar contra **la nube** o contra **Supabase en tu máquina** (Docker), según configures el `.env`.

**Importante — no es una “app de tienda” descargable:** lo que entrega la fábrica son **webs** que despliegas en un servidor; el usuario final entra por **navegador**. El repo lo **clonáis** vosotros; offline-first del ERP es **opcional** (`VITE_ENABLE_POWERSYNC`). Sin eso, el cliente va **online a Supabase**; para cosas ligeras (p. ej. carrito en el sitio público) se puede usar **`localStorage`**. Un **service worker** no viene ligado a ese flag (ver **0.3**). Detalle: **`docs/architecture.md`** secciones **0.1**–**0.3**; si el cliente pide PWA/SW, **`docs/pwa-service-worker-proposal.md`** (propuesta por fases, sin código en la template todavía).

---

## 1. Herramientas en tu compu

| Qué | Para qué |
|-----|-----------|
| **Node** 20+ y **pnpm** | Instalar deps y correr scripts |
| **Supabase CLI** (`brew install supabase/tap/supabase`) | Migraciones, `supabase start` local, deploy de funciones |
| **Docker Desktop** (opcional al principio) | Solo si quieres **Supabase local** sin tocar la nube |

Sin Docker puedes usar **solo proyecto Supabase en la nube** y listo.

---

## 2. Clonar y dependencias

```bash
git clone <tu-repo> && cd <tu-repo>
pnpm install
cd astro && pnpm install && cd ..
```

Primero la raíz, luego `astro/` — así no te faltan paquetes del sitio público.

---

## 3. Variables de entorno (`.env`)

```bash
cp .env.example .env
```

**Sin este archivo el ERP falla al cargar** (`supabaseUrl is required`). Después de editarlo, reinicia `pnpm dev` o `pnpm dev:all`.

Abre **`.env`** y mira los bloques:

- **Arriba (Supabase):** lo que está **sin `#` al inicio de la línea** es lo que usa la app *ahora*. En el example viene pensado para **local** (`http://127.0.0.1:54321` + clave Publishable de `supabase status`).
- **Las líneas comentadas** con `#` son la **chuleta para Vercel / producción** (URL de tu proyecto en la nube + anon + dominios `www` / `app`) — las copias al dashboard de Vercel cuando toque, no hace falta descomentarlas todas en tu máquina si sigues en local.

**Si usas la nube:** pon `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores del Dashboard → *Settings* → *API*.

**Si usas local:** Docker abierto → en la raíz del repo `supabase start` → `supabase status` y pegas **Project URL** (puerto **54321**, no 54323) y la clave **Publishable**. El paso a paso “Studio, usuario god, no mezclar sesión con la nube” está en **`docs/SETUP.md`** sección **1.2**.

**Celular o LAN:** puedes abrir Astro como `http://<IP-del-server>:4321`; “Iniciar sesión” irá a `http://<IP>:7070/login` y Supabase a `:54321` **sin** cambiar el `.env` a la IP (automático). Ver **`docs/SETUP.md`** §2.2.1.

---

## 4. Base de datos y usuario “dios”

1. Aplica el **schema** como en **`docs/SETUP.md`** §3 — local: `supabase start` aplica **2 migraciones** (`…20000…` con schema+Realtime, `…20001…` si PowerSync). Luego usuario Auth + `02_seed_god_user.sql` + **`pnpm db:sync`**. CMS legacy: `05_cms_pages_ensure_legacy.sql` solo si la base es antigua.
2. **Usuario god** (el que lo ve todo): crear usuario en **Auth** (Dashboard nube **o** Studio local `http://127.0.0.1:54323`), copiar UUID, ejecutar **`docs/database/02_seed_god_user.sql`** en el **SQL Editor** de *esa misma* instancia.

**Supabase local — guía paso a paso** (Studio, usuario `ltorres@pragmatadevs.com`, migraciones `01` y `02`): [**`docs/proceso-supabase-studio-local.md`**](./proceso-supabase-studio-local.md).

**Varias copias en un PC** (base nueva por carpeta, puertos y enlace Studio por cliente): [**`docs/supabase-local-copias-y-studio.md`**](./supabase-local-copias-y-studio.md).

**Correo «olvidé contraseña» en local:** plantillas en `supabase/templates/` (se cargan al `supabase start`); prueba en Mailpit → [**`docs/auth-email-templates-local.md`**](./auth-email-templates-local.md).

3. **Scripts y Edge Functions en local** (tras SQL 01–03): `pnpm db:sync`, `supabase functions serve` → [**`docs/proceso-post-migraciones-scripts-y-funciones-local.md`**](./proceso-post-migraciones-scripts-y-funciones-local.md). Nube: [SETUP.md §7](./SETUP.md#7-edge-functions--deploy).

---

## 5. Levantar la app en tu máquina

Solo ERP:

```bash
pnpm dev
# → http://localhost:7070
```

ERP + sitio público (recomendado si tocas Astro o ecommerce):

```bash
pnpm dev:all
# ERP :7070 · Astro :4321
```

Entra al login del ERP (`/login`) con el usuario que creaste + seed god si aplica.

Desde el **móvil** en la misma red: usa la IP que muestra el terminal (`Network` en `pnpm dev:all`), no `localhost`.

---

## 6. Vercel (cuando ya quieras algo en internet)

Idea simple: **dos proyectos en Vercel** conectados al **mismo repo**:

| Proyecto | Qué despliega | Dominio típico |
|----------|----------------|----------------|
| **ERP** | Build Vite en la **raíz** | `app.tudominio.com` |
| **Web** | Carpeta **`astro/`** | `www.tudominio.com` |

En cada uno → **Settings → Environment Variables → Production** y pegas lo que en tu `.env` tienes comentado para **nube** (URL Supabase, anon, y las tres URLs `VITE_PUBLIC_SITE_URL`, `PUBLIC_SITE_URL`, `PUBLIC_APP_URL` con tus dominios reales).

En **Supabase (nube)** → *Authentication* → *URL configuration*: añade las URLs de producción (`https://app...`, callbacks si los usas) para que el login no falle.

La tabla completa y el checklist por cliente: **`docs/deployment-environments.md`**.

**Atajo:** en vez de hacer local→nube a mano (schema, secrets, functions, god user, Auth URLs, storage), `pnpm cloud:bootstrap` lo automatiza en un comando — ver **`docs/supabase-cloud-bootstrap.md`**.

---

## 7. Dónde seguir leyendo

**Índice completo:** [**`docs/README.md`**](./README.md)

| Necesitas… | Documento |
|------------|-------------|
| Mapa de toda la documentación | **`docs/README.md`** |
| Digitalizar el negocio de un cliente (workshop, `src/features/`) | **`docs/client-features-playbook.md`** |
| Implementar un módulo (SQL → pantalla → RBAC) | **`docs/playbook-new-module.md`** |
| Carpetas del chasis en `src/features/` | **`docs/erp-features-structure.md`** |
| Studio local, usuario god, SQL | **`docs/proceso-supabase-studio-local.md`** |
| `db:sync`, Edge Functions local | **`docs/proceso-post-migraciones-scripts-y-funciones-local.md`** |
| Setup largo, flags, Astro, checklist | **`docs/SETUP.md`** |
| Vercel, dominios ERP + web | **`docs/deployment-environments.md`** |
| Local → nube en un comando (`cloud:bootstrap`) | **`docs/supabase-cloud-bootstrap.md`** |
| Arquitectura y convenciones | **`docs/architecture.md`** |

---

*Cuando este doc y la realidad del repo diverjan, manda actualizar este archivo en el mismo PR que cambie el flujo.*
