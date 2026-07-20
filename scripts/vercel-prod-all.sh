#!/usr/bin/env bash
# Deploy ERP (root) + Astro (astro/) to Vercel Production.
# Requires: vercel CLI, `vercel login`, and `.vercel/project.json` in both dirs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v vercel >/dev/null 2>&1; then
  echo "Error: vercel CLI not found. Install: pnpm add -g vercel" >&2
  exit 1
fi

if ! vercel whoami >/dev/null 2>&1; then
  echo "Error: not logged in to Vercel. Run: vercel login" >&2
  exit 1
fi

for dir in "$ROOT" "$ROOT/astro"; do
  if [[ ! -f "$dir/.vercel/project.json" && ! -f "$dir/.vercel/repo.json" ]]; then
    echo "Error: $dir is not linked to Vercel (.vercel/project.json missing)." >&2
    echo "Run: vercel link (from that directory) or link both projects in Vercel dashboard." >&2
    exit 1
  fi
done

echo "==> Vercel Production: ERP (root)"
vercel deploy --prod -y

echo ""
bash "$ROOT/scripts/vercel-prod-astro.sh"

echo ""
echo "Done. Both production deploys triggered."
echo ""
echo "Flujo esperado:"
echo "  • Astro (PUBLIC):  PUBLIC_SITE_URL → landing /"
echo "  • ERP login:       PUBLIC_APP_URL/login"
echo "  • ERP / redirige a  VITE_PUBLIC_SITE_URL (= URL de Astro)"
