#!/usr/bin/env bash
# dev-all.sh — Entorno de desarrollo de una app PragmataDevApp en un solo comando.
#
#   pnpm dev:all            → LOCAL  (Supabase local + app → local). Default.
#   pnpm dev:all --cloud    → NUBE   (app → Supabase en la nube; NO levanta local).
#     alias del flag de nube: --nube | --remote
#
# En LOCAL apaga Supabase automáticamente al salir (Ctrl+C, cerrar terminal o VS Code):
#   - Salida limpia (SIGINT/SIGTERM/SIGHUP): el `trap` corre `supabase stop`.
#   - Salida sucia (crash / kill -9): queda un lock huérfano en /tmp/pragmata-dev-locks/
#     que el watchdog global (PM2: supabase-watchdog) detecta y limpia.
#
# La bandera --cloud elige a qué Supabase apunta la app: nube vía `vite --mode cloud`
# (lee .env.cloud) o local vía el .env.local regenerado desde el CLI. Heredado del
# template PragmataDevApp — genérico, no editar por proyecto salvo necesidad real.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# ── Parse de la bandera ───────────────────────────────────────────────────────
TARGET="local"
for arg in "$@"; do
  case "$arg" in
    --cloud|--nube|--remote) TARGET="cloud" ;;
    --local)                 TARGET="local" ;;
    *) echo "⚠️  dev-all: flag desconocida '$arg' (usa --cloud o --local)" >&2 ;;
  esac
done

if [ ! -f supabase/config.toml ]; then
  echo "❌ dev-all: no encuentro supabase/config.toml en $PROJECT_ROOT" >&2
  exit 1
fi

# ── Arranque de la app (vite siempre; astro solo si existe la carpeta) ─────────
run_app() {
  local vite_cmd="$1"
  # Sin carpeta astro = un solo proceso (vite) → correr directo, sin depender de
  # 'concurrently'. Con astro = dos procesos → usar concurrently si está instalado.
  if [ -d astro ]; then
    if pnpm exec concurrently --version >/dev/null 2>&1; then
      echo "🧩 dev-all: arrancando dev → erp,astro"
      # -k: si un proceso muere, mata el resto → el script termina → el trap apaga Supabase.
      pnpm exec concurrently -k -n erp,astro -c cyan,magenta "$vite_cmd" "pnpm --dir astro dev"
    else
      echo "⚠️  dev-all: falta 'concurrently' para correr vite+astro juntos (pnpm add -D concurrently)." >&2
      echo "   Por ahora corro solo la app (vite)." >&2
      pnpm exec $vite_cmd
    fi
  else
    echo "🧩 dev-all: arrancando dev → erp"
    pnpm exec $vite_cmd
  fi
}

# ══ MODO NUBE ═════════════════════════════════════════════════════════════════
if [ "$TARGET" = "cloud" ]; then
  if [ ! -f .env.cloud ]; then
    echo "❌ dev-all --cloud: falta .env.cloud (VITE_SUPABASE_URL/ANON_KEY de la nube)." >&2
    echo "   Copia la plantilla: cp .env.cloud.example .env.cloud  y llena los valores." >&2
    exit 1
  fi
  CLOUD_URL="$(grep -E '^VITE_SUPABASE_URL=' .env.cloud | head -1 | cut -d= -f2- | tr -d '"')"
  echo ""
  echo "  ╔════════════════════════════════════════════════════════════╗"
  echo "  ║  ☁️   MODO NUBE — la app apunta a Supabase EN LA NUBE        ║"
  echo "  ║  ${CLOUD_URL}"
  echo "  ║  ⚠️   TOCAS DATOS REALES. No se levanta Supabase local.      ║"
  echo "  ╚════════════════════════════════════════════════════════════╝"
  echo ""
  run_app "vite --mode cloud"
  exit 0
fi

