# AGENTS.md

## Cursor Cloud specific instructions

### Monorepo layout

| Pillar | Path | Dev command | Port |
|--------|------|-------------|------|
| ERP (Operativo) | repo root | `pnpm dev` | 7070 |
| Public site (Astro) | `astro/` | `pnpm dev:astro` or `pnpm dev:all` | 4321 |
| Supabase local | `supabase/` | `supabase start` | API 54321, Studio 54323 |

Canonical setup docs: `docs/PARA-INICIAR.md`, `docs/SETUP.md`.

### First-time / cold VM checklist

1. **Docker daemon** — Cloud VMs do not start Docker automatically. If `docker info` fails, start it once per session:
   ```bash
   sudo dockerd >/tmp/dockerd.log 2>&1 &
   ```
   Docker is configured with `fuse-overlayfs` and `iptables-legacy` (see `/etc/docker/daemon.json`).

2. **Supabase CLI** — Install to `~/.local/share/supabase` (tarball contains both `supabase` and `supabase-go`). Ensure `PATH` includes that directory (already in `~/.bashrc` after setup).

3. **`.env`** — Copy from `.env.example` if missing. After `supabase start`, paste **Publishable** key from `sudo supabase status` into `VITE_SUPABASE_ANON_KEY`. Never commit `.env`.

4. **Supabase local** — From repo root:
   ```bash
   sudo supabase start   # first run pulls images (~1–2 min)
   ```
   Use `sudo` for Supabase/Docker commands until the shell session has `docker` group membership (or always use `sudo`).

5. **RBAC + god user** (one-time per fresh DB):
   ```bash
   SUPABASE_SERVICE_ROLE_KEY="$(sudo supabase status -o json | jq -r .SERVICE_ROLE_KEY)" pnpm db:sync
   ```
   Create Auth user in Studio (`http://127.0.0.1:54323`) or via Admin API, then run `docs/database/02_seed_god_user.sql` with that UUID (`supabase db query` or psql on port 54322).

### Routine dev commands

| Task | Command |
|------|---------|
| ERP + Astro | `pnpm dev:all` |
| Lint ERP | `pnpm lint` (see known issues below) |
| Build ERP | `pnpm build` |
| Astro check/build | `cd astro && pnpm check && pnpm build` |
| RBAC sync | `SUPABASE_SERVICE_ROLE_KEY=… pnpm db:sync` |

### Known gotchas

- **`pnpm install --frozen-lockfile` may fail** — lockfile can lag `package.json` (e.g. `@supabase/supabase-js`). Use `pnpm install` without `--frozen-lockfile` locally.
- **ERP `pnpm build` currently fails** on TypeScript errors in `src/features/tasks/backlog/hooks/useBacklog.ts`. Dev server (`pnpm dev`) still runs.
- **`pnpm lint` reports pre-existing violations** across ERP, Astro islands, and edge functions; same as local clone state.
- **Astro `pnpm check`** has type errors in `astro.config.mjs` and `src/pages/auth/callback.astro`; dev server on :4321 still serves pages.
- **Do not run `newgrp docker` in automation** — it blocks the shell. Use `sudo` for Docker/Supabase instead.
- **JWT session mismatch** — If `.env` points to a different Supabase instance than the browser session, clear site storage on `:7070` or use a private window.
- **PowerSync** is off by default (`VITE_ENABLE_POWERSYNC=false`); no JourneyApps instance needed for standard online dev.

### Test login (local dev only)

After god-user seed: `dev@pragmatadevs.com` / `DevPassword123!` → `http://localhost:7070/login` → `/dashboard`.
