# Guía de Setup — Pragmata Template

Guía completa para activar cada módulo de la template desde cero.  
Sigue el orden de esta guía la primera vez; después solo activa lo que necesites.

> **¿Primera vez con el repo?** Si quieres una lectura corta y en castellano antes de entrar al detalle, empieza por [**PARA-INICIAR.md**](./PARA-INICIAR.md).

---

## Índice

1. [Requisitos previos](#1-requisitos-previos) (Docker: [1.1](#11-docker-y-supabase-local); flujo **Supabase local** completo: [1.2](#12-supabase-local-studio-env-y-usuario-god))
2. [Setup base (obligatorio)](#2-setup-base-obligatorio)
3. [Base de datos — Migraciones SQL](#3-base-de-datos--migraciones-sql)
4. [Módulo Documentos](#4-módulo-documentos)
5. [Módulo E-Commerce](#5-módulo-e-commerce)
6. [Módulo IA (ai-task-summary + ai-gateway)](#6-módulo-ia-ai-task-summary--ai-gateway)
7. [Edge Functions — Deploy](#7-edge-functions--deploy)
8. [Pilar Público — Astro](#8-pilar-público--astro)
   - Matriz de dominios, variables y Vercel (ERP + público + Supabase local/nube): [**deployment-environments.md**](./deployment-environments.md)
9. [RBAC — Sincronizar recursos](#9-rbac--sincronizar-recursos)
10. [Checklist final](#10-checklist-final)

- **Lectura corta** después de clonar (orden de pasos + Vercel resumido): [**PARA-INICIAR.md**](./PARA-INICIAR.md)

**Documentación:** índice en [`docs/README.md`](./README.md) (catálogo completo en `docs/`).

| Tema | Documento |
|------|-----------|
| Mapa `src/features/` | [`erp-features-structure.md`](./erp-features-structure.md) |
| Proyecto cliente (workshop) | [`client-features-playbook.md`](./client-features-playbook.md) |
| Nuevo módulo ERP (SQL → RBAC) | [`playbook-new-module.md`](./playbook-new-module.md) |
| Scripts SQL (índice) | [`database/README.md`](./database/README.md) |

---

## 1. Requisitos previos

| Herramienta | Versión mínima | Instalar |
|-------------|---------------|---------|
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| pnpm | 9+ | `npm i -g pnpm` |
| Docker Desktop (macOS/Windows) o motor Docker compatible | actual | [Docker Desktop](https://docs.docker.com/desktop/) (macOS: elige imagen **Apple Chip** o **Intel** según tu Mac) |
| Supabase CLI | latest | `brew install supabase/tap/supabase` |
| Cuenta Supabase | — | [supabase.com](https://supabase.com) — solo si usas proyecto **en la nube**; para solo local hace falta la CLI |

> Nota: la Supabase CLI **no** se instala como dependencia del proyecto.  
> Es una herramienta de sistema (Homebrew / instalación global). El SDK cliente que usa la app es `@supabase/supabase-js`.

### 1.1 Docker y Supabase local

Para levantar Postgres, Auth, API, etc. **en tu máquina** con `supabase start` (sin tocar la nube), la CLI usa contenedores Docker.

1. **Instala y abre Docker Desktop** (o arranca tu motor Docker). Sin demonio Docker activo, `supabase start` falla con error de conexión al socket.
2. **Instala la Supabase CLI** (si no lo hiciste): `brew install supabase/tap/supabase`.
3. Desde la **raíz del repo** (donde está la carpeta `supabase/`):

   ```bash
   supabase start
   ```

4. Cuando termine, ejecuta `supabase status` y copia **API URL** y **`anon` key** a tu `.env` como `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` cuando quieras que ERP y Astro usen el stack local.

Para parar los contenedores: `supabase stop`. Más contexto (URLs, Vercel, no mezclar con prod): **`docs/deployment-environments.md`**.

**Linux sin Docker Desktop:** instala Docker Engine + Compose según tu distro; la CLI solo necesita el daemon accesible.

**Alternativa ligera (avanzado):** Colima u otro runtime compatible con la API de Docker; debe exponer el mismo socket que espera `docker`.

**Si `supabase start` falla** con `storage ... unhealthy`: suele ser arranque lento o poca RAM para Docker; `supabase stop` y vuelve a intentar, sube memoria en Docker Desktop, o `brew upgrade supabase`. Ver también [Supabase CLI troubleshooting](https://github.com/supabase/cli/issues).

### 1.2 Supabase local: Studio, `.env` y usuario god

Objetivo: misma **API** (PostgREST, Auth, Storage…) que en la nube, pero **solo en tu máquina** — ideal para migraciones y pruebas sin tocar datos de clientes. Detalle de variables y Vercel: [**deployment-environments.md**](./deployment-environments.md).

> **Varias copias / clientes en el mismo equipo:** cada clon tiene **base local propia**, pero debes asignar **puertos distintos** si levantas más de un `supabase start` a la vez. Tabla de Studio y puertos: [**supabase-local-copias-y-studio.md**](./supabase-local-copias-y-studio.md).

> **Paso a paso completo (Studio → usuario → migraciones 01 y 02):** [**proceso-supabase-studio-local.md**](./proceso-supabase-studio-local.md)

| Comando | Uso |
|---------|-----|
| `supabase start` | Levanta el stack (primera vez descarga imágenes; puede tardar). Aplica migraciones en `supabase/migrations/` sobre la Postgres local. |
| `supabase migration up` | Aplica migraciones pendientes sin reiniciar Docker (p. ej. tras `git pull` o error CMS en `/seo/pages`). |
| `supabase stop` | Apaga contenedores (conserva datos en volúmenes Docker salvo que uses flags destructivos). |
| `supabase status` | Muestra URLs y claves; copia **Project URL** y la clave **Publishable** (`sb_publishable_…`) al `.env`. |

**Puertos habituales (no confundir):**

| Puerto | Servicio |
|--------|----------|
| **54321** | **API** (Kong): es la `VITE_SUPABASE_URL` del ERP y Astro (`http://127.0.0.1:54321`). |
| **54322** | Postgres directo (`psql`, backups). |
| **54323** | **Studio** (UI). No uses `54323` como `VITE_SUPABASE_URL`. |

**`.env`:** el archivo **`.env.example`** del repo sigue el patrón “**activo = local** + bloque comentado para copiar a **Vercel / nube**”. En local:

- `VITE_SUPABASE_URL=http://127.0.0.1:54321`
- `VITE_SUPABASE_ANON_KEY=<Publishable de `supabase status`>` (en CLIs recientes; si cambias de volumen Docker, vuelve a copiar la clave).

**Cambiar de nube ↔ local en el navegador:** si dejas una **sesión JWT** guardada (localStorage) de un proyecto y apuntas el `.env` al otro, PostgREST responde **401** en `profiles`. Cierra sesión en `http://localhost:7070` y borra el almacenamiento del sitio para esa origen, o usa una ventana privada.

**Alta de usuarios (sin registro público en la app):** mismo flujo que en el Dashboard de la nube, pero en **Supabase Studio local**:

1. Abre **http://127.0.0.1:54323**
2. **Authentication** → **Users** → **Add user** (email/contraseña).
3. Copia el **UUID** del usuario.

**Usuario god (`is_god()`):** en Studio local → **SQL Editor**, ejecuta `docs/database/02_seed_god_user.sql` sustituyendo el UUID en el `INSERT` por el del paso anterior (mismo script que en la nube; solo cambia **dónde** lo ejecutas). Luego entra al ERP en **http://localhost:7070/login** con ese usuario. Guía detallada con checklist: [**proceso-supabase-studio-local.md**](./proceso-supabase-studio-local.md).

**Correos Auth (olvidé contraseña / invitación):** plantillas en `supabase/templates/`; se publican al `supabase start`. Ver [**auth-email-templates-local.md**](./auth-email-templates-local.md). Prueba en Mailpit: http://127.0.0.1:54324.

**Seguridad y branding:** [**security-checklist.md**](./security-checklist.md) · [**brand-assets.md**](./brand-assets.md) (`pnpm brand:sync` tras cambiar el favicon).

**Edge Functions:** el stack local expone `http://127.0.0.1:54321/functions/v1`; las funciones hay que **servirlas o desplegarlas** según tu flujo (`supabase functions serve` / deploy a nube). No se asume que todo el Intelligence esté disponible offline sin pasos extra.

**Opcional:** `supabase/seed.sql` — si no existe, `supabase start` mostrará un aviso; puedes añadir seeds cuando quieras datos de prueba repetibles.

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

### 2.2 Crear archivo `.env` (obligatorio)

Copia el ejemplo — **sin `.env` el ERP no arranca Auth** (error `supabaseUrl is required`):

```bash
cp .env.example .env
```

El **`.env.example`** documenta en bloque:

- **Activo:** valores típicos para **Supabase local** (`supabase start`) y localhost ERP/Astro.
- **Comentado:** el mismo par **URL + anon** y las URLs públicas para **copiar a Vercel** (proyecto en la nube).

**Nube (sin Docker local):** Dashboard → Settings → API → `URL` y `anon public` en las variables activas (o intercambia bloques comentados según prefieras).

**Local:** tras `supabase start`, `supabase status` → **Project URL** (`http://127.0.0.1:54321`) y clave **Publishable** en `VITE_SUPABASE_ANON_KEY`. Flujo completo (Studio, god user, sesión): [**sección 1.2**](#12-supabase-local-studio-env-y-usuario-god).

> **Reinicia** `pnpm dev` o `pnpm dev:all` después de crear o cambiar `.env` (Vite solo lee variables al arrancar).

#### 2.2.1 Pruebas desde el celular o LAN (URLs automáticas)

Vite y Astro usan `server.host: true` (`:7070` y `:4321`). Puedes abrir el sitio como `http://<IP-de-tu-server>:4321` sin editar el `.env` a mano:

| Qué abres | A dónde van los enlaces (automático) |
|-----------|--------------------------------------|
| Astro en `http://100.x.x.x:4321` | Login → `http://100.x.x.x:7070/login` |
| ERP en `http://100.x.x.x:7070` | Supabase API → `http://100.x.x.x:54321` (si en `.env` tenías `127.0.0.1:54321`) |

Implementación: `astro/src/lib/public-urls.ts` y `src/lib/supabase/resolveSupabaseConfig.ts`. Detalle en **`docs/architecture.md`** (resolución automática de URLs) y **`docs/template-maintenance.md`** §5.

Requisitos: `supabase start` activo; puertos **54321**, **7070** y **4321** accesibles desde el dispositivo (firewall del server). La clave anon sigue saliendo del `.env` (no se infiere).

```env
# … ver .env.example para el resto de flags (PowerSync, ecommerce, IA, etc.)
VITE_ENABLE_POWERSYNC=false
VITE_ENABLE_AI=false
VITE_ENTITY_LABEL=Proyecto
VITE_ENABLE_MULTI_ENTITY=true
```

### 2.3 Arrancar la app (ERP)

```bash
pnpm dev
# http://localhost:7070 (puerto en vite.config.ts)
```

Si también trabajas con el sitio público, suele convenir levantar **ERP + Astro** a la vez → **`pnpm dev:all`** (véase la [sección 8](#8-pilar-público--astro) más abajo).

---

## 3. Base de datos — Migraciones SQL

Los scripts canónicos de schema viven en **`docs/database/*.sql`** (legibles, comentados, útiles como referencia y para el modo rápido).

El flujo **industrial** copia ese contenido a **`supabase/migrations/`** y aplica cambios con la **Supabase CLI** contra el proyecto remoto (`db push`). Así el historial queda en Git y cada entorno recibe el mismo orden de cambios.

> **Supabase local:** al ejecutar `supabase start` en la raíz, las migraciones en `supabase/migrations/` se aplican a la Postgres **local** (Docker). No sustituye a `supabase db push` contra la nube; son dos destinos. Flujo operativo: [**sección 1.2**](#12-supabase-local-studio-env-y-usuario-god).

### 3.0 Modo industrial: migraciones versionadas con Supabase CLI

Qué implica:

| Artefacto | Rol |
|-----------|-----|
| `docs/database/*.sql` | Fuente humana / checklist; idempotente donde aplica; ideal para pegar en migraciones o en SQL Editor. |
| `supabase/migrations/*.sql` | Migraciones **versionadas**: la CLI registra qué archivos ya corrieron; **cada archivo debe ejecutarse una sola vez** en cada base (no edites migraciones ya aplicadas en prod — crea una nueva). |
| `supabase db push` | Aplica al proyecto **linkeado** todas las migraciones pendientes. |

**Requisitos:** CLI instalada (véase **sección 1**), `supabase login`, y saber el **`project ref`**: Dashboard → **Project Settings → General → Reference ID** (ej. `abcd efgh ijkl mnop` sin espacios).

#### 3.0.1 Primera vez: enlazar el proyecto remoto

```bash
cd /ruta/al/repo   # raíz del monorepo
supabase login
supabase link --project-ref <tu_project_ref>
```

Opcional: `supabase projects list` confirma el ref si tienes varios proyectos.

#### 3.0.2 Migraciones en el repo (`supabase/migrations/`)

La plantilla incluye **dos migraciones versionadas** (copias nuevas limpias):

| Archivo | Contenido |
|---------|-----------|
| `20260111120000_pragmata_schema.sql` | Baseline completo (`docs/database/01_security_engine.sql`) + **Realtime** (`supabase_realtime`, sección 10 al final del archivo) |
| `20260111120001_pragmata_powersync_publication.sql` | Publicación lógica `powersync` — solo si `VITE_ENABLE_POWERSYNC=true` (`docs/database/03_powersync_publication.sql`) |

Scripts manuales en `docs/database/` (no duplican migraciones CLI salvo referencia):

| # | Archivo | Cuándo |
|---|---------|--------|
| `02_seed_god_user.sql` | Siempre tras crear usuario en Auth (no versionado) |
| `04_realtime_publication.sql` | Solo SQL Editor si no usas CLI (mismo bloque que §10 en `…20000…`) |
| `05_cms_pages_ensure_legacy.sql` | **Solo bases antiguas** sin `cms_pages`; copias nuevas ya lo traen en `…20000…` |

Flujo habitual: **`supabase db push`** tras `supabase link`, luego **`pnpm db:sync`** (catálogo RBAC) y seed god manual.

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
- **«Error al cargar cms_pages»** en el ERP: base legacy sin CMS. Copia nueva: `supabase db reset` o `migration up` con `…20000…`. Base antigua: ejecuta una vez `docs/database/05_cms_pages_ensure_legacy.sql` en SQL Editor. Verifica `SELECT slug FROM public.cms_pages;` → `home`.
- **Diff desde el Dashboard:** si cambiaste schema a mano en Supabase, puedes intentar alinear el repo con `supabase db pull` (genera/mezcla tipos y a veces migraciones según versión de CLI); lo habitual en plantilla es **solo migraciones en repo como fuente de verdad**.

### 3.1 Modo rápido (Dashboard → SQL Editor)

Si arrancas una base sin CLI, ejecuta en **Supabase Dashboard → SQL Editor** (o **Studio local** `http://127.0.0.1:54323` tras `supabase start`; ver [**proceso-supabase-studio-local.md**](./proceso-supabase-studio-local.md)), en este orden:

| # | Archivo | Qué hace |
|---|---------|----------|
| 1 | `docs/database/01_security_engine.sql` | Esquema completo (incluye tasks, documents, ecommerce, CMS, bucket product-images, `NOTIFY pgrst` al final) |
| 2 | `docs/database/02_seed_god_user.sql` | Usuario god (edita UUID/email antes) |
| 3 | `docs/database/03_powersync_publication.sql` | Solo si usas PowerSync |
| 4 | `docs/database/04_realtime_publication.sql` | **Siempre** — activa Realtime (`supabase_realtime`) en todas las tablas de negocio |

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

> **Local (post-SQL):** scripts + `supabase functions serve` → [**proceso-post-migraciones-scripts-y-funciones-local.md**](./proceso-post-migraciones-scripts-y-funciones-local.md). **Nube:** esta sección §7.

> **Atajo recomendado:** todo §7 (link, secrets, deploy) más migraciones, RBAC, god user, Auth URLs y storage está automatizado en un solo comando — ver [**supabase-cloud-bootstrap.md**](./supabase-cloud-bootstrap.md) (`pnpm cloud:bootstrap`). Los pasos manuales de abajo siguen sirviendo como referencia o para re-desplegar algo puntual.

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

En **desarrollo** el `.env` raíz suele llevar **localhost** (ver `.env.example`):

```env
VITE_PUBLIC_SITE_URL=http://localhost:4321
PUBLIC_SITE_URL=http://localhost:4321
PUBLIC_APP_URL=http://localhost:7070
```

- **`PUBLIC_APP_URL`** — En **producción**, base del ERP para “Iniciar sesión”. En **dev**, `public-urls.ts` prioriza el **host de la petición** si entras por IP (móvil/LAN); localhost en `.env` basta en la máquina del server.
- **`VITE_PUBLIC_SITE_URL`** / **`PUBLIC_SITE_URL`** — Base del sitio público: el ERP (`PublicSiteEntry` en `/`) redirige aquí. Misma inferencia por host en dev para Astro (canonical/OG cuando aplica).

En **producción** define dominios reales en Vercel (ej. `https://www.tudominio.com`, `https://app.tudominio.com`). Los placeholders `tucliente.com` del example **no** se usan en runtime.

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

Las URLs públicas en **local** están en **`.env.example`** (bloque “Desarrollo local”). Mínimo recomendado:

```env
VITE_PUBLIC_SITE_URL=http://localhost:4321
PUBLIC_SITE_URL=http://localhost:4321
PUBLIC_APP_URL=http://localhost:7070
```

Desde **otro dispositivo en la red** no hace falta duplicar la IP en el `.env` para login/Supabase: ver [**§2.2.1**](#221-pruebas-desde-el-celular-o-lan-urls-automáticas).

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

### 8.4 Build para producción (`hybrid` + Vercel)

El proyecto usa **`output: 'hybrid'`** y el adapter **`@astrojs/vercel/serverless`** (salida compatible con **Vercel** y `vercel dev`). Eso permite:

- **SSG:** páginas con `prerender = true` (p. ej. la landing `/`) → estáticos en el output de Vercel.
- **SSR:** páginas con `prerender = false` (p. ej. `/productos`, `/productos/[slug]`, `/checkout`) → función serverless de render.

```bash
cd astro
pnpm install
pnpm build
```

Tras el build, la salida típica incluye **`astro/.vercel/output/`** (Build Output API). **Ya no** se usa `node ./dist/server/entry.mjs` como verificación oficial del hybrid en Vercel.

> **`astro.config.mjs` debe exportar un objeto plano** (`defineConfig({ ... })`). Una función tipo `defineConfig(() => ({...}))` (estilo Vite) hace que Astro ignore adapter y modo hybrid.

**Runtime Node en Vercel:** el adapter `@astrojs/vercel@7.8.2` original puede emitir `nodejs18.x` en algunos casos; Vercel ya no acepta ese runtime en despliegues nuevos. Esta template aplica un **`pnpm` patch** (`patches/@astrojs__vercel@7.8.2.patch`) para que el runtime sea **`nodejs20.x`** o **`nodejs22.x`** según la versión de Node del builder. Tras `pnpm build`, comprueba `astro/.vercel/output/functions/_render.func/.vc-config.json` → **`runtime`** no debe ser `nodejs18.x`.

Checklist y variables: **[docs/template-handoff-vercel-y-astro.md](./template-handoff-vercel-y-astro.md)**.

### 8.5 Probar el build en local (Vercel CLI)

Después de `pnpm build`, desde **`astro/`**:

```bash
pnpm start
# equivale a: vercel dev — sirve el output en .vercel/output (hybrid SSR)
```

**`astro preview`:** no reproduce fielmente el hybrid con este adapter; para acercarte a producción usa **`vercel dev`** vía `pnpm start`.

### 8.6 Variables de entorno en producción

- **`PUBLIC_SITE_URL`:** URL canónica del sitio público (https://www.tucliente.com). Debe estar definida en el **momento del build** (`pnpm build`) si quieres OG URLs, Schema.org y enlaces absolutos correctos.
- **`PUBLIC_APP_URL`:** URL base del ERP para botones “Iniciar sesión” desde Astro (`…/login`).
- **`VITE_SUPABASE_*` / `PUBLIC_SUPABASE_*`:** ya cargadas desde el `.env` raíz vía `vite.envDir` en `astro.config.mjs`.

Para la matriz completa por entorno (local con `supabase start`, producción, staging, dos proyectos en Vercel y redirects de Auth), usa **[docs/deployment-environments.md](./deployment-environments.md)**.

### 8.7 Deploy (orientación)

| Destino | Idea general |
|--------|----------------|
| **Vercel (recomendado para esta template)** | Proyecto Vercel apuntando a `astro/`; build `pnpm build`; runtime Node 20/22 (ver **8.4** y [template-handoff-vercel-y-astro.md](./template-handoff-vercel-y-astro.md)). |
| **VPS / Docker / Node “clásico”** | Si necesitas servidor Node propio, valorar adapter `@astrojs/node` en un fork o rama aparte (esta template está alineada a Vercel + `@astrojs/vercel`). |

Dominios, scopes de variables y separación ERP / sitio público en Vercel: **[deployment-environments.md](./deployment-environments.md)**.

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

> Local tras migraciones 01–03: [**proceso-post-migraciones-scripts-y-funciones-local.md**](./proceso-post-migraciones-scripts-y-funciones-local.md)

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
- [ ] `.env` creado (partir de `.env.example`): `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` alineados al entorno (**local** `127.0.0.1:54321` + Publishable, o **nube** desde Dashboard)
- [ ] Si usas **Supabase local**: Docker + `supabase start`; usuario creado en Studio **http://127.0.0.1:54323** → Auth; seed god en SQL Editor local ([**sección 1.2**](#12-supabase-local-studio-env-y-usuario-god) · guía [**proceso-supabase-studio-local.md**](./proceso-supabase-studio-local.md))
- [ ] Schema aplicado: **modo industrial** (`supabase link` + migraciones en `supabase/migrations/` + `supabase db push`, véase **sección 3.0**) **o** modo rápido pegando scripts en SQL Editor (**sección 3.1**)
- [ ] SQL baseline aplicado (`01_security_engine.sql` o migración `…20000_pragmata_schema.sql`; incluye tasks, documents, ecommerce, CMS)
- [ ] Migraciones CLI al día (`…20000…` + `…20001…` si PowerSync); bases legacy sin CMS: `05_cms_pages_ensure_legacy.sql`
- [ ] SQL `02_seed_god_user.sql` aplicado (usuario god creado) — en nube: SQL Editor del proyecto; en local: SQL Editor de Studio **:54323**
- [ ] `pnpm dev` arranca sin errores en `localhost:7070` (o el puerto de tu `vite.config.ts`); consola del navegador **sin** `supabaseUrl is required`
- [ ] Login funciona con el usuario god
- [ ] (Opcional LAN) Desde móvil: Astro por `http://<IP>:4321` → “Iniciar sesión” abre `http://<IP>:7070/login` y el ERP habla con `http://<IP>:54321`

### Módulo Documentos
- [ ] Baseline (`01`) aplicado (tabla `documents` incluida)
- [ ] Bucket `documents` creado en Storage (privado, 50MB)
- [ ] Upload de un PDF de prueba funciona en la app

### E-Commerce
- [ ] Baseline (`01`) aplicado (tablas de tienda + SEO en `products`)
- [ ] Al menos 1 producto de ejemplo insertado
- [ ] Catálogo en `localhost:4321/productos` muestra los productos

### CMS sitio público (SEO)
- [ ] Tabla `cms_pages` existe (`SELECT slug FROM public.cms_pages` → fila `home`)
- [ ] ERP **SEO → Páginas del sitio** (`/seo/pages`) carga sin «Error al cargar cms_pages»
- [ ] (Opcional) `pnpm db:sync` con service role si añadiste recursos RBAC nuevos

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
- [ ] Para local: `VITE_PUBLIC_SITE_URL`, `PUBLIC_SITE_URL`, `PUBLIC_APP_URL` en `.env.example` (localhost); prueba LAN opcional sin cambiar IP en `.env` (§2.2.1)
- [ ] `pnpm dev:all` desde la raíz levanta ERP + Astro; o cada uno por separado con `pnpm dev` / `pnpm dev:astro`
- [ ] `pnpm build` en `astro/` termina sin error (`output: hybrid`, adapter `@astrojs/vercel`; revisar `astro/.vercel/output/functions/_render.func/.vc-config.json` → runtime **nodejs20.x** o **nodejs22.x**)
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
- El sitio debe compilarse en modo **hybrid** con adapter **`@astrojs/vercel`** (`astro.config.mjs`: objeto plano en `defineConfig`, **no** función callback).
- Tras `pnpm build`, validar con `pnpm start` desde `astro/` (servidor Node real).

### Astro: el build dice `output: "static"` sin adapter
- Revisa que `export default defineConfig({ ... })` sea un **objeto**, no `defineConfig(() => ({ ... }))`.
