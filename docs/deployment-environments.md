# Entornos: dominios, variables y Vercel (ERP + Astro + Supabase)

Guía reutilizable para cada proyecto: qué URL va dónde, cómo separar datos de clientes de las pruebas, y cómo ordenar Vercel sin duplicar mentalmente las variables.

**Relacionado:** pilar público y variables de build en [SETUP.md](./SETUP.md) (sección 8, Pilar Público — Astro). PowerSync y flags por preview/producción: [deployment.md](./deployment.md).

---

## 1. Ideas clave

- **Dominio (URL)** = a qué **despliegue** apunta el DNS. No es lo mismo que una rama de Git.
- **Rama de Git** = qué código construye CI (p. ej. Vercel).
- **Supabase “branches”** (Database Branching en el dashboard: `main` PRODUCTION, *Create branch*, etc.) son **entornos de datos** dentro del mismo proyecto Supabase, no ramas de Git. Sigues necesitando que cada despliegue use la **URL y anon key** del entorno correcto (local, rama staging, producción).
- **`supabase start`** levanta Postgres + API + Auth + etc. **en tu máquina** (Docker). Mientras el ERP y Astro apunten a esa API local, **no se escribe nada** en la base en la nube de tus clientes. Ver [Supabase CLI local development](https://supabase.com/docs/guides/cli/getting-started).

---

## 2. Tabla de dominios (referencia)

Sustituye `tudominio.com` por el dominio del cliente o de tu agencia.

| Entorno | ERP (Vite) | Sitio público (Astro) | Supabase |
|---------|------------|------------------------|----------|
| **Local** | `http://localhost:7070` | `http://localhost:4321` | `http://127.0.0.1:54321` (salida de `supabase status` tras `supabase start`) |
| **Producción** | `https://app.tudominio.com` | `https://www.tudominio.com` | Proyecto cloud, rama **main / PRODUCTION** |
| **Staging (opcional)** | `https://app.dev.tudominio.com` | `https://www.dev.tudominio.com` | Misma instancia Supabase, **otra rama** de base de datos, u otro proyecto Supabase si prefieres aislamiento total |

Los nombres de subdominio son convención; lo importante es que **por entorno** las apps usen el **mismo par** ERP + público + misma API Supabase.

---

## 3. Variables por aplicación

Los nombres siguen el `.env.example` de la raíz y `astro/.env.example`.

### 3.1 ERP (monorepo, raíz)

| Variable | Local (nube apagada para pruebas) | Producción | Staging |
|----------|-----------------------------------|------------|---------|
| `VITE_SUPABASE_URL` | API local (`supabase status`) | `https://xxxx.supabase.co` (main) | URL de la rama staging o proyecto staging |
| `VITE_SUPABASE_ANON_KEY` | `anon` local | `anon` de producción | `anon` del entorno staging |
| `VITE_PUBLIC_SITE_URL` | `http://localhost:4321` | `https://www.tudominio.com` | `https://www.dev.tudominio.com` |

El ERP usa `VITE_PUBLIC_SITE_URL` para redirigir al sitio público (p. ej. entrada desde `/`).

### 3.2 Astro (`astro/`)

| Variable | Local | Producción | Staging |
|----------|--------|------------|---------|
| `VITE_SUPABASE_URL` | Igual que ERP (local o cloud) | Prod | Staging |
| `VITE_SUPABASE_ANON_KEY` | Igual que ERP | Prod | Staging |
| `PUBLIC_SITE_URL` | `http://localhost:4321` | `https://www.tudominio.com` | `https://www.dev.tudominio.com` |
| `PUBLIC_APP_URL` | `http://localhost:7070` | `https://app.tudominio.com` | `https://app.dev.tudominio.com` |
| `PUBLIC_ENABLE_ECOMMERCE` | Según prueba | Según negocio | Igual que prod o `true` para QA |

- **`PUBLIC_APP_URL`:** base del ERP para enlaces “Iniciar sesión” (`…/login`).
- **`PUBLIC_SITE_URL`:** URL canónica del público (OG, sitemap, robots). Debe existir en el **build** de Astro en producción.

**Coherencia:** en cada entorno, `PUBLIC_APP_URL` y `VITE_PUBLIC_SITE_URL` deben apuntar al **mismo mundo** (todo local, todo prod, o todo staging).

---

## 4. Vercel: dos proyectos por repositorio (recomendado)

Un solo repo puede desplegarse como **dos proyectos** en Vercel:

| Proyecto Vercel | Contenido | Dominio típico |
|-----------------|-----------|----------------|
| **ERP** | App React/Vite en la **raíz** | `app.tudominio.com` |
| **Web** | Directorio raíz del build: **`astro/`** | `www.tudominio.com` |

**Ventaja:** las variables `VITE_*` del ERP no se mezclan con las `PUBLIC_*` del sitio público; cada uno tiene sus propios scopes **Production** / **Preview** / **Development**.

### 4.1 Variables en cada proyecto

En **Settings → Environment Variables** de cada proyecto:

- **Production:** valores de la fila “Producción” de las tablas anteriores (Supabase **main**).
- **Preview:** suele usarse para PRs. Puedes copiar los valores de **staging** (misma Supabase rama staging) para no tocar producción, o desactivar previews que hablen con prod.
- **Development:** solo si usas `vercel dev`; muchos equipos confían en `.env` local.

### 4.2 Staging con dominios fijos

Opciones habituales:

1. **Rama `staging` en Git** conectada a Vercel y dominios `app.dev` / `www.dev` asignados a esa rama (según la opción que elijas en Vercel: Git Branch Production o dominio de preview fijado).
2. **Cuatro proyectos Vercel** (`erp`, `web`, `erp-staging`, `web-staging`) si quieres máxima claridad y menos sorpresas en los scopes de variables.

---

## 5. Supabase Auth (Site URL y redirect URLs)

En **Authentication → URL configuration** del proyecto (y por rama, si el dashboard lo separa), incluye todas las bases desde las que haya login real:

- `http://localhost:7070` (y la ruta de callback que uses, p. ej. `/auth/callback`)
- `https://app.tudominio.com` (y callback)
- Si hay staging: `https://app.dev.tudominio.com` (y callback)
- URLs de preview de Vercel **solo** si en esos despliegues vas a probar Auth con ese proyecto Supabase.

Si falta una URL, el login o el redirect fallan solo en ese entorno.

---

## 6. Desarrollo local sin tocar la nube

1. Instala Docker y Supabase CLI (véase [SETUP.md](./SETUP.md) sección 1).
2. En la raíz del repo: `supabase start`.
3. Copia `API URL` y `anon key` del output de `supabase status` a tu `.env` como `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. Aplica migraciones al local (`supabase db reset` o `migration up`, según tu flujo en SETUP sección 3).
5. Arranca `pnpm dev:all` con `VITE_PUBLIC_SITE_URL`, `PUBLIC_SITE_URL` y `PUBLIC_APP_URL` en localhost como en `.env.example`.

Así las pruebas destructivas (borrar usuarios, datos de prueba, migraciones) no afectan el proyecto cloud que usan los clientes.

---

## 7. Checklist rápido por nuevo cliente

- [ ] Definir dominios: `app` + `www` (y opcional `app.dev` + `www.dev`).
- [ ] Crear o elegir proyecto Supabase; definir si staging es **rama** de Supabase u otro proyecto.
- [ ] Dos proyectos Vercel (ERP + Astro) con variables **Production** alineadas a prod.
- [ ] Si hay staging: mismas claves de entorno en los proyectos (o proyectos `*-staging`) apuntando a la rama/API de staging.
- [ ] Rellenar **Site URL** y **Redirect URLs** en Supabase Auth para todos los orígenes necesarios.
- [ ] Local: documentar en el equipo el uso de `supabase start` + `.env` local para no mezclar datos.

---

## 8. Documentación interna del template

| Tema | Documento |
|------|-----------|
| URLs locales `7070` / `4321`, build Astro, sitemap | [SETUP.md](./SETUP.md) sección 8 |
| PowerSync, `VITE_ENABLE_POWERSYNC` por Preview/Production | [deployment.md](./deployment.md) |
| Esta matriz (dominios, env, Vercel, local vs nube) | Este archivo |
