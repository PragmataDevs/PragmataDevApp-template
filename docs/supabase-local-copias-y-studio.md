# Supabase local por copia — bases, puertos y Studio

Guía para **cada clon** del template (un cliente / un repo): cómo tener una **Postgres nueva y aislada**, qué URL abrir en el navegador para **Supabase Studio**, y cómo evitar choques de puertos cuando trabajas con **varias copias a la vez** en la misma máquina.

**Relacionado:** flujo operativo en una copia → [proceso-supabase-studio-local.md](./proceso-supabase-studio-local.md) · variables ERP/Astro → [SETUP.md](./SETUP.md) §1.2 · nube (Vercel) → [deployment-environments.md](./deployment-environments.md).

---

## Respuesta corta

| Pregunta | Respuesta |
|----------|-----------|
| ¿Cada copia tiene su **propia base** local? | **Sí**, si haces `supabase start` **dentro de la carpeta de esa copia**. Docker crea volúmenes y contenedores ligados a ese proyecto CLI (nombre derivado del directorio). |
| ¿Cada copia usa **puertos distintos** automáticamente? | **No.** Por defecto **todas** las copias sin tocar `supabase/config.toml` compiten por los mismos puertos (`54321`–`54324`). Solo puede haber **un** `supabase start` activo con la config por defecto. |
| ¿Dónde está el enlace de **Studio**? | Tras `supabase start` en **esa** carpeta: `supabase status` → fila **Studio URL**, o por defecto **http://127.0.0.1:54323** (si no cambiaste `[studio] port`). |
| ¿La nube del cliente? | Es **otro** proyecto Supabase (`https://<ref>.supabase.co`). Local y nube no se mezclan si el `.env` apunta a uno u otro. |

---

## Cómo funciona una copia (una carpeta = un proyecto CLI)

```text
/home/tu/carpetas/
  cliente-a/PragmataDevApp/     → supabase start → DB "cliente-a" (Docker)
  cliente-b/PragmataDevApp/     → supabase start → DB "cliente-b" (Docker)
```

- **Datos:** cada carpeta tiene su propio volumen Docker (`supabase_db_<project_id>`). Resetear una copia no borra la otra: `supabase db reset` solo en esa carpeta.
- **Migraciones:** al hacer `supabase start`, se aplican los `.sql` de **esa** carpeta en `supabase/migrations/` (en la plantilla: `…20000…` + `…20001…` opcional PowerSync).
- **Studio:** es la UI web local del stack de **esa** carpeta; no es la URL del ERP.

---

## Puertos por defecto (una sola copia activa)

Valores en `supabase/config.toml` de la plantilla:

| Servicio | Puerto | Uso |
|----------|--------|-----|
| **API** (Kong) | **54321** | `VITE_SUPABASE_URL` del ERP y Astro — **sí va en `.env`** |
| **Postgres** | 54322 | `psql`, backups (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) |
| **Studio** | **54323** | Solo navegador — **no** poner en `VITE_SUPABASE_URL` |
| **Inbucket** (correos Auth) | 54324 | Pruebas «olvidé contraseña» — [auth-email-templates-local.md](./auth-email-templates-local.md) |
| **ERP** (Vite) | 7070 | `pnpm dev` / `PUBLIC_APP_URL` |
| **Astro** | 4321 | `pnpm dev:astro` / `PUBLIC_SITE_URL` |

Comandos en la **raíz de la copia**:

```bash
cd /ruta/a/esta-copia
supabase start
supabase status
```

Ejemplo de salida relevante:

```text
         API URL: http://127.0.0.1:54321
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
```

---

## Varias copias a la vez (puertos distintos)

Si necesitas **Cliente A** y **Cliente B** con `supabase start` **simultáneo**, asigna un **bloque de puertos** por copia y actualiza **tres sitios** en cada repo:

1. `supabase/config.toml` — `[api]`, `[db]`, `[studio]`, `[inbucket]`, `[db] shadow_port`
2. `.env` — `VITE_SUPABASE_URL=http://127.0.0.1:<api-port>`
3. Puertos del front (si ambos corren a la vez): `vite.config.ts` (`server.port`) y `astro/astro.config.mjs` (`server.port`)

### Tabla recomendada (plantilla)

