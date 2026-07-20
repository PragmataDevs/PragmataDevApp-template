# Estructura `src/features/` (ERP)

Mapa de carpetas del pilar operativo. Cada dominio es un **vertical slice** completo.

**Pantallas:** `src/features/<dominio>/pages/` · **URLs:** `src/app/routes.config.ts` · **Modelos:** `src/features/<dominio>/types/` (no en `src/types/` salvo núcleo compartido).

Guías: [**client-features-playbook.md**](./client-features-playbook.md) · [**playbook-new-module.md**](./playbook-new-module.md) · [**architecture.md**](./architecture.md) §2.

---

## Kit obligatorio por dominio (y subfeature) — recursivo

Cada nivel del árbol replica el mismo patrón. No hay límite de profundidad, pero 3-4 niveles es lo práctico.

```
src/features/<dominio>/
├── navigation.ts          ← opcional: rutas + labels del dominio
├── pages/                 ← pantallas (lazy en routes.config.ts)
├── hooks/                 ← hooks compartidos del dominio
├── components/            ← componentes compartidos del dominio
├── types/                 ← modelos canónicos (+ schema Zod si aplica)
│
├── <subfeature>/          ← mismo patrón recursivo
│   ├── pages/
│   ├── hooks/
│   ├── components/
│   ├── types/
│   │
│   └── <sub-subfeature>/  ← mismo patrón (N niveles)
│       ├── components/
│       ├── hooks/
│       └── types/
```

Lo compartido entre subfeatures hermanas sube al `components/` / `hooks/` / `types/` del padre. No se crean carpetas `shared/` o `common/` — la jerarquía misma es el mecanismo de compartición.

Convenciones:

- Carpetas en **minúsculas**. Labels UI en sidebar y `APP_RESOURCES`.
- **`types/`** en cada nivel: una verdad por entidad; par `<entidad>.ts` + `<entidad>.schema.ts` si hay formulario; sin `*DTO` / `*Payload` / `*FormState`. Referencia: **`src/features/clients/`**.
- Solo **`src/types/core/`** queda para `AuditBase` (re-export) y tipos de **router** — ver [`src/types/README.md`](../src/types/README.md).
- Lazy **por página**, no por feature entera.

---

## Ejemplo genérico

```
src/features/proyectos/
├── navigation.ts
├── pages/ProyectosDashboardPage.tsx
├── hooks/useProyectos.ts
├── components/ProyectoCard.tsx
├── types/proyecto.ts
│
├── alcance/
│   ├── pages/AlcancePage.tsx
│   ├── hooks/useAlcance.ts
│   ├── components/AlcanceWizard.tsx
│   ├── types/alcance.ts
│   │
│   └── entregables/
│       ├── components/EntregableTable.tsx
│       ├── components/modal/EntregableFormModal.tsx
│       ├── hooks/useEntregables.ts
│       └── types/entregable.ts
│
├── costos/
│   ├── pages/CostosPage.tsx
│   ├── hooks/useCostos.ts
│   ├── components/CostosChart.tsx
│   └── types/costo.ts
│
└── riesgos/
    └── pages/RiesgosPage.tsx
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
| `clients` | `cliente.ts`, `cliente.schema.ts` | — (referencia Model+Form) | — |
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
