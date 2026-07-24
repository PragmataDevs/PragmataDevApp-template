---
name: nuevo-modulo
description: >-
  El playbook de 10 pasos para agregar un módulo/dominio nuevo a una app
  PragmataDevApp (SQL → modelo+Zod → hook → páginas → ruta → RBAC → sidebar → sync).
  Úsala al construir una feature nueva, un CRUD, o cuando preguntes "¿cómo agrego X?".
  Garantiza que el módulo siga la Tríada y el patrón del template.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Nuevo módulo — receta de 10 pasos

El orden importa. Sáltate un paso y la feature queda coja (404, sin permisos, sin realtime).

> Fuente viva: `docs/playbook-new-module.md`. Ejemplos reales: `src/features/clients/` (modelo+form), `src/features/tasks/` (subfeatures). Hook: `src/lib/hooks/useCrudResource.ts` (+ `.cursor/rules/05-secure-hooks.mdc`).

## Paso 0 — Diseño
Define scope (¿por `entity_id`/workspace o team-global?), soft-delete (AuditBase), y las gates RLS (`is_god() OR …` + filtro por entidad). Ver skill `auditbase-occ` y `rbac-god-user`.

## Paso 1 — Migración SQL
Tabla en `supabase/migrations/YYYYMMDDHHMMSS_*.sql` con **todas las columnas AuditBase** + trigger `set_updated_at` + `ENABLE ROW LEVEL SECURITY` + policy (`is_god()` primero) + índices. Si necesita realtime, agrégala a la publicación (`docs/database/04_realtime_publication.sql`). Aplica: `supabase db push` (remoto) o Studio local. → skill `migraciones-supabase`.

## Paso 2 — Modelo + Zod
En `src/features/<modulo>/types/`: `<entidad>.ts` (interface extends AuditBase, `*Input` con `Pick`, `createEmpty*()`) y `<entidad>.schema.ts` (Zod + `*FormValues = z.output<...>`). Sin DTOs.

## Paso 3 — Hook
Prefiere `useCrudResource` (da `{ data, loading, error, upsert, softDelete, refetch }` con OCC + soft-delete + session retry + realtime):
```typescript
export function useProyectos(entityId?: string) {
  return useCrudResource<Proyecto>({
    table: 'proyectos', select: '*',
    filter: (q) => q.eq('entity_id', entityId!).eq('status', 'active'),
    orderBy: { column: 'nombre', ascending: true },
    realtime: true, enabled: !!entityId,
  });
}
```
Custom solo si hay lógica multi-tabla (Kanban, saga) — entonces usa `withSessionRetry` + `sessionEpoch` en deps.

## Paso 4 — Estructura de carpeta
`src/features/<modulo>/` con `types/ hooks/ components/ pages/` (+ subfeature recursivo si aplica). La lógica vive en hooks; las páginas solo componen. → skill `feature-based-arch`.

## Paso 5 — Páginas y componentes
Páginas en `src/features/<modulo>/pages/` (NUNCA `src/pages/`). Listas tabulares: **siempre `DataTable`** (CSV export incluido) salvo Kanban/calendario/print con aprobación. Forms: `zodResolver` + schema; números `setValueAs: v => Number(v)`.

## Paso 6 — Ruta
En `src/app/routes.config.ts`, `lazy()` import + objeto con `path, name, icon, element, layout, resourceCode`. Feature flag: `...(VITE_ENABLE_X ? [{...}] : [])`.

## Paso 7 — RBAC resource
En `src/config/security/resources.ts`, agrega al array `APP_RESOURCES`: `{ code: 'page_workspace_x', name, category, type:'page', default_actions:['read','create','update','delete'] }`. Naming: `page_workspace_*` (entidad) o `page_settings_*` (global).

## Paso 8 — Sidebar
Entrada en `src/components/layout/Sidebar.tsx` con el mismo `resourceCode`. `RouteGuard` usa `hasPermission()` para mostrar/proteger.

## Paso 9 — Sync RBAC a la DB
```bash
SUPABASE_SERVICE_ROLE_KEY=<key> pnpm db:sync
```
Sincroniza `APP_RESOURCES` → tabla `sys_resources`. **Sin esto, el usuario ve 404 aunque tenga permiso.**

## Paso 10 — Checklist de cierre
- [ ] Probado con usuario **member** (con `sys_entity_access`) y con **god**.
- [ ] Sin DTOs/FormState duplicados — un modelo por concepto.
- [ ] Listas con `DataTable`.
- [ ] Realtime: tabla en la publicación si `realtime: true`.
- [ ] Módulo opcional → mención en `.env.example`.
→ Para sacar a prod: skill `cierre-a-produccion`.

## Trampas comunes ⚠️
- Escribir CRUD custom en vez de `useCrudResource` (duplica session retry/realtime).
- Páginas en `src/pages/` (pierden el layout workspace y `:entityId`).
- Olvidar `pnpm db:sync` (404 con permiso).
- **Realtime viene ON por default** (`realtime = true` en el hook): si NO metés la tabla en la publicación (`docs/database/04_realtime_publication.sql`), no refresca. Si la tabla no está publicada, apágalo con `realtime: false`.
- Filtrar en el componente en vez de en `filter:` del hook.
