# Mantenimiento de la template — cambios recientes

Registro de endurecimientos aplicados al chasis Pragmata. Útil al clonar el repo o al revisar PRs de infraestructura.

**Índice de documentación:** [`docs/README.md`](./README.md).

## 1. Features autocontenidas (`pages/` + `types/`)

### Pantallas

Las pantallas del ERP **ya no** viven en `src/pages/`. Cada dominio lleva su vertical slice:

```
src/features/<dominio>/
  navigation.ts   # opcional
  pages/ hooks/ components/ types/
  <subfeature>/   # mismo kit
```

### Modelos

Los tipos de negocio **ya no** viven en `src/types/<dominio>/`. Están en **`src/features/<dominio>/types/`**.

Queda solo **`src/types/core/base.ts`** (`AuditBase` re-export + `AppRoute`). Ver `src/types/README.md`.

Ejemplos: `features/entities/types/entity.ts`, `features/tasks/types/task.ts`, `features/auth/types/rbac.ts`.

- Rutas lazy: `src/app/routes.config.ts`
- Guías: [`client-features-playbook.md`](./client-features-playbook.md), [`erp-features-structure.md`](./erp-features-structure.md)

## 2. Limpieza legacy `project/`

Antes existía un layout y rutas bajo terminología **Proyecto** (`ProjectLayout`, `/projects/:projectId`). La navegación canónica es **Workspace** + `:entityId` (`AppLayout` + `WorkspaceLayout`).

### Eliminado

| Archivo | Motivo |
|---------|--------|
| `src/components/layout/ProjectLayout.tsx` | Sidebar propio duplicado; no referenciado en `router.tsx` |
| *(histórico)* `src/pages/project/TasksPage.tsx` | Eliminado; Kanban en `src/features/tasks/pages/TasksPage.tsx` |
| `src/types/projects/project.schema.ts` | Sin imports en el codebase |
| `PROJECT_ROUTES` en `routes.config.ts` | Alias obsoleto de `WORKSPACE_ROUTES` |

### Canónico hoy

- Rutas workspace: `WORKSPACE_ROUTES` en `src/app/routes.config.ts`
- Layout: `WorkspaceLayout` bajo `/workspace/:entityId/*`
- Terminología UI: `VITE_ENTITY_LABEL` (default en `.env.example`: `Proyecto`)

Reglas: `.cursor/rules/06-navigation-layout.mdc`

---

## 3. Usuario dios en frontend

`usePermission` antes concedía bypass con solo `access_level === 'god'`, sin validar `teams.is_platform_owner`.

**Ahora** alineado con `public.is_god()` — ver **`docs/security-god-user-frontend.md`**.

Archivos tocados:

- `src/lib/auth/isGodUser.ts` (nuevo)
- `src/features/auth/providers/AuthProvider.tsx`
- `src/features/auth/hooks/usePermission.ts`

---

## 4. Astro y Vite en red local (`host: true`)

Para paridad con Vite (`vite.config.ts` → `server.host: true`), Astro expone **Local** y **Network** al ejecutar `pnpm dev:astro` o `pnpm dev:all`:

```js
// astro/astro.config.mjs
server: {
  host: true,
  port: 4321,
},
```

---

## 4. URLs automáticas en desarrollo (sin `app.tucliente.com`)

**Problema que resuelve:** CTAs “Iniciar sesión” que iban a `https://app.tucliente.com` o a `localhost` cuando el usuario abría Astro desde el **móvil** por IP; y ERP con `supabaseUrl is required` sin archivo `.env`.

| Archivo | Cambio |
|---------|--------|
| `astro/src/lib/public-urls.ts` | `resolveAppOrigin` / `resolveSiteOrigin`: prioridad al host de la petición en dev; ignora placeholders `tucliente` / `tudominio`. |
| `astro/astro.config.mjs` | En dev inyecta `localhost:7070` / `:4321`; en prod no usa fallback `tucliente.com`. |
| `src/lib/supabase/resolveSupabaseConfig.ts` | Si el ERP se abre por IP y `.env` tiene `127.0.0.1:54321`, API → `{mismo-host}:54321`. |
| `src/lib/supabase/index.ts` | Error claro si faltan variables; proxy lazy del cliente. |
| `astro/src/lib/supabase.ts` | Misma regla Supabase en el navegador del sitio público. |

**LAN / móvil:** deja `PUBLIC_APP_URL=http://localhost:7070` y `VITE_SUPABASE_URL=http://127.0.0.1:54321` en `.env`; abre `http://<IP>:4321` — no hace falta reescribir la IP en el `.env` para cada dispositivo.

**Producción:** sigue siendo obligatorio `PUBLIC_APP_URL` y `PUBLIC_SITE_URL` reales en Vercel.

Documentación: `docs/architecture.md` (resolución automática), `docs/SETUP.md` §2.2.1, `docs/deployment-environments.md` §3.3.

---

## 5. CI (workflow mínimo recomendado)

