#!/bin/bash

PORT=4173
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GOT_URL=0

# load env
if [ -f "$BASE_DIR/web/api/.env" ]; then
    while read -r line || [ -n "$line" ]; do
        case "$line" in
            "" | [[:space:]]*#*) continue ;;
        esac
        key="${line%%=*}"
        value="${line#*=}"
        key="$(echo "$key" | xargs)"
        value="${value%% #*}"
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        export "$key"="$value"
    done < "$BASE_DIR/web/api/.env"
fi

# setup DB
if [ -z "$TURSO_URL" ] || [ -z "$TURSO_AUTH_TOKEN" ]; then
    echo "warn: turso missing"
    DISCOVERY=0
else
    DISCOVERY=1
    T_URL="$(echo "$TURSO_URL" | sed 's/libsql:\/\//https:\/\//')"
fi

# restart backend
if command -v pm2 >/dev/null; then
    pm2 restart nexstream-api --silent >/dev/null 2>&1 || (cd "$BASE_DIR/web/api" && pm2 start src/app.js --name nexstream-api --silent >/dev/null 2>&1)
else
    pkill -f "node src/app.js"
    cd "$BASE_DIR/web/api" && node src/app.js >/dev/null 2>&1 &
fi

echo "starting zrok..."

stdbuf -oL zrok share public http://localhost:"$PORT" --backend-mode proxy 2>&1 | while read -r line; do
    if [ "$GOT_URL" -eq 0 ] && echo "$line" | grep -qE "https://[a-z0-9-]+\.share\.zrok\.io"; then
        URL="$(echo "$line" | grep -oE "https://[a-z0-9-]+\.share\.zrok\.io" | head -n 1)"
        echo -e "\nURL: $URL\n"
        GOT_URL=1

        # sync discovery
        if [ "$DISCOVERY" -eq 1 ]; then
            TS="$(date +%s)"
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
    fi
    echo "$line"
done
