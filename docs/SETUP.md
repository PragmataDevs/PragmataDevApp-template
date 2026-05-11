# Guía de Setup — Pragmata Template

Guía completa para activar cada módulo de la template desde cero.  
Sigue el orden de esta guía la primera vez; después solo activa lo que necesites.

---

## Índice

1. [Requisitos previos](#1-requisitos-previos)
2. [Setup base (obligatorio)](#2-setup-base-obligatorio)
3. [Base de datos — Migraciones SQL](#3-base-de-datos--migraciones-sql)
4. [Módulo Documentos](#4-módulo-documentos)
5. [Módulo E-Commerce](#5-módulo-e-commerce)
6. [Módulo IA (ai-task-summary + ai-gateway)](#6-módulo-ia-ai-task-summary--ai-gateway)
7. [Edge Functions — Deploy](#7-edge-functions--deploy)
8. [Pilar Público — Astro](#8-pilar-público--astro)
9. [RBAC — Sincronizar recursos](#9-rbac--sincronizar-recursos)
10. [Checklist final](#10-checklist-final)

**Nuevo módulo ERP:** checklist corto en [`docs/playbook-new-module.md`](./playbook-new-module.md).

---

## 1. Requisitos previos

| Herramienta | Versión mínima | Instalar |
|-------------|---------------|---------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| pnpm | 8+ | `npm i -g pnpm` |
| Supabase CLI | latest | `brew install supabase/tap/supabase` |
| Cuenta Supabase | — | [supabase.com](https://supabase.com) |

> Nota: la Supabase CLI **no** se instala como dependencia del proyecto.  
> Es una herramienta de sistema (Homebrew / instalación global). El SDK cliente que usa la app es `@supabase/supabase-js`.

---

## 2. Setup base (obligatorio)

### 2.1 Clonar e instalar dependencias

**Núcleo ERP (React en la raíz)** — obligatorio:

```bash
git clone <repo>
cd PragmataDevApp-template
pnpm install
```

**Sitio público Astro (`astro/`)** — necesario si vas a usar la landing/catálogo, `pnpm dev:astro` o **`pnpm dev:all`**:

```bash
cd astro && pnpm install && cd ..
```

> Orden canónico: primero **`pnpm install`** en la raíz, luego **`cd astro && pnpm install`**. Repite el segundo cuando cambie `astro/package.json`.

### 2.2 Crear archivo `.env`

Copia el ejemplo y rellena tus valores de Supabase:

```bash
cp .env.example .env
```

Edita `.env`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...

# Opcional — deja los defaults por ahora
VITE_ENABLE_POWERSYNC=false
VITE_ENABLE_AI=false
VITE_ENTITY_LABEL=Proyecto
VITE_ENABLE_MULTI_ENTITY=true
```

> **Dónde encontrar estos valores:**  
> Supabase Dashboard → tu proyecto → Settings → API → `URL` y `anon public`

### 2.3 Arrancar la app (ERP)

```bash
pnpm dev
# http://localhost:7070 (puerto en vite.config.ts)
```

Si también trabajas con el sitio público, suele convenir levantar **ERP + Astro** a la vez → **`pnpm dev:all`** (véase **§8.0** más abajo).

---

## 3. Base de datos — Migraciones SQL

Los scripts canónicos de schema viven en **`docs/database/*.sql`** (legibles, comentados, útiles como referencia y para el modo rápido).

El flujo **industrial** copia ese contenido a **`supabase/migrations/`** y aplica cambios con la **Supabase CLI** contra el proyecto remoto (`db push`). Así el historial queda en Git y cada entorno recibe el mismo orden de cambios.

### 3.0 Modo industrial: migraciones versionadas con Supabase CLI

Qué implica:

| Artefacto | Rol |
|-----------|-----|
| `docs/database/*.sql` | Fuente humana / checklist; idempotente donde aplica; ideal para pegar en migraciones o en SQL Editor. |
| `supabase/migrations/*.sql` | Migraciones **versionadas**: la CLI registra qué archivos ya corrieron; **cada archivo debe ejecutarse una sola vez** en cada base (no edites migraciones ya aplicadas en prod — crea una nueva). |
| `supabase db push` | Aplica al proyecto **linkeado** todas las migraciones pendientes. |

**Requisitos:** CLI instalada (véase **§1**), `supabase login`, y saber el **`project ref`**: Dashboard → **Project Settings → General → Reference ID** (ej. `abcd efgh ijkl mnop` sin espacios).

#### 3.0.1 Primera vez: enlazar el proyecto remoto

```bash
cd /ruta/al/repo   # raíz del monorepo
supabase login
supabase link --project-ref <tu_project_ref>
```

Opcional: `supabase projects list` confirma el ref si tienes varios proyectos.

#### 3.0.2 Migraciones en el repo (`supabase/migrations/`)

La plantilla ya incluye el baseline en **dos archivos** (orden cronológico por nombre):

| Archivo | Contenido |
|---------|-----------|
| `20260111120000_pragmata_schema.sql` | Copia de `docs/database/01_security_engine.sql`: motor de seguridad + chat + notificaciones + tasks + documents + ecommerce + CMS + bucket `product-images` |
| `20260111120001_pragmata_powersync_publication.sql` | Publicación lógica `powersync` (equivalente a `docs/database/03_powersync_publication.sql`) |

Flujo habitual: **`supabase db push`** tras `supabase link`. El seed del usuario god **no** va en migraciones versionadas: sigue siendo `docs/database/02_seed_god_user.sql` (ajusta UUID/email antes de ejecutarlo).

Si mantienes `docs/database/01_security_engine.sql` y la migración `…20000…` al mismo tiempo, **mantén el contenido sincronizado** (o edita solo uno y copia al otro).

#### 3.0.3 Bases legacy (fuera de esta plantilla)

Si heredas una base con tabla `projects` o políticas RLS antiguas, no hay scripts sueltos en `docs/database/` para eso: conviene `supabase db diff` / migración incremental a medida tras revisar en staging.

#### 3.0.4 Aplicar migraciones al remoto

```bash
supabase db push
```

Ver estado local vs remoto:

```bash
supabase migration list
```

#### 3.0.5 Flujo de equipo / CI (orientación)

- Los `.sql` nuevos viven en **`supabase/migrations/`** y entran por PR.
- Tras merge, quien despliegue schema ejecuta `supabase link` (o usa `SUPABASE_ACCESS_TOKEN` en CI) y **`supabase db push`** contra staging y luego production.
- No sustituyas el contenido de migraciones ya aplicadas en producción: agrega una nueva migración incremental.

#### 3.0.6 Incidencias habituales

- **`Could not find the column/table in the schema cache`** (PostgREST): en SQL Editor, `NOTIFY pgrst, 'reload schema';` — varios scripts en `docs/database/` ya lo incluyen al final.
- **Diff desde el Dashboard:** si cambiaste schema a mano en Supabase, puedes intentar alinear el repo con `supabase db pull` (genera/mezcla tipos y a veces migraciones según versión de CLI); lo habitual en plantilla es **solo migraciones en repo como fuente de verdad**.

### 3.1 Modo rápido (Dashboard → SQL Editor)

Si arrancas una base sin CLI, ejecuta en **Supabase Dashboard → SQL Editor**, en este orden:

| # | Archivo | Qué hace |
|---|---------|----------|
| 1 | `docs/database/01_security_engine.sql` | Esquema completo (incluye tasks, documents, ecommerce, CMS, bucket product-images, `NOTIFY pgrst` al final) |
| 2 | `docs/database/02_seed_god_user.sql` | Usuario god (edita UUID/email antes) |
| 3 | `docs/database/03_powersync_publication.sql` | Solo si usas PowerSync |

El script `01` está pensado para **base vacía** (instalación nueva). Si ya tienes tablas creadas, usa migraciones incrementales o `supabase db diff` en lugar de pegar el baseline entero.

---

## 4. Módulo Documentos

### 4.1 Esquema SQL

La tabla `documents` y sus políticas RLS ya vienen en **`docs/database/01_security_engine.sql`** (y en la migración `…20000_pragmata_schema.sql`). Solo asegúrate de haber aplicado el baseline (**§3.0** o **§3.1**).

### 4.2 Crear el bucket de Storage

1. Ve a **Supabase Dashboard → Storage**
2. Click en **New bucket**
3. Configuración:
   - **Nombre:** `documents`
   - **Public bucket:** ❌ NO (privado — usa signed URLs)
   - **File size limit:** 50 MB
   - **Allowed MIME types:** dejar vacío (acepta todo)
4. Click **Save**

### 4.3 Verificar

- Ve a la app → Workspace → cualquier entidad → "Documentos"
- Debería aparecer la interfaz de upload
- Sube un PDF de prueba → debería aparecer en la grid con el botón "Ver"

---

## 5. Módulo E-Commerce

### 5.1 Esquema SQL

Las tablas `products`, `orders`, `order_items`, campos SEO en `products`, bucket Storage `product-images` y RLS ya están en **`01_security_engine.sql`**. Activa el feature flag de ecommerce en `.env` cuando toque; no hace falta aplicar scripts SQL extra para ese módulo.

### 5.2 Agregar productos de ejemplo

```sql
INSERT INTO public.products (name, slug, description, category, price, in_stock)
VALUES
  ('Producto 1', 'producto-1', 'Descripción del producto 1', 'General', 299.00, true),
  ('Producto 2', 'producto-2', 'Descripción del producto 2', 'General', 599.00, true);
```

### 5.3 Configurar Stripe (para pagos reales)

Ver guía completa en `docs/ecommerce/payments.md`.

**Resumen rápido:**

1. Crear cuenta en [stripe.com](https://stripe.com)
2. Obtener las claves en Stripe Dashboard → Developers → API Keys
3. Configurar en Supabase (ver sección 7)
4. Desplegar las funciones (ver sección 7)
5. Registrar el webhook en Stripe Dashboard → Webhooks

> Para desarrollo, usa las claves de **test** (`sk_test_xxx`).  
> Las tarjetas de prueba de Stripe: `4242 4242 4242 4242` (cualquier fecha futura, cualquier CVV).

---

## 6. Módulo IA (ai-task-summary + ai-gateway)

### 6.1 Obtener API Key de OpenAI

1. Ve a [platform.openai.com](https://platform.openai.com)
2. API Keys → Create new secret key
3. Copia la clave (empieza con `sk-proj-`)

> Para más detalles y el roadmap de IA: `docs/ai/setup.md`  
> Gateway de prompts (factura / estado de cuenta en texto): `ai/README.md`

### 6.2 Configurar el secret en Supabase

```bash
supabase secrets set OPENAI_API_KEY=sk-proj-xxxxx
```

O manualmente: **Supabase Dashboard → Edge Functions → Manage Secrets**

### 6.3 Activar el feature flag

En tu `.env`:

```env
VITE_ENABLE_AI=true
```

Reinicia el servidor de desarrollo (`pnpm dev`).

### 6.4 Verificar

Ve a Workspace → Tareas de cualquier entidad que tenga tareas creadas.  
Debería aparecer el botón **"Resumen IA"** junto al botón de refrescar.  
Al hacer click, genera un análisis del estado actual del proyecto.

### 6.5 AI Gateway (opcional pero recomendado para “IA genérica”)

Los prompts versionados viven en `ai/prompts/`. Antes de desplegar la función `ai-gateway`, sincronízalos al bundle que usa Deno:

```bash
pnpm ai:sync-prompts
supabase functions deploy ai-gateway
```

La misma `OPENAI_API_KEY` sirve para `ai-task-summary` y `ai-gateway`. Prueba rápida con `curl`: ver `docs/ai/setup.md` (sección **Probar**).

---

## 7. Edge Functions — Deploy

Necesitas el **Supabase CLI** instalado y autenticado.

### 7.1 Login y link del proyecto

```bash
supabase login
# Abre el navegador para autenticarte

supabase link --project-ref <tu_project_ref>
# El project_ref es el código de tu URL de Supabase:
# https://XXXXXXXXXXXXXX.supabase.co  ← ese código
```

### 7.2 Configurar todos los secrets

```bash
# IA
supabase secrets set OPENAI_API_KEY=sk-proj-xxx
supabase secrets set OPENAI_MODEL=gpt-4o-mini

# Stripe
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase secrets set PUBLIC_SITE_URL=https://tucliente.com
```

También se pueden configurar desde el dashboard:  
**Supabase Dashboard → Edge Functions → Manage Secrets**

| Variable | Dónde obtenerla | Para qué función |
|----------|----------------|-----------------|
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) → API Keys | `ai-task-summary`, `ai-gateway` |
| `OPENAI_MODEL` | Escribir `gpt-4o-mini` (default) | `ai-task-summary`, `ai-gateway` |
| `STRIPE_SECRET_KEY` | [Stripe Dashboard](https://dashboard.stripe.com) → Developers → API Keys | `stripe-checkout`, `stripe-webhook` |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → tu endpoint → Signing secret | `stripe-webhook` |
| `PUBLIC_SITE_URL` | Tu dominio de Astro, ej. `https://tucliente.com` | `stripe-checkout` |

### 7.3 Desplegar funciones

```bash
pnpm ai:sync-prompts
supabase functions deploy ai-gateway
supabase functions deploy ai-task-summary
supabase functions deploy stripe-checkout
supabase functions deploy stripe-webhook
```

### 7.4 Verificar deploy

```bash
supabase functions list
# Debe aparecer cada función con status "active"
```

---

## 8. Pilar Público — Astro

El sitio público (landing + ecommerce) es un proyecto Astro independiente en `astro/`.

### 8.0 Desarrollo local: dos puertos vs producción (dominios)

Son **dos aplicaciones** en el mismo monorepo:

| App | Carpeta | Puerto local típico | Rol |
|-----|---------|----------------------|-----|
| **ERP / operativo** | raíz (`vite`) | **7070** | Login, dashboard, Workspace, admin de productos |
| **Sitio público** | `astro/` | **4321** | Landing SEO, catálogo `/productos`, carrito |

En **desarrollo** enlazas una con la otra con URLs **localhost** en el `.env` raíz:

```env
VITE_PUBLIC_SITE_URL=http://localhost:4321
PUBLIC_SITE_URL=http://localhost:4321
PUBLIC_APP_URL=http://localhost:7070
```

- **`PUBLIC_APP_URL`** — Base del ERP: Astro usa esto en “Iniciar sesión” → `{PUBLIC_APP_URL}/login`.
- **`VITE_PUBLIC_SITE_URL`** / **`PUBLIC_SITE_URL`** — Base del sitio público: el ERP (`PublicSiteEntry` en `/`) redirige aquí.

En **producción** sustituye por tus dominios (ej. `https://www.tucliente.com` y `https://app.tucliente.com`) en el `.env` del build / variables del hosting.

**Un solo comando para pruebas locales** (después de **§2.1**: dependencias en raíz y en `astro/`):

Ejecuta esto con el cwd en la **raíz del monorepo** (carpeta que contiene `package.json` del ERP y la carpeta `astro/`):

```bash
pnpm dev:all
```

También funciona si tu terminal está en `astro/` (`pnpm dev:all` ahí reenvía al script raíz).

Eso lanza **Vite (ERP)** y **`pnpm dev` de Astro** en paralelo; `Ctrl+C` detiene ambos.

> **No pegues instrucciones con comentarios inline tipo `# texto (entre paréntesis)` en la misma línea que el comando:** en zsh los paréntesis pueden interpretarse como subshell y dar errores crípticos. Usa líneas de comando limpias o comentarios en líneas aparte que empiecen por `#` solos.

### 8.1 Instalar dependencias del pilar público

Igual que en **[§2.1](#21-clonar-e-instalar-dependencias)** (paso Astro):

```bash
cd astro && pnpm install && cd ..
```

### 8.2 Variables de entorno (mismo `.env` raíz)

`astro/astro.config.mjs` carga el `.env` del **repositorio padre** (`envDir: ..`). Con el `.env` que ya usas para el ERP (al menos `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`) el catálogo puede leer Supabase sin duplicar claves.

Las URLs públicas en **local** están en **`.env.example`** (bloque “Desarrollo local”). Mínimo recomendado para que CTAs y redirecciones encajen:

```env
VITE_PUBLIC_SITE_URL=http://localhost:4321
PUBLIC_SITE_URL=http://localhost:4321
PUBLIC_APP_URL=http://localhost:7070
```

Opcional: `PUBLIC_ENABLE_ECOMMERCE`, `PUBLIC_BRAND_NAME`, etc.

Si despliegas **solo** la carpeta `astro/`, puedes crear `astro/.env` (ver `astro/.env.example`): esas claves se fusionan **encima** del padre cuando existen ambos.

### 8.3 Arrancar en desarrollo

**Solo Astro** (si el ERP ya corre en otra terminal):

```bash
cd astro
pnpm dev
# http://localhost:4321 — landing
# http://localhost:4321/productos — catálogo
```

**ERP + Astro juntos** (recomendado para ecommerce / enlaces login):

```bash
# Desde la raíz del repositorio
pnpm dev:all
```

Scripts útiles en la raíz del `package.json`:

| Script | Qué hace |
|--------|-----------|
| `pnpm dev` | Solo ERP → `:7070` |
| `pnpm dev:astro` | Solo Astro → `:4321` |
| `pnpm dev:all` | Ambos en paralelo (`concurrently`) — definido en la **raíz**; en `astro/` existe el mismo nombre y llama al raíz |

### 8.4 Build para producción (`hybrid` + Node)

El proyecto usa **`output: 'hybrid'`** y el adapter **`@astrojs/node`** (`mode: 'standalone'`). Eso permite:

- **SSG:** páginas con `prerender = true` (p. ej. la landing `/`) → HTML estático en `dist/client/`.
- **SSR:** páginas con `prerender = false` (p. ej. `/productos`, `/productos/[slug]`, `/checkout`) → servidor Node en `dist/server/`.

```bash
cd astro
pnpm build
```

Salida típica:

- `astro/dist/client/` — assets estáticos e hidratación del cliente.
- `astro/dist/server/entry.mjs` — **punto de entrada del servidor** que sirve rutas SSR y mezcla lo estático.

> **`astro.config.mjs` debe exportar un objeto plano** (`defineConfig({ ... })`). Una función tipo `defineConfig(() => ({...}))` (estilo Vite) hace que Astro ignore adapter y modo hybrid.

### 8.5 Probar el build en local (servidor Node)

Después de `pnpm build`, desde **`astro/`**:

```bash
pnpm start
# equivale a: node ./dist/server/entry.mjs
```

Por defecto escucha en **`http://localhost:4321`**. Para exponer en la red (p. ej. móvil en la misma Wi‑Fi):

```bash
HOST=0.0.0.0 PORT=4321 pnpm start
```

*(Si tu versión del adapter ignora `HOST`/`PORT`, revisa la [guía oficial del adapter Node](https://docs.astro.build/en/guides/integrations-guide/node/).)*

**`pnpm preview` (`astro preview`):** útil sobre todo para sitios **100% estáticos**. Con hybrid + SSR, la verificación fiable del comportamiento de producción es **`pnpm start`** tras el build.

### 8.6 Variables de entorno en producción

- **`PUBLIC_SITE_URL`:** URL canónica del sitio público (https://www.tucliente.com). Debe estar definida en el **momento del build** (`pnpm build`) si quieres OG URLs, Schema.org y enlaces absolutos correctos.
- **`PUBLIC_APP_URL`:** URL base del ERP para botones “Iniciar sesión” desde Astro (`…/login`).
- **`VITE_SUPABASE_*` / `PUBLIC_SUPABASE_*`:** ya cargadas desde el `.env` raíz vía `vite.envDir` en `astro.config.mjs`.

### 8.7 Deploy (orientación)

| Destino | Idea general |
|--------|----------------|
| **VPS / Docker / Node** | Copiar `astro/dist/` + `node_modules` de producción (o imagen multi-stage), ejecutar `node dist/server/entry.mjs`, proxy reverso (nginx/Caddy) con TLS. |
| **Vercel / Netlify** | Suelen tener integración Astro con SSR; sigue la doc del proveedor (pueden no usar el mismo layout `standalone`). |

### 8.8 Sitemap y `robots.txt` (Astro)

No usamos **`@astrojs/sitemap`** en hybrid (evita errores `_routes` en integraciones antiguas). En su lugar:

| Ruta | Archivo | Comportamiento |
|------|---------|----------------|
| `/sitemap.xml` | `astro/src/pages/sitemap.xml.ts` | SSR: incluye `/`, y si `PUBLIC_ENABLE_ECOMMERCE=true` también `/productos` y cada `/productos/[slug]` activo (consulta pública a `products`). |
| `/robots.txt` | `astro/src/pages/robots.txt.ts` | SSR: `Allow: /`, bloquea `/checkout` y `/gracias`; si ecommerce está off, `Disallow: /productos`. La línea **`Sitemap:`** usa el origen canónico (`astro.config` `site` = `PUBLIC_SITE_URL` / fallback dev). |

**Producción:** define **`PUBLIC_SITE_URL=https://www.tucliente.com`** en el entorno del **build** para que canonical, OG, sitemap y robots apunten al dominio real.

**ERP:** el archivo raíz `public/robots.txt` del SPA sigue en **`Disallow: /`** (no indexar la app).

---


## 9. RBAC — Sincronizar recursos

Cada vez que agregas una página nueva con `resourceCode`, debes registrarla en la base de datos.

```bash
# Desde la raíz del proyecto
SUPABASE_SERVICE_ROLE_KEY=eyJh... pnpm db:sync
```

> **Dónde obtener `SUPABASE_SERVICE_ROLE_KEY`:**  
> Supabase Dashboard → Settings → API → `service_role` (mantener privado, nunca en `.env`)

El script sincroniza `src/config/security/resources.ts` con la tabla `sys_resources` en Supabase.  
Los recursos nuevos que agrega esta versión del template son:
- `page_workspace_documents` — Módulo de Documentos

---

## 10. Checklist final

Marca cada ítem antes de considerar el setup completo:

### Base (obligatorio para que funcione la app)
- [ ] `pnpm install` ejecutado en la **raíz** del repo
- [ ] `.env` creado con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
- [ ] Schema aplicado: **modo industrial** (`supabase link` + migraciones en `supabase/migrations/` + `supabase db push`, véase **§3.0**) **o** modo rápido pegando scripts en SQL Editor (**§3.1**)
- [ ] SQL baseline aplicado (`01_security_engine.sql` o migración `…20000_pragmata_schema.sql`; incluye tasks, documents, ecommerce, CMS)
- [ ] SQL `02_seed_god_user.sql` aplicado (usuario god creado)
- [ ] `pnpm dev` arranca sin errores en `localhost:7070` (o el puerto de tu `vite.config.ts`)
- [ ] Login funciona con el usuario god

### Módulo Documentos
- [ ] Baseline (`01`) aplicado (tabla `documents` incluida)
- [ ] Bucket `documents` creado en Storage (privado, 50MB)
- [ ] Upload de un PDF de prueba funciona en la app

### E-Commerce
- [ ] Baseline (`01`) aplicado (tablas de tienda + SEO en `products`)
- [ ] Al menos 1 producto de ejemplo insertado
- [ ] Catálogo en `localhost:4321/productos` muestra los productos

### IA
- [ ] `OPENAI_API_KEY` configurado en Supabase Secrets
- [ ] `pnpm ai:sync-prompts` ejecutado cuando cambies `ai/prompts/*.json`
- [ ] `ai-gateway` y `ai-task-summary` desplegadas (`supabase functions deploy`)
- [ ] `VITE_ENABLE_AI=true` en `.env`
- [ ] Botón "Resumen IA" aparece en TasksPage y funciona

### Pagos
- [ ] `STRIPE_SECRET_KEY` (test) configurado en Supabase Secrets
- [ ] `stripe-checkout` y `stripe-webhook` desplegadas
- [ ] Webhook registrado en Stripe Dashboard
- [ ] Flujo de compra completo probado con tarjeta test `4242 4242 4242 4242`

### Astro / Público
- [ ] `cd astro && pnpm install` ejecutado
- [ ] En el `.env` raíz están `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Astro las reutiliza)
- [ ] Para local: `VITE_PUBLIC_SITE_URL`, `PUBLIC_SITE_URL` → `http://localhost:4321` y `PUBLIC_APP_URL` → `http://localhost:7070` (ver `.env.example`)
- [ ] `pnpm dev:all` desde la raíz levanta ERP + Astro; o cada uno por separado con `pnpm dev` / `pnpm dev:astro`
- [ ] `pnpm build` en `astro/` termina sin error (`output: hybrid`, adapter `@astrojs/node`)
- [ ] `pnpm start` en `astro/` (tras el build) sirve el sitio y `/productos/[slug]` responde sin error de rutas estáticas

### RBAC
- [ ] `SUPABASE_SERVICE_ROLE_KEY=xxx pnpm db:sync` ejecutado
- [ ] `page_workspace_documents` aparece en `sys_resources` en Supabase

---

## Problemas comunes

### "Could not find the table in the schema cache"
```sql
-- Ejecutar en Supabase SQL Editor
NOTIFY pgrst, 'reload schema';
```

### El god user no puede ver datos
El baseline ya incluye `is_god()` en políticas RLS. Verifica que el perfil tenga `access_level = 'god'` y que el equipo tenga `is_platform_owner = true` (véase `docs/database/02_seed_god_user.sql`). Si la base es muy antigua, revisa el schema con `supabase db diff` o migra a una instancia nueva con las migraciones del repo.

### La Edge Function retorna 401
- Verifica que el usuario está logueado en la app
- El token JWT se está enviando en el header `Authorization: Bearer <token>`

### El upload de documentos falla
- Verificar que el bucket `documents` existe y es privado
- Verificar que la política RLS del bucket permite INSERT al usuario autenticado

### `pnpm db:sync` falla
- Asegúrate de pasar `SUPABASE_SERVICE_ROLE_KEY` inline (no en `.env`)
- La service role key es diferente a la anon key — está en Settings → API → `service_role`

### Astro: `GetStaticPathsRequired` en `/productos/[slug]` o error de renderer `.tsx`
- El sitio debe compilarse en modo **hybrid** con adapter **`@astrojs/node`** (`astro.config.mjs`: objeto plano en `defineConfig`, **no** función callback).
- Tras `pnpm build`, validar con `pnpm start` desde `astro/` (servidor Node real).

### Astro: el build dice `output: "static"` sin adapter
- Revisa que `export default defineConfig({ ... })` sea un **objeto**, no `defineConfig(() => ({ ... }))`.