La template **no incluye aún** `.github/workflows/`; se documenta el objetivo en **`docs/ci-workflow.md`** para que cada fork lo active cuando use GitHub Actions.

---

## 6. Cero `any` y setState fuera de los efectos (backport de SeguBros, 5-ago-2026)

Backport de la limpieza hecha en `segubros-app` (commits `7d7c84e`, `f0bc522`, `0540b24`).
El chasis traía **65 errores de lint**; quedaron **3** — ver "Pendiente" abajo.

Importa porque **el origen era esta template**: los 30 `any` estaban todos en el chasis
(`auth`, `chat`, `entities`, `notifications`, `profile`, `roles`, `users`) y ninguno en el
código propio del cliente. Cada proyecto instanciado los hereda; ya van 6.

### Lo que se aplicó

| Cambio | Dónde | Qué resuelve |
|---|---|---|
| `errorMessage()` en `src/lib/errors.ts` | 17 `catch (err: any)` | Los errores de PostgREST son **objetos planos**, no `Error`: un `instanceof Error` pelón se come el `"permission denied for table…"` y deja un genérico inútil |
| Tipo `Json`/`JsonObject` en `@pragmata/core` | `role_variables`, `conditions`, `metadata` | Columnas `jsonb` con garantía real en vez de `Record<string, any>` |
| `useSignedUrl()` en `src/lib/storage` | 4 copias de `useAvatarUrl` | **Race condition real**: ninguna copia cancelaba, y con dos cambios de path seguidos la respuesta vieja pisaba a la nueva (avatar de otra persona) |
| Tipos de embed de PostgREST | `useUsers`, `useEntities` | PostgREST entrega los embeds **anidados**; ojo con `?? null` si RLS filtra el embed y el modelo promete `\| null` |
| `ProductsPage` partido en dos | `rules-of-hooks` ×10 | El `if (!ECOMMERCE_ENABLED) return` vivía **arriba** de 10 hooks |
| Derivar en render / `useSyncExternalStore` | 12 de 14 `set-state-in-effect` | Ver `astro/src/lib/cart.ts` — snapshot cacheado por identidad, obligatorio para no meter bucle infinito |
| Config de ESLint | `eslint.config.js` | Ignora `astro/.vercel`; los overrides van **DESPUÉS** del bloque general (en flat config gana el último que hace match) |

**Regla que queda:** nada de `any` y nada de `setState` síncrono dentro de un `useEffect`.
Si el valor se calcula en render, **derívalo**; si viene de un store externo (localStorage,
eventos de `window`), `useSyncExternalStore`; para "resetear estado cuando cambia un valor
externo", compáralo **durante el render** (ejemplos en `AppLayout` y `useActiveEntity`).

### ⚠️ Pendiente — 3 archivos que tenían WIP

Al momento del backport estos tres tenían cambios sin commitear (`ScrollNav` + `DataTable`,
30-jul). **No se tocaron a propósito**, para no mezclar el refactor con trabajo a medias.
Los cambios son ortogonales; aplicarlos deja la template en 0 errores.

**`src/features/auth/providers/AuthProvider.tsx:108`** — `no-explicit-any`

```ts
// + import { errorMessage } from '@/lib/errors';
} catch (err: unknown) {
  // El abort llega como DOMException con name 'AbortError' (fetch cancelado) o
  // como error plano de PostgREST cuyo mensaje trae "aborted". Se cubren ambos.
  const name = err instanceof Error ? err.name : '';
  if (name === 'AbortError' || /aborted/i.test(errorMessage(err, ''))) {
```

**`src/components/layout/Header.tsx:35`** — `set-state-in-effect`

```ts
// + import { useSignedUrl } from '@/lib/storage';   (en vez de resolveSignedUrl)
// Borrar el useState + useEffect del avatar y dejar una línea:
const headerAvatarUrl = useSignedUrl('attachments', profile?.avatar_url);
```

**`src/components/layout/AppLayout.tsx:15`** — `set-state-in-effect`

```ts
// Sustituye al useEffect que hacía setSidebarOpen(false) por pathname.
// Va durante el render: con el efecto, el frame posterior a navegar se pintaba
// con el sidebar TODAVÍA abierto — parpadeo real en móvil.
const [prevPathname, setPrevPathname] = useState(location.pathname);
if (prevPathname !== location.pathname) {
  setPrevPathname(location.pathname);
  setSidebarOpen(false);
}
```

Verificación: `pnpm exec tsc -b --force` (0) · `pnpm exec eslint .` (0 errores) · `pnpm build`.
La template no tiene suite de tests; en SeguBros el mismo cambio dejó 176/176 en verde.

---

## 7. ⚠️ `dev:all` muere en silencio — 4 bugs de `scripts/dev-all.sh` (5-ago-2026)

