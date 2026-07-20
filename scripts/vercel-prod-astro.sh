#!/usr/bin/env bash
# Deploy Astro: build local + --prebuilt (evita que Vercel ejecute vite build del ERP).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ASTRO_LINK="$ROOT/astro/.vercel/project.json"

if [[ ! -f "$ASTRO_LINK" ]]; then
  echo "Error: missing $ASTRO_LINK — run: cd astro && vercel link" >&2
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "Error: vercel CLI not found." >&2
  exit 1
fi

# Carga segura: .env base, luego .env.cloud gana (prod deploy no debe heredar localhost del .env local).
load_env_var() {
  local file=$1 key=$2
  [[ -f "$file" ]] || return 0
  local line
  line=$(grep -m1 "^${key}=" "$file" 2>/dev/null || true)
  [[ -n "$line" ]] || return 0
  local val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"
  export "${key}=${val}"
}

for env_file in "$ROOT/.env" "$ROOT/.env.cloud"; do
  for key in PUBLIC_SITE_URL PUBLIC_APP_URL VITE_PUBLIC_SITE_URL VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY PUBLIC_ENABLE_ECOMMERCE PUBLIC_BRAND_NAME; do
    load_env_var "$env_file" "$key"
  done
done

if [[ -z "${PUBLIC_SITE_URL:-}" || -z "${PUBLIC_APP_URL:-}" ]]; then
  echo "Warning: PUBLIC_SITE_URL / PUBLIC_APP_URL no definidos — el build puede usar localhost." >&2
  echo "         Define en .env o en el proyecto Astro de Vercel → Production." >&2
fi

read -r VERCEL_ORG_ID VERCEL_PROJECT_ID < <(
  node -pe "
    const j = JSON.parse(require('fs').readFileSync('${ASTRO_LINK}', 'utf8'));
    console.log(j.orgId + ' ' + j.projectId);
  "
)

export VERCEL_ORG_ID VERCEL_PROJECT_ID

echo "==> Building Astro (pnpm --dir astro run build)"
pnpm --dir astro run build

echo ""
echo "==> Vercel Production: Astro (${VERCEL_PROJECT_ID}) — prebuilt"
vercel deploy --prebuilt --prod -y --cwd astro
