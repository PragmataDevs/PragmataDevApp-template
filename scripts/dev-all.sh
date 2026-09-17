#!/usr/bin/env bash
# dev-all.sh — Entorno de desarrollo de una app PragmataDevApp en un solo comando.
#
#   pnpm dev:all            → LOCAL  (Supabase local + app → local). Default.
#   pnpm dev:all --cloud    → NUBE   (app → Supabase en la nube; NO levanta local).
#     alias del flag de nube: --nube | --remote
#   pnpm db:up              → SOLO la base: levanta Supabase y NO lo ata a este proceso.
#   pnpm db:down            → apaga Supabase de este proyecto.
#
# ── Por qué existen db:up / db:down ───────────────────────────────────────────
# `dev:all` ata el stack a la vida del proceso: al salir, lo apaga. Eso es correcto
# para desarrollar, pero no sirve para abrir la base un rato desde la terminal, hacer
# SQL, o para una sesión headless (Telegram) que no deja un proceso vivo.
#
# `db:up` levanta el stack y escribe un lock MANUAL (sin PID). Eso lo declara
# intencional: el watchdog no lo mata ni lo reporta como zombie, y un `dev:all`
# posterior lo reusa y lo deja vivo al salir (regla «el que lo prende, lo apaga»).
# `db:down` es la contraparte explícita, y se niega a apagar un stack que un
# `dev:all` vivo esté usando.
#
# Van como banderas de ESTE script a propósito, no en un archivo aparte: toda la
# maquinaria (project_id, .env.local, lock, Studio) ya vive acá, y un segundo script
# vendorizado en 9 copias sería otra cosa que se desincroniza.
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
# MODE: app (default, levanta la app) | db-up (solo la base) | db-down (apagarla)
MODE="app"
# Registro de puertos (16-sep-2026): la nube manda; si este repo se desfasó, se avisa y se sigue.
[ -x "$HOME/praxia/organon/ports.sh" ] && bash "$HOME/praxia/organon/ports.sh" check --path "$PWD" 2>/dev/null | grep -E '^(✖|ports:)' || true
for arg in "$@"; do
  case "$arg" in
    --cloud|--nube|--remote)   TARGET="cloud" ;;
    --local)                   TARGET="local" ;;
    --db-up|--db-only|--solo-db) MODE="db-up" ;;
    --db-down|--db-stop)       MODE="db-down" ;;
    *) echo "⚠️  dev-all: flag desconocida '$arg' (usa --cloud, --local, --db-up o --db-down)" >&2 ;;
  esac
done

if [ "$MODE" != "app" ] && [ "$TARGET" = "cloud" ]; then
  echo "❌ dev-all: --db-up/--db-down son de Supabase LOCAL; no tienen sentido con --cloud." >&2
  exit 1
fi

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
  # Sin barrera de confirmación (Wicho, 17-sep-2026): el aviso de arriba basta; --cloud arranca directo.
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

# ══ MODO db-down ══════════════════════════════════════════════════════════════
# Apaga el stack de este proyecto. Se niega si un `dev:all` VIVO lo está usando:
# tumbarle la base a un dev en marcha es justo el bug que el fix del trap arregló.
if [ "$MODE" = "db-down" ]; then
  if ! docker ps --filter "name=^supabase_db_${PROJECT_ID}$" --format '{{.Names}}' 2>/dev/null | grep -q .; then
    echo "ℹ️  db:down: Supabase de '$PROJECT_ID' ya estaba abajo."
    rm -f "$LOCK_FILE"
    exit 0
  fi

  if [ -f "$LOCK_FILE" ]; then
    LOCK_OWNER="$(cut -d'|' -f1 < "$LOCK_FILE" 2>/dev/null || true)"
    if [ "$LOCK_OWNER" != "manual" ] && [ -n "$LOCK_OWNER" ] && kill -0 "$LOCK_OWNER" 2>/dev/null; then
      echo "❌ db:down: NO lo apago — un 'pnpm dev:all' vivo (pid $LOCK_OWNER) está usando este stack." >&2
      echo "   Cierra ese dev primero (él lo apaga solo al salir)." >&2
      exit 1
    fi
  fi

  echo "🛑 db:down: apagando Supabase local ($PROJECT_ID)…"
  # Sin `--no-backup` a propósito: los volúmenes —y con ellos los datos— se conservan.
  supabase stop --project-id "$PROJECT_ID" >/dev/null 2>&1 || supabase stop >/dev/null 2>&1 || true
  rm -f "$LOCK_FILE"
  echo "✓ db:down: '$PROJECT_ID' abajo. Los datos siguen en su volumen de Docker."
  exit 0
fi

