# Base de datos — scripts y migraciones

Scripts de referencia y flujo con Supabase CLI. El schema versionado en producción vive en **`supabase/migrations/`**.

**Setup:** [**SETUP.md**](../SETUP.md) §3 · **Studio local:** [**proceso-supabase-studio-local.md**](../proceso-supabase-studio-local.md).

---

## Scripts en esta carpeta (`docs/database/`)

| Archivo | Uso |
|---------|-----|
| [**01_security_engine.sql**](./01_security_engine.sql) | Motor RBAC, `is_god()`, `check_permission()`, tablas `sys_*` |
| [**02_seed_god_user.sql**](./02_seed_god_user.sql) | Usuario dios (tras crear usuario en Auth; pegar UUID) |
| [**03_powersync_publication.sql**](./03_powersync_publication.sql) | Publicación PowerSync (si `VITE_ENABLE_POWERSYNC=true`) |
| [**04_realtime_publication.sql**](./04_realtime_publication.sql) | Tablas en `supabase_realtime` |
| [**05_cms_pages_ensure_legacy.sql**](./05_cms_pages_ensure_legacy.sql) | Solo bases antiguas sin `cms_pages` |

**Orden típico (local):** migraciones CLI → Auth + `02_seed_god_user.sql` → `pnpm db:sync` → `05` solo si aplica.

---

## Migraciones oficiales (`supabase/migrations/`)

| Archivo | Contenido |
|---------|-----------|
| `20260111120000_pragmata_schema.sql` | Schema principal + RLS + realtime embebido |
| `20260111120001_pragmata_powersync_publication.sql` | Publicación PowerSync |

Aplicar: `supabase db push` (ver SETUP §3).

---

## Reglas al añadir tablas de cliente

1. `public.is_god()` **primero** en toda policy RLS.
2. Patrón `AuditBase` (`status`, `version`, `deleted_at`, …).
3. Tabla nueva en publicación Realtime si usas `useCrudResource` con `realtime: true` (migración incremental, no editar `…20000…` ya aplicada en prod).
4. Recurso RBAC en `src/config/security/resources.ts` + `pnpm db:sync`.

Ver [**playbook-new-module.md**](../playbook-new-module.md) §1 y [**security-god-user-frontend.md**](../security-god-user-frontend.md).
