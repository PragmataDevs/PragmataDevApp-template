# Checklist de seguridad — plantilla Pragmata

Referencia rápida para copias nuevas y revisión antes de producción.

## Cliente (ERP / Astro)

| Tema | Estado en plantilla |
|------|---------------------|
| Claves en frontend | Solo `VITE_SUPABASE_ANON_KEY` (publishable). **Nunca** `service_role` en `.env` del ERP ni en Astro. |
| Service role | Solo scripts locales (`pnpm db:sync`) o Edge Functions en servidor. Pasar inline: `SUPABASE_SERVICE_ROLE_KEY=… pnpm db:sync`. |
| RLS | Todas las tablas de negocio con RLS; `public.is_god()` **primero** en cada policy. |
| God user | `access_level = 'god'` + `teams.is_platform_owner = TRUE`; ver [07-god-user](../.cursor/rules/07-god-user.mdc). |
| Auth redirects | `supabase/config.toml` → `site_url` y `additional_redirect_urls` del ERP (`:7070`). |
| Plantillas email | `supabase/templates/recovery.html` + `invite.html`; local: Mailpit. Ver [auth-email-templates-local.md](./auth-email-templates-local.md). |

## Edge Functions

| Función | `verify_jwt` | Notas |
|---------|--------------|--------|
| `create-auth-user` | `false` en gateway | Valida JWT **dentro** del handler + `check_permission('page_settings_usuarios','create')`. Service role solo en servidor. |
| `stripe-webhook` | `false` | Firma Stripe (`STRIPE_WEBHOOK_SECRET`). |
| `ai-gateway`, `ai-task-summary`, `stripe-checkout` | `true` (default) | Requieren sesión de usuario. |

**CORS:** las funciones usan `*` en desarrollo. En producción restringe orígenes en `_shared/cors.ts` si el cliente lo exige.

## Qué no commitear

- `.env` con claves reales
- `SUPABASE_SERVICE_ROLE_KEY` en archivos del repo
- Contraseñas de seed en scripts públicos (usar `02_seed_god_user.sql` solo local / privado por cliente)

## Tras clonar (copia nueva)

1. `supabase start` → 2 migraciones (`…20000…` + `…20001…` si PowerSync)
2. Usuario Auth + `02_seed_god_user.sql`
3. `pnpm db:sync` (recursos RBAC, incl. `page_seo_site_pages`)
4. `supabase functions deploy` + secrets en Dashboard
5. Revisar `.env.example` → `.env` sin secretos de producción en local
