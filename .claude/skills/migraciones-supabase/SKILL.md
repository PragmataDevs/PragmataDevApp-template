---
name: migraciones-supabase
description: >-
  El workflow de migraciones SQL de PragmataDevApp con Supabase CLI: naming,
  comandos (start/migration up/db push), idempotencia, RLS, y la regla de reversa.
  Úsala al crear/aplicar migraciones, cambiar el esquema, levantar Supabase local,
  o sembrar el god user. Toda tabla nueva sigue AuditBase + RLS.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Migraciones Supabase — el workflow de esquema de PragmataDevs

> Fuente viva: `docs/SETUP.md` §3, `docs/proceso-supabase-studio-local.md`, `.cursor/rules/01-data-model.mdc`, `supabase/config.toml`, y `docs/database/*.sql`.

## 1. Naming y ubicación
- Migraciones CLI: `supabase/migrations/YYYYMMDDHHMMSS_<descripcion>.sql` (timestamp UTC). **Se corren UNA vez; nunca edites una ya pusheada.**
- Scripts de referencia idempotentes: `docs/database/*.sql` (baseline `01_security_engine.sql`, god user `02_seed_god_user.sql`, realtime `04_realtime_publication.sql`).

## 2. Comandos (workflow)
```bash
supabase start              # levanta Postgres+Auth+API(:54321)+Studio(:54323); aplica migraciones
supabase status             # URLs + anon key
supabase migration up       # aplica pendientes sin reiniciar Docker
supabase login && supabase link --project-ref <ref>
supabase db push            # aplica pendientes al proyecto remoto
supabase migration list     # verifica estado
```
Puertos local: **54321** API (`VITE_SUPABASE_URL`), **54322** Postgres, **54323** Studio, **54324** Mailpit.

## 3. ⚠️ Reversa — tensión que debes conocer
La regla de PragmataDevs (CLAUDE.md) dice: *"ningún cambio de esquema sin su `down.sql`"*. **Pero Supabase CLI es forward-only** — no usa `down.sql`. Cómo se reconcilia en la práctica:
- Las migraciones se diseñan **deployables una vez**. Si una falla, `db push` para sin estado parcial.
- Para **deshacer** algo: escribe una **migración NUEVA** (timestamp nuevo) que lo revierte (`DROP`, restaurar de backup). **Nunca edites la migración original.**
- **Documenta la intención de undo** en el commit o en comentario SQL.
> Si Wicho quiere reversibilidad estricta tipo Flyway, es una decisión de proceso a tomar (actualizar la regla del CLAUDE.md o adoptar otra herramienta). Por ahora: forward-only + migración correctiva + documentar.

## 4. Idempotencia
En `docs/database/*.sql` (que se pegan a mano, posiblemente más de una vez): usa `CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `DROP ... IF EXISTS`. Las de `supabase/migrations/` corren una vez (Supabase trackea), pero sé defensivo si pueden re-correrse en dev.

## 5. Toda tabla nueva (no negociable)
```sql
CREATE TABLE public.proyectos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  -- ...columnas de negocio...
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE public.proyectos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_proyectos_set_updated_at BEFORE UPDATE ON public.proyectos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "select" ON public.proyectos FOR SELECT USING (
  public.is_god() OR entity_id IN (SELECT entity_id FROM public.sys_entity_access WHERE user_id = auth.uid())
);
CREATE INDEX idx_proyectos_entity_id ON public.proyectos(entity_id);
```
→ columnas AuditBase: skill `auditbase-occ`. RLS: skill `rbac-god-user`.

## 6. Supabase local + god user
1. `supabase start` → Studio en `:54323`.
2. Studio → Auth → Add user (email+pass), copia el UUID.
3. Corre `docs/database/02_seed_god_user.sql` con ese UUID (crea `profiles` + `teams` con `is_platform_owner=true`).
4. Login en el ERP → `is_god()` true → sin bloqueos RBAC.

## Reglas de oro 🔒
1. `YYYYMMDDHHMMSS_*.sql`; nunca edites una migración ya aplicada — corrige con una nueva.
2. Forward-only: para deshacer, migración nueva que revierte + documenta el undo.
3. Idempotencia en los scripts de `docs/database/`.
4. Toda tabla: columnas AuditBase + trigger `set_updated_at` + RLS habilitado con `is_god()` primero.
5. `db push` (remoto) / `migration up` (local). `service_role` solo inline, nunca en repo.