| Copia / slot | API | DB | Studio | Mailpit | Shadow | ERP | Astro |
|--------------|-----|-----|--------|---------|--------|-----|-------|
| **A** (default plantilla) | 54321 | 54322 | **http://127.0.0.1:54323** | 54324 | 54320 | 7070 | 4321 |
| **B** | 54331 | 54332 | **http://127.0.0.1:54333** | 54334 | 54330 | 7071 | 4322 |
| **C** | 54341 | 54342 | **http://127.0.0.1:54343** | 54344 | 54340 | 7072 | 4323 |

> Ajusta si algún puerto ya está ocupado en tu OS (`ss -tlnp` / `lsof -i`).

### Ejemplo `supabase/config.toml` — copia B

```toml
[api]
port = 54331

[db]
port = 54332
shadow_port = 54330

[studio]
port = 54333

[inbucket]
port = 54334
```

`.env` de esa copia:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54331
VITE_SUPABASE_ANON_KEY=<Publishable de `supabase status` en esta carpeta>
PUBLIC_APP_URL=http://localhost:7071
PUBLIC_SITE_URL=http://localhost:4322
VITE_PUBLIC_SITE_URL=http://localhost:4322
```

**Auth local:** en `config.toml`, `site_url` y `additional_redirect_urls` deben usar el puerto ERP de **esa** copia (p. ej. `http://localhost:7071`).

Tras cambiar puertos: `supabase stop` → `supabase start` en **esa** carpeta.

---

## Enlaces de Studio por proyecto (registro)

Mantén una fila por cliente/copia en tu wiki interna o en el README del repo del cliente:

| Cliente / repo | Carpeta local | Studio (local) | API (.env) | Supabase nube (Dashboard) |
|----------------|---------------|----------------|------------|---------------------------|
| _Plantilla_ | `PragmataDevApp-template` | http://127.0.0.1:54323 | http://127.0.0.1:54321 | — |
| _Ejemplo Cliente X_ | `~/clientes/x/app` | http://127.0.0.1:54333 | http://127.0.0.1:54331 | https://abcdefgh.supabase.co |

**Nube:** Studio en producción es el Dashboard del proyecto: `https://supabase.com/dashboard/project/<project-ref>` (SQL Editor, Auth, etc.). No uses el puerto 54323 en la nube.

---

## Checklist — nueva copia del template

1. Clonar repo → carpeta dedicada.
2. Decidir: ¿solo esta copia en local (puertos default) o bloque B/C de la tabla?
3. Si hace falta, editar `supabase/config.toml` + puertos Vite/Astro.
4. `cp .env.example .env` → `supabase start` → pegar **Publishable** de `supabase status`.
5. Anotar **Studio URL** de `supabase status` en la tabla del cliente.
6. Studio → Auth → usuario → `docs/database/02_seed_god_user.sql` (UUID).
7. `pnpm db:sync` → `pnpm install` (+ `cd astro && pnpm install`).
8. `supabase functions serve` (local) o deploy a la nube del cliente.
9. ERP: `pnpm dev` (o `dev:all`) en el puerto configurado.

**No mezclar sesiones:** si cambias de copia (otro `VITE_SUPABASE_URL`), cierra sesión en el ERP o usa ventana privada — JWT de una instancia no vale en otra.

---

## Errores habituales

| Síntoma | Causa | Qué hacer |
|---------|--------|-----------|
| `port is already allocated` al `supabase start` | Otra copia (u otro servicio) usa el mismo puerto | Otro bloque en `config.toml` o `supabase stop` en la otra carpeta |
| ERP no conecta / 401 en `profiles` | `.env` apunta a otra instancia o sesión vieja | `supabase status` en **esta** carpeta; limpiar `localStorage` del origen del ERP |
| Puse `54323` en `VITE_SUPABASE_URL` | Confundir Studio con API | API = **54321** (o el `[api] port` que configuraste) |
| Cambié `config.toml` y sigue igual | Stack viejo en Docker | `supabase stop` && `supabase start` |

---

## Resumen visual

```mermaid
flowchart LR
  subgraph copiaA [Copia A - puertos default]
    A1[Studio :54323]
    A2[API :54321]
    A3[ERP :7070]
  end
  subgraph copiaB [Copia B - puertos offset]
    B1[Studio :54333]
    B2[API :54331]
    B3[ERP :7071]
  end
  A3 --> A2
  B3 --> B2
```

Cada columna es un stack Docker **independiente**. El desarrollador abre **Studio** en el puerto de esa columna para SQL y Auth; el ERP solo habla con el puerto **API** de la misma columna.
