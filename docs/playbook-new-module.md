# Playbook: nuevo módulo ERP (10 pasos)

Guía única para añadir una feature de negocio al **pilar operativo** sin romper el ADN Pragmata.  
Antecedentes: reglas en `.cursor/rules/`, detalle en `docs/architecture.md` y setup en `docs/SETUP.md`.

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

- Preferir **`useCrudResource`** (`src/lib/hooks/useCrudResource.ts`) con `table`, `filter` por `entity_id` si aplica, `realtime` opcional.
- Si hay varias tablas o lógica no CRUD (ej. Kanban), hook dedicado en `src/features/<modulo>/hooks/` usando **`withSessionRetry`** + **`sessionEpoch`** (`docs` rule `05-secure-hooks.mdc`).

---

## 4. Feature folder

```
src/features/<modulo>/
  hooks/
  components/    # opcional — modales, sub-vistas
```

Mantén la lógica de negocio aquí; las páginas solo componen.

---

## 5. Página(s)

- `src/pages/...` — suele ser `workspace/` si depende de `:entityId`, o `settings/` / `ecommerce/` según el caso.
- UI: `DataTable`, `Button`, tokens `--pragmata-*`, bordes `rounded-pragmata`.

---

## 6. Rutas

- `src/app/routes.config.ts`: registra `path`, `layout`, `resourceCode`, `group` (`settings` | sidebar global | `workspace` | `ecommerce`).
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
- [ ] Si el módulo es opcional para algunos clientes: `.env.example` + mención en `docs/architecture.md` o SETUP.

---

### Referencias rápidas

| Necesitas… | Ver |
|------------|-----|
| Migraciones CLI | `docs/SETUP.md` §3 |
| Navegación / Workspace | `.cursor/rules/06-navigation-layout.mdc` |
| Hooks + sesión | `.cursor/rules/05-secure-hooks.mdc` |
| UI tabla | `.cursor/rules/02-ui-components.mdc` |
| Publicación PowerSync | `docs/database/03_powersync_publication.sql`, `docs/powersync/sync-rules.yaml` |

**Sitemap / robots (sitio público):** ya generados en runtime (`/sitemap.xml`, `/robots.txt` en Astro). Al añadir páginas indexables, extiende `astro/src/pages/sitemap.xml.ts` si deben aparecer en el índice.

**SEO en catálogo:** tras aplicar `docs/database/08c_products_seo.sql`, los productos tienen `seo_title`, `seo_description` y `seo_image_url` editables en **ERP → Ecommerce → Productos**; Astro `/productos/[slug]` los usa con fallback al nombre/descripción/imagen principal.