# ── ¿De quién es el stack? ────────────────────────────────────────────────────
# REGLA: el que lo prende, lo apaga.
#
# Si el stack de este proyecto YA estaba corriendo al arrancar —lo levantó
# `supabase start` a mano, otra terminal, o una sesión headless— este script no
# es su dueño: al salir lo deja vivo.
#
# Sin esto el trap corría `supabase stop` incondicionalmente, así que cualquier
# Ctrl+C (o cerrar VS Code) tumbaba un stack que otro estaba usando. En IndPack,
# servido 24/7 por tailnet, cada salida le tiraba la base al cliente (5-ago-2026).
#
# Se consulta Docker y no `supabase status` porque es instantáneo y no depende
# de que el CLI resuelva el proyecto. El ancla `^…$` evita el falso positivo de
# un project_id que sea prefijo de otro.
SUPABASE_WAS_RUNNING=0
if docker ps --filter "name=^supabase_db_${PROJECT_ID}$" --format '{{.Names}}' 2>/dev/null | grep -q .; then
  SUPABASE_WAS_RUNNING=1
fi

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
  if [ "${SUPABASE_WAS_RUNNING:-0}" = "1" ]; then
    echo "🫸 dev-all: cerrando — Supabase ($PROJECT_ID) ya estaba arriba antes; lo dejo corriendo." >&2
    # El lock tampoco es nuestro: borrarlo dejaría al stack vivo pero sin dueño
    # declarado, y el watchdog empezaría a reportarlo como «arriba sin lock» cada
    # 2 minutos (o, si era un lock `manual` de `pnpm db:up`, se perdería la marca
    # de que está abierto a propósito). La regla «el que lo prende, lo apaga»
    # aplica igual al lockfile.
  else
    echo "🛑 dev-all: cerrando — apagando Supabase local ($PROJECT_ID)…" >&2
    # Sin `--no-backup` a propósito: los volúmenes —y con ellos los datos— se conservan.
    supabase stop --project-id "$PROJECT_ID" >/dev/null 2>&1 || supabase stop >/dev/null 2>&1 || true
    rm -f "$LOCK_FILE"
  fi
}
# En db-up NO se instala el trap: el punto de `db:up` es justamente que el stack
# sobreviva a la salida de este proceso. Apagarlo es explícito, con `pnpm db:down`.
if [ "$MODE" != "db-up" ]; then
  trap cleanup EXIT INT TERM HUP
fi

# ── Guarda: la versión de Postgres del volumen manda ──────────────────────────
#
# `supabase link` escribe en `supabase/.temp/postgres-version` la versión de
# Postgres del proyecto REMOTO, y ese archivo **le gana al `major_version` del
# config.toml**. Si el volumen local se creó con una mayor más vieja, el CLI
# intenta levantar la imagen nueva sobre datos viejos y Postgres se niega:
#
#   FATAL: database files are incompatible with server
#   DETAIL: The data directory was initialized by PostgreSQL version 15,
#           which is not compatible with this version 17.6.
#
# El stack no levanta y `dev:all` aborta entero. El síntoma no menciona el link
# por ningún lado, así que se diagnostica como problema de puertos o de Docker
# (mordió a IndPack el 9-sep-2026: el link era del 6-ago y estuvo un mes latente
# porque nadie levantó ese stack).
#
# Acá se alinea `.temp/postgres-version` a la mayor que el volumen REALMENTE
# tiene. Se elige el volumen y no la nube a propósito: bajar la imagen preserva
# los datos, subirla los deja inaccesibles. La migración a la mayor nueva es una
# decisión aparte (dump + restore), y se avisa en voz alta para que no se olvide.
alinear_version_pg() {
  local vol="supabase_db_${PROJECT_ID}"
  # Sin volumen no hay nada que preservar: el CLI lo inicializa con la mayor que quiera.
  docker volume inspect "$vol" >/dev/null 2>&1 || return 0

  local vol_major
  vol_major="$(docker run --rm -v "${vol}":/v:ro alpine cat /v/PG_VERSION 2>/dev/null | tr -dc '0-9')"
  # Si no se pudo leer (sin imagen alpine, sin permisos), no se estorba el arranque.
  [ -z "$vol_major" ] && return 0

  local temp_file="supabase/.temp/postgres-version"
  local cfg_major pedido pedido_major
  cfg_major="$(awk '/^\[db\]/{f=1;next} /^\[/{f=0} f&&/^[[:space:]]*major_version/{gsub(/[^0-9]/,"");print;exit}' supabase/config.toml 2>/dev/null || true)"
  pedido=""
  [ -f "$temp_file" ] && pedido="$(tr -d '[:space:]' < "$temp_file" 2>/dev/null || true)"
  # Lo que de verdad se va a levantar: el .temp del link si existe, si no el config.
  pedido_major="${pedido%%.*}"
  [ -z "$pedido_major" ] && pedido_major="$cfg_major"

  # El config.toml no manda, pero si miente conviene saberlo: el día que se borre
  # el .temp, es él quien decide.
  if [ -n "$cfg_major" ] && [ "$cfg_major" != "$vol_major" ]; then
    echo "⚠️  dev-all: config.toml dice major_version = $cfg_major y el volumen es PG $vol_major." >&2
  fi

  [ -z "$pedido_major" ] && return 0
  [ "$pedido_major" = "$vol_major" ] && return 0

  # Se necesita un tag concreto de esa mayor. Se busca entre las imágenes ya
  # descargadas: pedir una que no está obligaría a un pull a ciegas.
  local tag
  tag="$(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null \
        | grep -E "supabase/postgres:${vol_major}\." | sed 's/.*://' | sort -V | tail -1)"
  if [ -z "$tag" ]; then
    echo "❌ dev-all: el volumen '$vol' es PG $vol_major pero se iba a levantar PG $pedido_major," >&2
    echo "   y no hay imagen supabase/postgres:${vol_major}.* descargada para alinearlo." >&2
    echo "   Tus datos siguen intactos en el volumen, pero el stack no va a subir." >&2
    echo "   Cura: docker pull public.ecr.aws/supabase/postgres:${vol_major}.x  y reintenta." >&2
    return 0
  fi

  mkdir -p "$(dirname "$temp_file")"
  [ -f "$temp_file" ] && [ ! -f "${temp_file}.bak-link" ] && cp "$temp_file" "${temp_file}.bak-link"
  printf '%s' "$tag" > "$temp_file"
  echo "⚠️  dev-all: el volumen de '$PROJECT_ID' es PG $vol_major y el link pedía PG $pedido_major." >&2
  echo "   Alineado a $tag para no dejar tus datos inaccesibles." >&2
  echo "   >> MIGRACIÓN PENDIENTE a PG $pedido_major (dump con $vol_major → restore en $pedido_major)." >&2
}

