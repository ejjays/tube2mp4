#!/bin/bash

PORT=5000
DOMAIN="spikier-acinaceous-keenan.ngrok-free.dev"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
NGROK_BIN="$SCRIPT_DIR/ngrok"

# load env
if [ -f "$BASE_DIR/web/api/.env" ]; then
    while IFS='=' read -r k v || [ -n "$k" ]; do
        case "$k" in ''|\#*) continue ;; esac
        v="${v%$'\r'}"
        v="${v#\"}"; v="${v%\"}"
        v="${v#\'}"; v="${v%\'}"
        export "$k=$v"
    done < "$BASE_DIR/web/api/.env"
fi

# setup DB
if [ -z "$TURSO_URL" ] || [ -z "$TURSO_AUTH_TOKEN" ]; then
    echo "warn: turso missing"
    DISCOVERY=0
else
    DISCOVERY=1
    T_URL=$(echo "$TURSO_URL" | sed 's/libsql:\/\//https:\/\//')
fi

echo "starting backend..."
command -v termux-chroot >/dev/null || pkg install proot -y

if command -v pm2 >/dev/null; then
    pm2 restart nexstream-api --silent >/dev/null 2>&1 || (cd "$BASE_DIR/web/api" && pm2 start src/app.js --name nexstream-api --silent >/dev/null 2>&1)
else
    pkill -f "node src/app.js"
    cd "$BASE_DIR/web/api" && node src/app.js >/dev/null 2>&1 &
fi

echo "starting ngrok..."
URL="https://$DOMAIN"

# sync discovery
if [ "$DISCOVERY" -eq 1 ]; then
    TS=$(date +%s)
    curl -s -X POST "$T_URL/v2/pipeline" \
        -H "Authorization: Bearer $TURSO_AUTH_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"requests\": [
                { \"type\": \"execute\", \"stmt\": { \"sql\": \"INSERT OR REPLACE INTO configs (key, value, updated_at) VALUES ('BACKEND_URL', '$URL', $TS)\" } },
                { \"type\": \"close\" }
            ]
        }" > /dev/null
    echo "sync: turso updated"
fi

echo -e "\nURL: $URL\n"
termux-chroot "$NGROK_BIN" http --domain="$DOMAIN" "$PORT" > ngrok_output.log 2>&1
