# Estructura `src/features/` (ERP)

Mapa de carpetas del pilar operativo. Cada dominio es un **vertical slice** completo.

**Pantallas:** `src/features/<dominio>/pages/` · **URLs:** `src/app/routes.config.ts` · **Modelos:** `src/features/<dominio>/types/` (no en `src/types/` salvo núcleo compartido).

Guías: [**client-features-playbook.md**](./client-features-playbook.md) · [**playbook-new-module.md**](./playbook-new-module.md) · [**architecture.md**](./architecture.md) §2.

---

## Kit obligatorio por dominio (y subfeature)

```
src/features/<dominio>/
  navigation.ts          ← opcional: rutas + labels del dominio (merge en routes.config)
  pages/                 ← pantallas (lazy en routes.config.ts)
  hooks/
  components/
  types/                 ← modelos canónicos de ESTE dominio (+ schema Zod si aplica)

  <subfeature>/          ← mismo kit (ej. finanzas/egresos/contratos/)
    pages/
    hooks/
    components/
    types/
```

Convenciones:

- Carpetas en **minúsculas** (`finanzas`). Labels UI en sidebar y `APP_RESOURCES`.
- **`types/`** en cada nivel: una verdad por entidad; sin `*DTO` / `*Payload` paralelos.
- Solo **`src/types/core/`** queda para `AuditBase` (re-export) y tipos de **router** — ver [`src/types/README.md`](../src/types/README.md).
- Lazy **por página**, no por carpeta `finanzas` entera.

---

## Ejemplo cliente: Finanzas

```
src/features/finanzas/
  navigation.ts
  pages/FinanzasDashboardPage.tsx
  hooks/
  components/
  types/                 ← tipos transversales del dominio (si aplica)

  ingresos/
    pages/
    hooks/
    components/
    types/

  egresos/
    pages/
    hooks/
    components/
    types/
    contratos/
      pages/ContratosPage.tsx
      hooks/useContratos.ts
      components/
      types/contrato.ts
```

---

## Chasis de la template

| Feature | `types/` | `pages/` | Rutas (ej.) |
|---------|----------|----------|-------------|
| `shell` | — | `PublicSiteEntry` | `/` |
| `auth` | `rbac.ts` | login, callback, reset | `/login`, `/auth/*` |
| `dashboard` | — | `DashboardPage` | `/dashboard` |
| `profile` | — | `ProfilePage` | `/profile` |
| `roles` | `role.ts`, `role.schema.ts` | `RolesPage` | `/settings/roles` |
| `users` | `profile.ts`, `profile.schema.ts` | usuarios | `/settings/usuarios` |
| `entities` | `entity.ts`, `entity.schema.ts` | entidades | `/settings/entities` |
| `tasks` | `task.ts`, `task.schema.ts` | Kanban | `.../tasks` |
| `workspace` | — | dashboard entity | `.../dashboard` |
| `documents` | `document.ts` | archivos | `.../documents` |
| `products` | `product.ts` | — (páginas en `ecommerce`) | — |
| `ecommerce` | `order.ts` | resumen, productos, ventas | `/ecommerce/*` |
| `cms` | `cms-page.ts` | SEO páginas | `/seo/pages` |

Transversales sin `pages/`: `chat`, `notifications`, `preferences`.

---

## Imports

| Permitido | Evitar |
|-----------|--------|
| `@/types/core/base` (`AuditBase`) | Modelos de negocio en `src/types/<dominio>/` (legacy) |
| `@/features/<dominio>/types/...` | Import horizontal entre dominios hermanos sin necesidad |
| `@/lib`, `@/components/ui` | |
| Hijo → padre (`contratos` → `egresos`) | |

**Chasis cruzado:** p. ej. `users` puede importar `ENTITY_LABEL` desde `@/features/entities/types/entity` (constantes de UI del dominio entity).

---

## Registrar pantalla + tipo nuevo

1. `src/features/<dominio>/types/<entidad>.ts` — `extends AuditBase`, `createEmpty*` en el mismo archivo.
2. `hooks/` — `useCrudResource` o custom.
3. `pages/<NombrePage>.tsx` — compone hook + `DataTable`.
4. `routes.config.ts` — `lazy(() => import('@/features/.../pages/...'))`.
5. `resources.ts` + `pnpm db:sync`.

Checklist: [**playbook-new-module.md**](./playbook-new-module.md).
