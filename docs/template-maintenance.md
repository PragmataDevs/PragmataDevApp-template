# Mantenimiento de la template — cambios recientes

Registro de endurecimientos aplicados al chasis Pragmata. Útil al clonar el repo o al revisar PRs de infraestructura.

## 1. Limpieza legacy `project/`

Antes existía un layout y rutas bajo terminología **Proyecto** (`ProjectLayout`, `/projects/:projectId`). La navegación canónica es **Workspace** + `:entityId` (`AppLayout` + `WorkspaceLayout`).

### Eliminado

| Archivo | Motivo |
|---------|--------|
| `src/components/layout/ProjectLayout.tsx` | Sidebar propio duplicado; no referenciado en `router.tsx` |
| `src/pages/project/TasksPage.tsx` | Duplicado de `src/pages/workspace/TasksPage.tsx` |
| `src/types/projects/project.schema.ts` | Sin imports en el codebase |
| `PROJECT_ROUTES` en `routes.config.ts` | Alias obsoleto de `WORKSPACE_ROUTES` |

### Canónico hoy

- Rutas workspace: `WORKSPACE_ROUTES` en `src/app/routes.config.ts`
- Layout: `WorkspaceLayout` bajo `/workspace/:entityId/*`
- Terminología UI: `VITE_ENTITY_LABEL` (default en `.env.example`: `Proyecto`)

Reglas: `.cursor/rules/06-navigation-layout.mdc`

---

## 2. Usuario dios en frontend

`usePermission` antes concedía bypass con solo `access_level === 'god'`, sin validar `teams.is_platform_owner`.

**Ahora** alineado con `public.is_god()` — ver **`docs/security-god-user-frontend.md`**.

Archivos tocados:

- `src/lib/auth/isGodUser.ts` (nuevo)
- `src/features/auth/providers/AuthProvider.tsx`
- `src/features/auth/hooks/usePermission.ts`

---

## 3. Astro dev en red local (`host: true`)

Para paridad con Vite (`vite.config.ts` → `server.host: true`), Astro expone **Local** y **Network** al ejecutar `pnpm dev:astro` o `pnpm dev:all`:

```js
// astro/astro.config.mjs
server: {
  host: true,
  port: 4321,
},
```

### Pruebas desde otro dispositivo en LAN

Las URLs del terminal funcionan por IP, pero `.env` suele tener `localhost` en:

- `VITE_PUBLIC_SITE_URL`
- `PUBLIC_SITE_URL`
- `PUBLIC_APP_URL`

Para enlaces entre sitio público y ERP desde el móvil/tablet, usa temporalmente la IP de tu máquina:

```env
VITE_PUBLIC_SITE_URL=http://192.168.x.x:4321
PUBLIC_SITE_URL=http://192.168.x.x:4321
PUBLIC_APP_URL=http://192.168.x.x:7070
```

Detalle dev local: `docs/SETUP.md` sección 8.

---

## 4. CI (workflow mínimo recomendado)

La template **no incluye aún** `.github/workflows/`; se documenta el objetivo en **`docs/ci-workflow.md`** para que cada fork lo active cuando use GitHub Actions.

---

## Checklist post-clone

- [ ] `pnpm install` y `cd astro && pnpm install`
- [ ] `.env` desde `.env.example`
- [ ] Seed god user si desarrollas con RLS estricto
- [ ] `pnpm dev:all` — comprobar Local + Network en ERP y Astro
- [ ] (Opcional) Activar workflow de `docs/ci-workflow.md`
