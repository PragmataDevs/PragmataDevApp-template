# Supabase nube — bootstrap automatizado

Guía canónica para pasar de **Supabase local** (`supabase start`) a **Supabase cloud** (proyecto en supabase.com). Este flujo viene de fábrica en el template — cualquier cliente nuevo lo tiene desde el día uno.

**Relacionado:** [SETUP.md](./SETUP.md), [deployment-environments.md](./deployment-environments.md).

---

## Qué automatiza `pnpm cloud:bootstrap`

| Paso | Qué hace |
|------|----------|
| 1. Link | `supabase link --project-ref` |
| 2. Schema | `supabase db push` — migraciones |
| 3. Post-SQL | `docs/database/06_cloud_post_bootstrap.sql.tpl` con **tu** project ref (vacío por defecto, extensible por cliente) |
| 4. Secrets | `supabase secrets set` — integraciones definidas en el manifiesto |
| 5. Functions | Deploy según `scripts/supabase-cloud-manifest.ts` |
| 6. RBAC | `pnpm db:sync` — catálogo `sys_resources` |
| 7. God user | Auth user + team/role/profile (`scripts/cloud/seed-god-user.ts`) |
| 8. Auth URLs | Management API — Site URL + redirect URLs |
| 9. Storage | Bucket `documents` si no existe |
| 10. Datos *(opcional, ⚠️ destructivo)* | `--sync-data-from-local` — dump local → import nube |
| 11. Vercel *(opcional)* | `--with-vercel` — env Production ERP + Astro |

**Sigue siendo manual** (una vez por proyecto):

