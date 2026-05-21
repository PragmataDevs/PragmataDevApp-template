# Estructura `src/features/` (ERP)

Mapa de carpetas del pilar operativo. Las pantallas viven en **`src/features/<dominio>/pages/`**; las URLs se registran en **`src/app/routes.config.ts`**.

**No existe `src/pages/` en el ERP.** El sitio público Astro usa **`astro/src/pages/`** (otro pilar).

Guías relacionadas: [**client-features-playbook.md**](./client-features-playbook.md) · [**playbook-new-module.md**](./playbook-new-module.md) · [**architecture.md**](./architecture.md) §2.

---

## Kit por dominio (y subfeature)

```
src/features/<dominio>/
  pages/        ← obligatorio si hay rutas (lazy en routes.config.ts)
  hooks/        ← useCrudResource o custom (withSessionRetry + sessionEpoch)
  components/   ← modales, formularios, sub-vistas
  providers/    ← opcional — contexto del dominio
  types/        ← opcional — modelos solo de este dominio (ver client-features-playbook §5)
  <subfeature>/ ← mismo kit anidado (ej. finanzas/egresos/contratos/)
```

Convenciones:

- Carpetas en **minúsculas** (`finanzas`, no `Finanzas`). Labels UI en sidebar y `APP_RESOURCES`.
- **Chasis** (auth, RBAC, layouts): no reescribir por cliente; **extender** con dominios nuevos.
- Lazy **por página**, no por carpeta `finanzas` entera (ver [**bundle-chunck-strategy.md**](./bundle-chunck-strategy.md)).

---

## Chasis incluido en la template

| Feature | Contenido principal | Rutas URL (ej.) |
|---------|---------------------|-----------------|
| `shell` | `pages/PublicSiteEntry` | `/` → redirección Astro |
| `auth` | `pages/`, `hooks/`, `providers/`, `components/RouteGuard` | `/login`, `/auth/*` |
| `dashboard` | `pages/DashboardPage` | `/dashboard` |
| `profile` | `pages/ProfilePage` | `/profile` |
| `roles` | `pages/RolesPage`, `components/PermissionsPanel` | `/settings/roles` |
| `users` | `pages/UsuariosPage`, `UsuarioNewPage` | `/settings/usuarios` |
| `entities` | `pages/`, `hooks/`, `EntitySelector` | `/settings/entities` |
| `tasks` | `pages/TasksPage`, Kanban en `components/` | `/workspace/:entityId/tasks` |
| `workspace` | `pages/WorkspaceDashboardPage` | `.../dashboard` |
| `documents` | `pages/DocumentsPage` | `.../documents` |
| `ecommerce` | `pages/` (demo, flag) | `/ecommerce/*` |
| `cms` | `pages/SitePagesPage` (flag CMS) | `/seo/pages` |

**Transversales** (sin `pages/` propias): `chat`, `notifications`, `preferences`.

---

## Dominio de cliente (ejemplo)

```
src/features/finanzas/
  pages/FinanzasDashboardPage.tsx
  hooks/ components/

  ingresos/
    pages/ hooks/ components/ types/

  egresos/
    pages/ hooks/ components/
    contratos/
      pages/ContratosPage.tsx
      hooks/useContratos.ts
      components/ types/
```

Workshop y decisiones de negocio: [**client-features-playbook.md**](./client-features-playbook.md).

---

## Fronteras de import

| Permitido | Prohibido |
|-----------|-----------|
| `@/lib`, `@/components/ui`, `@/types` | `features/finanzas` → `features/comercial` (hermanos) |
| Padre → hijo (`egresos` → `contratos`) | Importar layouts o router desde un feature |

---

## Registro de una pantalla nueva

1. Crear `src/features/<dominio>/pages/MiPage.tsx`
2. En `src/app/routes.config.ts`:

```ts
const MiPage = lazy(() => import('@/features/<dominio>/pages/MiPage'));
```

3. `resourceCode` en la misma entrada de ruta + fila en `src/config/security/resources.ts` + `pnpm db:sync`

Checklist completo: [**playbook-new-module.md**](./playbook-new-module.md).