# ══ MODO LOCAL (default) ══════════════════════════════════════════════════════
# project_id = mismo sufijo que usan los contenedores docker (supabase_db_<project_id>)
PROJECT_ID="$(grep -E '^[[:space:]]*project_id' supabase/config.toml | head -1 | sed -E 's/.*"([^"]+)".*/\1/' || true)"
# `project_id` es OPCIONAL en config.toml: sin él, el CLI de Supabase usa el nombre
# de la carpeta del proyecto (por eso los contenedores salen `supabase_db_<carpeta>`).
# Se replica ese fallback porque, sin él, el `grep` sin match reventaba el script en
# SILENCIO — con `set -euo pipefail` la tubería devuelve 1 y `set -e` corta ahí mismo,
# antes de imprimir una sola línea. Ni segubros ni la template declaran project_id.
[ -z "$PROJECT_ID" ] && PROJECT_ID="$(basename "$PROJECT_ROOT")"
# Puerto de Studio: leído dinámicamente de la sección [studio] del config (varía por cliente).
STUDIO_PORT="$(awk '/^\[studio\]/{f=1;next} /^\[/{f=0} f&&/^[[:space:]]*port[[:space:]]*=/{gsub(/[^0-9]/,"");print;exit}' supabase/config.toml)"
[ -z "$STUDIO_PORT" ] && STUDIO_PORT=54323
LOCK_DIR="/tmp/pragmata-dev-locks"
LOCK_FILE="$LOCK_DIR/${PROJECT_ID}.lock"
mkdir -p "$LOCK_DIR"

FUNCTIONS_LOG="$LOCK_DIR/${PROJECT_ID}-functions.log"
FUNCTIONS_PID=""

cleanup() {
  trap - EXIT INT TERM HUP
  # Los mensajes van a stderr (>&2), NO a stdout. El motivo es un bug real que
  # dejó un proyecto sin poder arrancar:
  #
  # Si el script muere DENTRO de un bloque con stdout redirigido —como el
  # `{ … } > .env.local` de más abajo— el trap corre con esa redirección todavía
  # puesta, y estos `echo` se escriben DENTRO del archivo. `.env.local` acababa
  # con un "🛑 dev-all: cerrando…" pegado, y `supabase start` se negaba a
  # arrancar para siempre ("unexpected character '' in variable name").
  # Peor: como falla en `supabase start`, el script nunca vuelve a regenerar el
  # archivo — el proyecto queda atascado hasta que alguien borre `.env.local` a
  # mano. stderr nunca se redirige aquí, así que el mensaje siempre va a la
  # terminal y jamás contamina un archivo.
  echo "" >&2
  [ -n "$FUNCTIONS_PID" ] && kill "$FUNCTIONS_PID" >/dev/null 2>&1 || true
  echo "🛑 dev-all: cerrando — apagando Supabase local ($PROJECT_ID)…" >&2
  supabase stop --project-id "$PROJECT_ID" >/dev/null 2>&1 || supabase stop >/dev/null 2>&1 || true
  rm -f "$LOCK_FILE"
}
trap cleanup EXIT INT TERM HUP

echo "🚀 dev-all: levantando Supabase LOCAL ($PROJECT_ID)…"
supabase start

# ── Edge Functions ────────────────────────────────────────────────────────────
# `supabase start` NO levanta el edge runtime: hay que servir las funciones aparte.
# Sin esto, todo /functions/v1/* responde 503 desde Kong — y es un 503 mudo, no
# avisa que falta el runtime (así estuvo 12 días sin que nadie lo notara, 3-ago-2026).
# Las secrets (API keys del asistente) viven en supabase/functions/.env, fuera de git.
if compgen -G "supabase/functions/*/index.ts" >/dev/null 2>&1; then
  ENV_FLAG=()
  if [ -f supabase/functions/.env ]; then
    ENV_FLAG=(--env-file supabase/functions/.env)
  else
    echo "⚠️  dev-all: no hay supabase/functions/.env — las funciones que necesiten"
    echo "   secrets van a fallar. Plantilla: cp supabase/functions/.env.example supabase/functions/.env"
  fi
  echo "⚡ dev-all: sirviendo Edge Functions (log: $FUNCTIONS_LOG)…"
  supabase functions serve "${ENV_FLAG[@]}" > "$FUNCTIONS_LOG" 2>&1 &
  FUNCTIONS_PID=$!
fi

# Heartbeat para el watchdog: PID de este script + ruta del proyecto.
echo "$$|$PROJECT_ROOT" > "$LOCK_FILE"

# Regenera .env.local con las credenciales locales reales (puertos/keys del CLI),
# preservando cualquier feature-flag propio del proyecto que ya viviera en .env.local.
echo "📝 dev-all: escribiendo .env.local (credenciales locales)…"
PREV_FLAGS=""
if [ -f .env.local ]; then
  PREV_FLAGS="$(grep -vE '^[[:space:]]*(#|$)|^VITE_SUPABASE_(URL|ANON_KEY)=' .env.local || true)"
fi
# Se escribe a un temporal y se mueve al final (mv es atómico). Antes se escribía
# directo sobre `.env.local`: si algo fallaba a media escritura, el archivo quedaba
# truncado o con basura, y `supabase start` se negaba a arrancar en las corridas
# siguientes — sin forma de recuperarse solo, porque el script muere antes de
# volver a generarlo. Con el temporal, `.env.local` solo se reemplaza cuando el
# contenido nuevo está completo y bien formado.
ENV_TMP="$(mktemp "${TMPDIR:-/tmp}/dev-all-env.XXXXXX")"
{
  echo "# Regenerado por 'pnpm dev:all' desde 'supabase status' en cada corrida local."
  echo "# Ignorado por git (.env.*). Anon key: pública por diseño, protegida por RLS."
  supabase status -o env \
    --override-name api.url=VITE_SUPABASE_URL \
    --override-name auth.anon_key=VITE_SUPABASE_ANON_KEY \
    2>/dev/null | grep -E '^VITE_SUPABASE_(URL|ANON_KEY)=' || true
  if [ -n "$PREV_FLAGS" ]; then printf '%s\n' "$PREV_FLAGS"; fi
} > "$ENV_TMP"

# Solo se publica si de verdad trae la URL: un archivo sin ella deja la app sin
# backend y es preferible conservar el anterior a pisarlo con algo inservible.
if grep -q '^VITE_SUPABASE_URL=' "$ENV_TMP"; then
  mv "$ENV_TMP" .env.local
else
  rm -f "$ENV_TMP"
  echo "⚠️  dev-all: 'supabase status' no devolvió VITE_SUPABASE_URL; se conserva el .env.local anterior." >&2
fi

# ── Acceso desde otra máquina (celular por Tailscale, otra compu) ─────────────
# El navegador remoto alcanza el puerto de Vite pero NO el de Supabase, aunque
# Docker lo publique en 0.0.0.0 (comprobado A/B en crm-objetiva el 31-jul-2026:
# apuntando al puerto de Supabase el login truena con "Failed to fetch"; por el
# proxy entra). Por eso la app apunta al proxy `/supabase` que sirve el propio
# dev server — ver `server.proxy` en vite.config.ts: basta UN puerto alcanzable
# y de paso no hay CORS.
#
# Va después de escribir .env.local a propósito: ese archivo se regenera en cada
# corrida, así que si esto viviera antes se perdería el cambio en cada arranque.
# Solo aplica si el proyecto tiene el proxy configurado y hay Tailscale arriba.
TS_IP="$(tailscale ip -4 2>/dev/null | head -1 || true)"
if [ -n "$TS_IP" ] && grep -q "'/supabase'" vite.config.ts 2>/dev/null; then
  # De dónde sale el puerto del dev server, en orden de precedencia real:
  #   1. el entorno  2. VITE_PORT del .env  3. lo que esté escrito en vite.config.ts
  #
  # Antes se sacaba SOLO con `grep -oE 'port:[^,}]*' vite.config.ts`, y eso es
  # frágil de dos formas: basta que el config escriba el puerto de otra manera
  # (p. ej. `port,` tomando el valor de una variable) para que el grep no
  # encuentre nada y —con `set -euo pipefail`— tumbe el script entero AQUÍ, ya
  # con Supabase levantado y sin imprimir una sola pista. Cada paso lleva su
  # `|| true`: no encontrar el puerto es un caso normal, no un error fatal.
  APP_PORT="${VITE_PORT:-}"
  if [ -z "$APP_PORT" ] && [ -f .env ]; then
    APP_PORT="$(grep -E '^[[:space:]]*VITE_PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' ' || true)"
  fi
  if [ -z "$APP_PORT" ]; then
    # Fallback para configs que aún escriben el puerto literal en `server.port`
    # (`port: 9090` o `port: Number(process.env.VITE_PORT) || 7070`).
    APP_PORT="$(grep -oE 'port:[^,}]*' vite.config.ts 2>/dev/null | head -1 | grep -oE '[0-9]{2,5}' | tail -1 || true)"
  fi
  if [ -n "$APP_PORT" ]; then
    # A dónde reenvía el proxy: el puerto real de Supabase de ESTE proyecto, tal
    # como lo acaba de reportar `supabase status` (cada stack usa el suyo).
    SUPABASE_LOCAL_URL="$(grep -E '^VITE_SUPABASE_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '"')"
    export SUPABASE_LOCAL_URL
    sed -i -E "s|^VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=\"http://${TS_IP}:${APP_PORT}/supabase\"|" .env.local
    echo "🔗 dev-all: accesible desde otra máquina → http://${TS_IP}:${APP_PORT}"
  fi
fi

echo ""
echo "  ╔════════════════════════════════════════════════════════════╗"
echo "  ║  🖥️   MODO LOCAL — Supabase local + app apuntando a local    ║"
echo "  ║  Studio: http://127.0.0.1:${STUDIO_PORT}"
[ -n "$FUNCTIONS_PID" ] && echo "  ║  Edge Functions: sirviendo (log: $FUNCTIONS_LOG)" || true
echo "  ╚════════════════════════════════════════════════════════════╝"
echo ""
run_app "vite"