if [ "$SUPABASE_WAS_RUNNING" = "1" ]; then
  echo "ℹ️  dev-all: Supabase de '$PROJECT_ID' YA estaba arriba — lo reuso y lo dejo vivo al salir."
else
  # Sólo cuando hay que levantarlo: si ya está arriba, el volumen ya montó bien.
  alinear_version_pg
  echo "🚀 dev-all: levantando Supabase LOCAL ($PROJECT_ID)…"
fi
supabase start

# ── Edge Functions ────────────────────────────────────────────────────────────
# `supabase start` NO levanta el edge runtime: hay que servir las funciones aparte.
# Sin esto, todo /functions/v1/* responde 503 desde Kong — y es un 503 mudo, no
# avisa que falta el runtime (así estuvo 12 días sin que nadie lo notara, 3-ago-2026).
# Las secrets (API keys del asistente) viven en supabase/functions/.env, fuera de git.
if [ "$MODE" = "db-up" ] && compgen -G "supabase/functions/*/index.ts" >/dev/null 2>&1; then
  # `functions serve` necesita un proceso vivo que lo aloje, y db:up termina.
  echo "ℹ️  db:up: NO se sirven las Edge Functions (necesitan un proceso vivo)."
  echo "   /functions/v1/* va a responder 503 hasta que corras 'pnpm dev:all'."
elif compgen -G "supabase/functions/*/index.ts" >/dev/null 2>&1; then
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
#
# Solo se escribe si el stack es NUESTRO. El watchdog apaga los stacks cuyo lock
# apunta a un PID muerto; dejar lock sobre un stack ajeno haría que un crash de
# este script le tumbe el Supabase a quien sí lo estaba usando. Su política ya
# cubre el resto del caso: un stack sin lock lo da por levantado a mano y no lo toca.
#
# En `db:up` el dueño no es un proceso (este script termina), así que el lock se
# escribe con el marcador `manual` en lugar de un PID. El watchdog lo lee y lo
# respeta: no es un zombie, es un stack abierto a propósito. Sin el marcador
# tendría que elegir entre matarlo (si pusiéramos un PID muerto) o quejarse cada
# 2 minutos de que está «arriba sin lock».
if [ "$MODE" = "db-up" ]; then
  if [ "$SUPABASE_WAS_RUNNING" = "0" ] || [ ! -f "$LOCK_FILE" ]; then
    echo "manual|$PROJECT_ROOT" > "$LOCK_FILE"
  fi
elif [ "$SUPABASE_WAS_RUNNING" = "0" ]; then
  echo "$$|$PROJECT_ROOT" > "$LOCK_FILE"
fi

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

if [ "$MODE" = "db-up" ]; then
  echo ""
  echo "  ╔════════════════════════════════════════════════════════════╗"
  echo "  ║  🗄️   SOLO BASE — Supabase local arriba, sin app             ║"
  echo "  ║  Studio: http://127.0.0.1:${STUDIO_PORT}"
  echo "  ║  Queda vivo al salir. Para apagarlo: pnpm db:down           ║"
  echo "  ╚════════════════════════════════════════════════════════════╝"
  echo ""
  exit 0
fi

echo ""
echo "  ╔════════════════════════════════════════════════════════════╗"
echo "  ║  🖥️   MODO LOCAL — Supabase local + app apuntando a local    ║"
echo "  ║  Studio: http://127.0.0.1:${STUDIO_PORT}"
[ -n "$FUNCTIONS_PID" ] && echo "  ║  Edge Functions: sirviendo (log: $FUNCTIONS_LOG)" || true
echo "  ╚════════════════════════════════════════════════════════════╝"
echo ""
run_app "vite"
