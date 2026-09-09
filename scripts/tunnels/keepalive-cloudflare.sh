#!/data/data/com.termux/files/usr/bin/bash
# Keeps the phone-hosted backend + Cloudflare quick tunnel alive.
# Republishes the rotating trycloudflare URL to Turso (configs.BACKEND_URL)
# whenever it changes, so the app always finds the current backend.

PORT=5000
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOGDIR="$HOME/.nexstream"
mkdir -p "$LOGDIR"
CF_LOG="$LOGDIR/cf.log"
BE_LOG="$LOGDIR/backend.log"
LAST_URL=""

# keep android from sleeping/killing us
termux-wake-lock 2>/dev/null || true

# load turso creds from web/api/.env
if [ -f "$BASE_DIR/web/api/.env" ]; then
  while IFS='=' read -r k v || [ -n "$k" ]; do
    case "$k" in ''|\#*) continue ;; esac
    v="${v%$'\r'}"; v="${v#\"}"; v="${v%\"}"; v="${v#\'}"; v="${v%\'}"
    export "$k=$v"
  done < "$BASE_DIR/web/api/.env"
fi

if [ -n "$TURSO_URL" ] && [ -n "$TURSO_AUTH_TOKEN" ]; then
  DISCOVERY=1
  T_URL="$(echo "$TURSO_URL" | sed 's#libsql://#https://#')"
else
  DISCOVERY=0
  echo "[keepalive] warn: TURSO creds missing; URL won't be published"
fi

publish_url() {
  [ "$DISCOVERY" = "1" ] || return 0
  local url="$1" ts
  ts="$(date +%s)"
  curl -s -X POST "$T_URL/v2/pipeline" \
    -H "Authorization: Bearer $TURSO_AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"requests\":[{\"type\":\"execute\",\"stmt\":{\"sql\":\"INSERT OR REPLACE INTO configs (key, value, updated_at) VALUES ('BACKEND_URL', '$url', $ts)\"}},{\"type\":\"close\"}]}" >/dev/null \
    && echo "[keepalive] published BACKEND_URL=$url"
}

ensure_backend() {
  pgrep -f "termux-shim.js" >/dev/null 2>&1 && return 0
  echo "[keepalive] (re)starting backend..."
  ( cd "$BASE_DIR/web/api" && nohup npm start >"$BE_LOG" 2>&1 & )
}

ensure_tunnel() {
  if ! pgrep -f "cloudflared tunnel --url" >/dev/null 2>&1; then
    echo "[keepalive] (re)starting cloudflared..."
    : > "$CF_LOG"
    nohup cloudflared tunnel --url "http://localhost:$PORT" >"$CF_LOG" 2>&1 &
    sleep 8
  fi
  local url
  url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | tail -1)"
  if [ -n "$url" ] && [ "$url" != "$LAST_URL" ]; then
    publish_url "$url"
    LAST_URL="$url"
  fi
}

echo "[keepalive] watchdog started (backend :$PORT + cloudflare tunnel)"
while true; do
  ensure_backend
  ensure_tunnel
  sleep 20
done
