# Playbook: nuevo módulo ERP (10 pasos)

Checklist **técnico** para implementar un módulo en el pilar operativo sin romper el ADN Pragmata.

| Si necesitas… | Lee |
|---------------|-----|
| Workshop con el cliente, dominios, subfeatures, qué va en `src/features/` | [**client-features-playbook.md**](./client-features-playbook.md) |
| Este checklist (SQL → hook → page → RBAC) | Este documento |
| Índice de toda la doc | [**README.md**](./README.md) |

Antecedentes: `.cursor/rules/`, **`docs/architecture.md`** §2, **`docs/SETUP.md`**.

> Las pantallas van en **`src/features/<modulo>/pages/`** (no en `src/pages/`). El lazy load se declara en **`src/app/routes.config.ts`**.

---

## 0. Antes de tocar código

- **Ámbito:** ¿Es por `entity_id` (workspace) o global a todo el equipo?
- **Soft delete:** Toda tabla de negocio extiende el patrón `AuditBase` en Postgres y en `src/types` (sin `DELETE` duro desde la app salvo casos excepcionales).
- **God user:** Toda policy RLS empieza con `public.is_god() OR …`.
- **Acceso workspace:** Si el dato es por entity, filtra por `entity_id` y asegura que solo usuarios con fila en `sys_entity_access` (o admin/god) puedan ver filas ajenas — coherente con cómo el usuario elige entity en el header.

---

## 1. Migración SQL

1. Añade script en `docs/database/` **o** migración versionada en `supabase/migrations/` y `supabase db push` (flujo industrial → `docs/SETUP.md` §3).
2. Tabla(s) con columnas de auditoría alineadas al Manifiesto (`status`, `version`, `deleted_at`, …).
3. RLS + índices; triggers `set_updated_at` si ya los usa el resto del schema.

---

## 2. Modelo TypeScript canónico

- Un archivo en `src/types/<dominio>/<entidad>.ts`.
- `export interface MiEntidad extends AuditBase { … }` (u omitir campos que la tabla no tenga, pero sin inventar DTOs paralelos).

---

## 3. Hook de datos

- Preferir **`useCrudResource`** (`src/lib/hooks/useCrudResource.ts`) con `table`, `filter` por `entity_id` si aplica; **`realtime` viene `true` por defecto** (requiere la tabla en `supabase_realtime` — ver migración `04_realtime_publication.sql`).
- Al crear una **tabla nueva** en SQL: añádela al ARRAY Realtime en `20260111120000_pragmata_schema.sql` (§10), `docs/database/04_realtime_publication.sql`, y en una **migración incremental** nueva (no edites `…20000…` ya aplicada en prod).
- Detalle de plantilla (por qué **`AuditRecord`** sin índice string, **`filter`** con cadena PostgREST laxamente tipada, **`upsert`** y `as unknown as T`): **`docs/architecture.md`** → *Hook genérico `useCrudResource`*.
- Si hay varias tablas o lógica no CRUD (ej. Kanban), hook dedicado en `src/features/<modulo>/hooks/` usando **`withSessionRetry`** + **`sessionEpoch`** (`docs` rule `05-secure-hooks.mdc`).

---

## 4. Feature folder

```
src/features/<modulo>/
  pages/         # pantallas del módulo (lazy en routes.config.ts)
  hooks/
  components/    # opcional — modales, sub-vistas
  providers/     # opcional
  types/         # opcional — ver docs/client-features-playbook.md §5
  <subfeature>/  # mismo kit si el negocio tiene hijos (ej. finanzas/egresos/contratos)
```

Mantén la lógica de negocio en `hooks/`; las páginas solo componen.  
**Guía de dominios de cliente:** `docs/client-features-playbook.md` · mapa de carpetas: `docs/erp-features-structure.md`.

---

## 5. Página(s)