**✅ Backporteado el 5-ago-2026.** Diagnosticado y corregido primero en `segubros-app`
(commit `2a4e652`). Como el script de segubros no traía nada propio suyo, se adoptó entero
como fuente de verdad: está aplicado en esta template y en los 6 clientes (clibsa, lawrank,
objetiva-ops, crm-objetiva, pragmata-os, invitaciones-paloma).

> **Lo que destapó el backport:** el bug 2 no era teórico. Ese mismo día se propagó a los
> clientes el bloque de acceso remoto por Tailscale —que introduce la línea de `APP_PORT`—
> **sin** estos arreglos, y **clibsa quedó con `dev:all` muerto**: su `vite.config.ts`
> escribe `port,` (el puerto viene de `VITE_PORT=4567` en su `.env`), el grep no hacía match
> y el script moría con Supabase ya levantado, sin imprimir una línea. Verificar `bash -n` y
> que Vite arranque **no** detecta esto: hay que ejecutar el bloque.

El síntoma es el peor posible: `pnpm dev:all` levanta Supabase y **muere sin imprimir una
sola pista**. Todo lo de abajo comparte la misma causa mecánica — `set -euo pipefail` con
un comando que devuelve 1 y nadie lo espera.

| # | Bug | Efecto |
|---|---|---|
| 1 | `PROJECT_ID` se saca con `grep -E '^[[:space:]]*project_id' supabase/config.toml`, pero **`project_id` es opcional y esta template no lo declara** | El `grep` sin match corta el script **antes del primer `echo`**. Fix: `\|\| true` + fallback a `basename "$PROJECT_ROOT"`, que es lo que hace el propio CLI (por eso los contenedores salen `supabase_db_<carpeta>`) |
| 2 | `APP_PORT` se saca con `grep -oE 'port:[^,}]*' vite.config.ts`, que asume el puerto escrito literal | Los proyectos migrados a `loadEnv` escriben `port,` (viene de variable) → sin match → muerte muda, ya con Supabase arriba. Fix: entorno → `VITE_PORT` del `.env` → y solo de último recurso el config |
| 3 | **El trap `cleanup` escribe a stdout** | 👇 ver abajo — el peor de los cuatro |
| 4 | `.env.local` se escribe directo con `{ … } > .env.local` | Un fallo a media escritura lo deja truncado. Fix: escribir a un temporal y publicar con `mv` (atómico), y solo si trae `VITE_SUPABASE_URL`; si no, conservar el anterior |

### El bug 3, en detalle — deja el proyecto atascado sin recuperación

`cleanup()` imprime con `echo` a **stdout**. Si el script muere dentro del bloque
`{ … } > .env.local`, el trap corre **con esa redirección todavía puesta**, así que su
mensaje de cierre se escribe **dentro de `.env.local`**:

```
# Regenerado por 'pnpm dev:all' …
# Ignorado por git (.env.*). Anon key: pública por diseño…

🛑 dev-all: cerrando — apagando Supabase local (segubros)…   ← dentro del .env
```

A partir de ahí el proyecto **no vuelve a arrancar nunca**:

1. `supabase start` se niega: `failed to parse environment file: .env.local (unexpected character … in variable name)`
2. el script muere en `supabase start`, o sea **antes** de llegar a regenerar `.env.local`
3. → vuelve al paso 1, para siempre

No se recupera solo: hay que **borrar `.env.local` a mano**. Y como el primer fallo deja la
mina puesta, todos los intentos siguientes mueren por la mina y no por la causa original —
por eso el bug parece aleatorio e irreparable.

**Fix:** los mensajes de `cleanup()` van a **stderr** (`>&2`), que nunca se redirige aquí,
así que jamás pueden contaminar un archivo.

### Cómo saber si un proyecto ya cayó

```bash
grep -lE "dev-all:|🛑" */.env.local */*/.env.local 2>/dev/null   # los que salgan están envenenados
```

### Dos bugs de puertos que aparecieron de paso

- **`vite.config.ts`** leía `process.env.VITE_PORT`, pero Vite no carga el `.env` en
  `process.env` (el config corre en Node antes). El ERP caía al default `7070` — el puerto
  de **Pragmata OS** — y se lo robaba. Fix: `loadEnv`, igual que `astro.config.mjs`.
- **`astro.config.mjs`** trae `port: 4399` fijo. Dos clientes con la template chocan en ese
  puerto y el segundo salta solo a otro, dejando `PUBLIC_SITE_URL`/`PUBLIC_APP_URL`
  apuntando a puertos muertos. **Cada cliente debe fijar el suyo.**

---

## Checklist post-clone

- [ ] `pnpm install` y `cd astro && pnpm install`
- [ ] `.env` desde `.env.example` + `supabase status` (Publishable en `VITE_SUPABASE_ANON_KEY`)
- [ ] Seed god user si desarrollas con RLS estricto
- [ ] `pnpm dev:all` — comprobar Local + Network en ERP y Astro
- [ ] (Opcional) Móvil: IP Network → login `:7070` y API `:54321` sin editar `.env`
- [ ] (Opcional) Activar workflow de `docs/ci-workflow.md`