- Crear el proyecto en [dashboard](https://supabase.com/dashboard)
- `supabase login` (abre navegador)
- `vercel login` + `vercel link` en ERP y Astro (solo si usas `--with-vercel`)

**Prompts interactivos** (mismo patrón que `SUPABASE_SERVICE_ROLE_KEY=... pnpm db:sync`):

No hace falta rellenar todo `.env.cloud` de antemano. Si falta un valor y hay TTY, el script lo pide al arrancar:

- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ACCESS_TOKEN` (Auth URLs)
- `GOD_USER_EMAIL` / `GOD_USER_PASSWORD`
- `CLOUD_ERP_URL` (Auth + Vercel)

---

## ⚠️ `--sync-data-from-local` es DESTRUCTIVO — leer antes de usar

`--sync-data-from-local` (módulo `scripts/cloud/sync-data-local.ts`) hace **`TRUNCATE`** de catálogos en la nube e **importa** los datos del `public` local sobre el proyecto de la nube. Viene **apagado por default** (`skipDataSync: true`).

- Úsalo **solo** en proyectos que **todavía NO tienen datos reales de producción** (ej. recién creado, en discovery/demo).
- **Nunca** lo corras contra un cliente que ya está usando su app en vivo — le borrarías su información real.
- Antes de correrlo, confirma explícito con el dueño del proyecto que la nube no tiene nada que perder.
- El script imprime una advertencia en consola cuando detecta el flag; no la ignores.

Si el cliente ya tiene datos reales en la nube, la sincronización va **al revés** (nube → local para desarrollar), nunca local → nube.

---

## Requisitos previos

1. **Proyecto Supabase** creado en [dashboard](https://supabase.com/dashboard).
2. **Supabase CLI** instalada y autenticada:

   ```bash
   supabase login
   ```

3. **Project ref** — Dashboard → Settings → General → Reference ID
   (es el subdominio de `https://<ref>.supabase.co`).

4. **`.env.cloud`** (opcional pero recomendado para integraciones):

   ```bash
   cp .env.cloud.example .env.cloud
   ```

   Mínimo en archivo o pegado en terminal al correr:

   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (**nunca** en Vercel)
   - `SUPABASE_ACCESS_TOKEN` — [Account → Access Tokens](https://supabase.com/dashboard/account/tokens)
   - `GOD_USER_EMAIL` / `GOD_USER_PASSWORD`
   - `CLOUD_ERP_URL` — ej. `https://app.tudominio.com`

   `VITE_SUPABASE_URL` se infiere de `--project-ref` si no está definida.

---

## Uso rápido

```bash
# 1. Login CLI (una vez)
supabase login

# 2. Bootstrap completo — pega service_role, access token, god user cuando pregunte
pnpm cloud:bootstrap -- --project-ref <tu_project_ref> --yes

# 3. Con AI y/o ecommerce (según feature flags que use el cliente)
pnpm cloud:bootstrap -- --project-ref <ref> --yes --with-ai --with-ecommerce

# 4. Opcional: subir env a Vercel (Production)
pnpm cloud:bootstrap -- --project-ref <ref> --yes --with-vercel
```

Sin `.env.cloud`: el script pide credenciales en terminal (igual que `db:sync`).

### Dry-run (ver pasos sin ejecutar)

```bash
pnpm cloud:bootstrap -- --project-ref <ref> --dry-run
```

### Solo re-desplegar Edge Functions

```bash
pnpm cloud:deploy-functions -- --yes
```

---

## Opciones CLI

| Flag | Efecto |
|------|--------|
| `--project-ref <ref>` | Enlaza si hace falta |
| `--env-file <path>` | Default `.env.cloud` |
| `--dry-run` | Imprime comandos |
| `--yes` | Sin advertencias |
| `--skip-link` | No `supabase link` |
| `--skip-push` | No `db push` |
| `--skip-post-sql` | No aplica `06_cloud_post_bootstrap.sql.tpl` |
| `--skip-secrets` | No subir secrets |
| `--skip-functions` | No deploy functions |
| `--skip-sync` | No `db:sync` |
| `--skip-god-user` | No crear usuario god |
| `--skip-auth-config` | No PATCH Auth URLs (Management API) |
| `--skip-storage` | No crear bucket `documents` |
| `⚠️ --sync-data-from-local` | Dump `public` local → import nube (**destructivo**, ver sección arriba) |
| `--skip-data-sync` | No copiar datos (default) |
| `--with-vercel` | `vercel env add` Production en ERP + Astro |
| `--skip-vercel` | No tocar Vercel aunque pases `--with-vercel` |
| `--with-ai` | Incluye `ai-gateway`, `ai-task-summary` (si `VITE_ENABLE_AI`) |
| `--with-ecommerce` | Incluye `stripe-checkout`, `stripe-webhook` (si `VITE_ENABLE_ECOMMERCE`) |

---

## Manifiesto (personalizar por cliente)

Editar **`scripts/supabase-cloud-manifest.ts`**:

- `EDGE_FUNCTIONS_CORE` — siempre (`create-auth-user`)
- `EDGE_FUNCTIONS_OPTIONAL` — grupos por feature flag (`ai`, `ecommerce`, y los que agregues)
- `EDGE_SECRETS_INTEGRATIONS` — claves para `.env.cloud` / `supabase secrets set`
- `DATA_SYNC_EXCLUDE_TABLES` / `DATA_SYNC_CLEAR_CATALOG_TABLES` — solo relevantes si usas `--sync-data-from-local`

Para agregar Edge Functions propias de un cliente: si son siempre necesarias van a `EDGE_FUNCTIONS_CORE`; si dependen de un flag, crea un grupo nuevo en `EDGE_FUNCTIONS_OPTIONAL` + su propio `--with-<algo>` en `supabase-cloud-bootstrap.ts` (`parseArgs`, `resolveEdgeFunctions`, `printHelp`).

Tras cambiar el manifiesto: `pnpm cloud:deploy-functions -- --yes`.

---

## Post-bootstrap SQL (opcional, extensible por cliente)

El template base **no necesita** SQL post-deploy — `docs/database/06_cloud_post_bootstrap.sql.tpl` viene vacío (`BEGIN; COMMIT;`). El bootstrap siempre lo aplica en el paso 3 salvo `--skip-post-sql`; con el archivo vacío es un no-op seguro.

Si tu cliente necesita algo post-deploy (ej. `pg_cron` llamando una Edge Function propia, secretos internos leídos por funciones SQL), edita ese `.tpl` — el archivo trae la receta comentada y los placeholders disponibles (`__PROJECT_REF__`, `__ANON_KEY__`). El script solo exige `VITE_SUPABASE_ANON_KEY` en `.env.cloud` si el `.tpl` realmente usa `__ANON_KEY__`.

---

## Checklist manual (solo si omitiste pasos)

| Si usaste… | Ya no hace falta |
|------------|------------------|
| Bootstrap sin `--skip-god-user` | Crear usuario + `docs/database/02_seed_god_user.sql` |
| Bootstrap sin `--skip-auth-config` + token | Auth → Site URL / Redirects |
| Bootstrap sin `--skip-storage` | Bucket `documents` |
| `--with-vercel` | Variables Production en Vercel |
| `--sync-data-from-local` | Re-import CSV manual |

**Siempre revisar en Dashboard:**

- [ ] **Edge Functions** → `supabase functions list` (todas `active`)
- [ ] **Authentication → Users** → god user existe (si el script lo creó)

**Importante:** al cambiar de local a nube, **cierra sesión** en el ERP o limpia `localStorage` — los JWT locales no valen en cloud.

Vercel manual: [deployment-environments.md](./deployment-environments.md).

---

## Migrar datos (local → nube)

### A — Automático (⚠️ destructivo, solo sin datos reales en nube)

Requiere `supabase start` corriendo. Excluye tablas de sistema/RBAC/god (`DATA_SYNC_EXCLUDE_TABLES` en el manifiesto).

```bash
pnpm cloud:bootstrap -- --project-ref <ref> --yes --sync-data-from-local
```

El god user se crea **antes** del sync (orden correcto en el script).

### B — Dump manual (revisando FKs a mano)

```bash
supabase db dump --local --data-only -f local_data.sql
# Revisar FKs antes de importar en nube
```

### C — Staging primero

Crear rama/proyecto staging → bootstrap → validar → repetir en prod.

---

## Smoke test

- [ ] Login con usuario god
- [ ] Un usuario `member` (no god) ve solo lo que le corresponde (RLS en vivo)
- [ ] Flujo crítico del cliente probado de punta a punta
- [ ] Edge Functions core responden (`create-auth-user`, y las que hayas activado con `--with-ai`/`--with-ecommerce`)

---

## Troubleshooting

| Problema | Causa | Acción |
|----------|-------|--------|
| `supabase login` required | CLI sin sesión | `supabase login` |
| `db push` falla | Migración ya parcial en nube | `supabase migration list`, revisar conflicto |
| Edge 503 / not deployed | Functions no desplegadas | `pnpm cloud:deploy-functions -- --yes` |
| Login redirect error | Auth URLs | Dashboard → URL configuration |
| `db:sync` falla | Falta service role en `.env.cloud` | Dashboard → API → service_role |

---

## Scripts npm

| Script | Descripción |
|--------|-------------|
| `pnpm cloud:bootstrap` | Flujo completo (acepta flags `--`) |
| `pnpm cloud:deploy-functions` | Solo deploy Edge Functions |
| `pnpm cloud:push-schema` | Solo `supabase db push` |

---

*Si el script y este doc divergen, manda el código del script.*
