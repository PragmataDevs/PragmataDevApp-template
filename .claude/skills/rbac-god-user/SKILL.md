---
name: rbac-god-user
description: >-
  El Security Engine de PragmataDevApp: RLS, los roles (anon/authenticated/
  service_role), la función is_god(), y cómo se escribe una policy segura. Úsala
  al tocar seguridad, RLS, permisos, autenticación, el service_role, o al revisar
  que un proyecto no tenga hoyos de seguridad. La Tríada Sagrada: seguridad no se negocia.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# RBAC + God User — el motor de seguridad de PragmataDevs

Arquitectura zero-trust con RLS template-driven. **Cada policy arranca con `is_god()`**; ningún acceso esquiva RLS.

> Detalle vivo en el repo: `.cursor/rules/07-god-user.mdc`, `src/lib/auth/isGodUser.ts`, `docs/security-god-user-frontend.md`, `docs/security-checklist.md`, y el schema `supabase/migrations/20260111120000_pragmata_schema.sql` (tablas `sys_*`, `is_god()`, `check_permission()`).

## 1. El modelo (tablas sys_*)
- **sys_resources** — catálogo de lo controlable (páginas, botones, acciones) por `code`.
- **sys_roles** — plantillas de permiso (`can_be_customized`).
- **sys_role_definitions** — las reglas: rol→recurso→acciones + condiciones (JSONB).
- **sys_entity_access** — scope por fila: liga usuario→entidad (multi-tenant).
- **sys_user_permissions** — caché de permisos efectivos por usuario.

El god user **nunca** aparece en `sys_entity_access`/`sys_user_permissions` — `is_god()` corta antes.

## 2. is_god() — la condición EXACTA (doble, no negociable)

```sql
CREATE OR REPLACE FUNCTION public.is_god() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.teams t ON t.id = p.team_id
    WHERE p.id = auth.uid()
      AND p.access_level = 'god'
      AND t.is_platform_owner = TRUE      -- ← AMBAS condiciones
  );
$$;
```
Espejo TS (`src/lib/auth/isGodUser.ts`):
```typescript
export function isGodUser(profile, teamIsPlatformOwner): boolean {
  if (!profile || profile.access_level !== 'god') return false;
  return teamIsPlatformOwner === true;
}
```
⚠️ Checar solo `access_level === 'god'` sin verificar el team = **bug de seguridad**.

## 3. El patrón de RLS policy (is_god() SIEMPRE primero)

```sql
ALTER TABLE public.proyectos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View Authorized" ON public.entities FOR SELECT USING (
  public.is_god()                                       -- ← primero, corta el OR
  OR id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
  OR public.check_permission('page_settings_entities', 'read')
);
```
Helpers (SECURITY DEFINER, evitan recursión de RLS): `check_permission(resource, action)`, `get_my_team_id()`, `get_my_entity_ids()`.

## 4. Roles de Supabase
- **anon** — público no autenticado (catálogos read-only). Policy explícita.
- **authenticated** — logueados; policies atan a `auth.uid()` + `is_god()`/`check_permission()`.
- **service_role** — **bypassa todo RLS. SOLO server-side** (scripts, Edge Functions). NUNCA en `.env` del front. Pásalo inline: `SUPABASE_SERVICE_ROLE_KEY=… pnpm db:sync`.

## 5. Front: espeja la regla SQL
`AuthProvider` carga `profiles` + `team:teams(is_platform_owner)`. `useAuth()` expone `isGod`. `usePermission()` → `if (isGod) return true;` antes de checar resourceCode. `isAdmin()` = `isGod || access_level==='admin'`.
```typescript
// ❌ if (profile?.access_level === 'god') return true;
// ✅ const { isGod } = useAuth(); if (isGod) return true;
```

## Reglas de oro 🔒
1. `is_god()` **primero** en cada policy; doble condición (god + platform_owner) siempre.
2. `bypassrls` **prohibido** en apps. Toda tabla con RLS habilitado.
3. `service_role` jamás en `.env` del front ni en repo; solo inline/server-side.
4. God user se siembra con `docs/database/02_seed_god_user.sql` (privado por cliente), no a mano.
5. El front espeja EXACTO la condición SQL (vía `useAuth().isGod`, no `access_level` pelón).
6. Antes de prod: corre el `docs/security-checklist.md` punto por punto.
7. **Módulo Agente Operativo (ver `docs/architecture.md` §1.3.1):** ningún handler de `defineAction()`/`runAction()` recibe cliente `service_role`. `ctx.db` se construye SOLO del JWT real del caller (patrón `create-auth-user/index.ts`); si una action necesita privilegio se declara `privileged: true` explícito, nunca implícito. Acciones `sideEffect: 'destructive'` piden confirmación humana SIEMPRE, sin excepción de `is_god()` — decisión de producto, no default técnico.