- `src/features/<modulo>/pages/...` — workspace si depende de `:entityId`; global si es settings o dominio de equipo.
- UI: `Button`, tokens `--pragmata-*`, bordes `rounded-pragmata`.
- **Listados tabulares:** obligatorio **`DataTable`** (`@/components/ui/DataTable`). No montar `<table>` manual en páginas. Solo puedes usar otro patrón si el product owner lo indica **explícitamente** (Kanban, calendario, grid tipo spreadsheet, HTML solo para impresión/PDF). Ver `.cursor/rules/02-ui-components.mdc`. Genérico **`T extends object`** y CSV: **`docs/architecture.md`** §13.7 (*Listas tabulares*).
- CSV masivo: prop opcional **`csv`**. Mínimo **`filename`** + **`fields`** para export / plantilla; **`onImport`** solo donde el dominio lo permita (ej. catálogo). *Por defecto en esta plantilla, usuarios / roles / entidades son solo export — sin carga CSV hasta que se defina.*
- **Formularios + Zod:** schema alineado al modelo (campos editables = mismos nombres que en `src/types` y columnas expuestas); números desde el DOM con **`setValueAs`**, no **`z.coerce`** si rompe el tipado del resolver; tipo del formulario validado → **`z.output<typeof schema>`** cuando aplique. Detalle y ejemplo: **`docs/architecture.md`** (§ modelo canónico → *Validación con Zod + react-hook-form*) y **`src/features/ecommerce/pages/ProductsPage.tsx`**.

---

## 6. Rutas

- `src/app/routes.config.ts`: registra `path`, `layout`, `resourceCode`, `group` (`settings` | sidebar global | `workspace` | `ecommerce`).
- Lazy import desde la feature, por página:

```ts
const MiPage = lazy(() => import('@/features/<modulo>/pages/MiPage'));
// Subfeature anidada:
const ContratosPage = lazy(() =>
  import('@/features/finanzas/egresos/contratos/pages/ContratosPage'),
);
```

- Feature flag: constante `import.meta.env.VITE_ENABLE_*` y rama condicional del árbol de rutas (patrón ecommerce / IA).

---

## 7. RBAC

- `src/config/security/resources.ts`: nuevo código `page_*` o `page_workspace_*`.
- Tras deploy SQL que inserte en `sys_resources`, ejecutar **`pnpm db:sync`** (o equivalente documentado en SETUP §9) para que exista el recurso en BD.

---

## 8. Sidebar

- `src/components/layout/Sidebar.tsx`: entrada con mismo `resourceCode` que la ruta para que `RouteGuard` y menú coincidan.

---

## 9. Storage / Edge Functions (solo si aplica)

- Archivos privados: bucket + RLS de Storage; la app usa helpers en `src/lib/storage`.
- LLMs / pagos / secretos: **solo** Edge Functions (`supabase/functions/`), nunca API keys en el cliente.

---

## 10. Cierre

- [ ] Flujo probado con usuario **member** (permisos + `sys_entity_access`).
- [ ] Usuario **god** ve todo sin depender de filas extra.
- [ ] Sin nuevos `*DTO` / tipos duplicados del mismo concepto.
- [ ] Listados tabulares usan **`DataTable`** (salvo excepción acordada por escrito).
- [ ] Si el módulo es opcional para algunos clientes: `.env.example` + mención en `docs/architecture.md` o SETUP.

---

### Referencias rápidas

| Necesitas… | Ver |
|------------|-----|
| Migraciones CLI | `docs/SETUP.md` §3 |
| Navegación / Workspace | `.cursor/rules/06-navigation-layout.mdc` |
| Hooks + sesión | `.cursor/rules/05-secure-hooks.mdc` |
| UI tabla | `.cursor/rules/02-ui-components.mdc` |
| Formulario + Zod + RHF | `docs/architecture.md` (validación Zod), `src/features/ecommerce/pages/ProductsPage.tsx` |
| Features de cliente (workshop, subfeatures) | `docs/client-features-playbook.md` |
| Mapa carpetas `src/features/` | `docs/erp-features-structure.md` |
| Índice toda la documentación | `docs/README.md` |
| `useCrudResource` (AuditRecord, filter, upsert) | `docs/architecture.md` → *Hook genérico useCrudResource* |
| `DataTable` genérico + CSV | `docs/architecture.md` §13.7 |
| Publicación PowerSync | `docs/database/03_powersync_publication.sql`, `docs/powersync/sync-rules.yaml` |

**Sitemap / robots (sitio público):** ya generados en runtime (`/sitemap.xml`, `/robots.txt` en Astro). Al añadir páginas indexables, extiende `astro/src/pages/sitemap.xml.ts` si deben aparecer en el índice.

**SEO en catálogo:** el baseline (`01_security_engine.sql`) ya define `seo_title`, `seo_description` y `seo_image_url` en `products`; el ERP **Ecommerce → Productos** y Astro `/productos/[slug]` usan fallback al nombre/descripción/imagen principal si van NULL.
