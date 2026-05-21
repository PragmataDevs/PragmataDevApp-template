# Mantenimiento de la template — cambios recientes

Registro de endurecimientos aplicados al chasis Pragmata. Útil al clonar el repo o al revisar PRs de infraestructura.

**Índice de documentación:** [`docs/README.md`](./README.md).

## 1. Features autocontenidas (`src/features/*/pages/`)

Las pantallas del ERP **ya no** viven en `src/pages/`. Cada dominio lleva su vertical slice:

```
src/features/<dominio>/
  pages/ hooks/ components/ [providers/] [types/] [<subfeature>/...]
```

- Rutas lazy: `src/app/routes.config.ts` importa `@/features/<dominio>/pages/...`
- Duplicado eliminado: `features/settings/` (PermissionsPanel solo en `features/roles/`)
- Guías: [`client-features-playbook.md`](./client-features-playbook.md), [`src/features/README.md`](../src/features/README.md)

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

## Checklist post-clone

- [ ] `pnpm install` y `cd astro && pnpm install`
- [ ] `.env` desde `.env.example` + `supabase status` (Publishable en `VITE_SUPABASE_ANON_KEY`)
- [ ] Seed god user si desarrollas con RLS estricto
- [ ] `pnpm dev:all` — comprobar Local + Network en ERP y Astro
- [ ] (Opcional) Móvil: IP Network → login `:7070` y API `:54321` sin editar `.env`
- [ ] (Opcional) Activar workflow de `docs/ci-workflow.md`
