#!/usr/bin/env bash
# Expose local Streamix API (port 4000) via a public HTTPS tunnel (tunnelmole).
# Phone/APK cannot use LAN IP when Wi‑Fi client isolation blocks device-to-device traffic.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMOLEbin=""
if [[ -x /tmp/node_modules/.bin/tunnelmole ]]; then
  TMOLEbin=/tmp/node_modules/.bin/tunnelmole
elif command -v tunnelmole >/dev/null 2>&1; then
  TMOLEbin="$(command -v tunnelmole)"
else
  echo "Installing tunnelmole into /tmp ..."
  (cd /tmp && npm install --no-fund --no-audit tunnelmole@latest >/dev/null)
  TMOLEbin=/tmp/node_modules/.bin/tunnelmole
fi

if ! curl -sf --connect-timeout 3 http://127.0.0.1:4000/health >/dev/null; then
  echo "Backend not reachable on http://127.0.0.1:4000 — start Docker first:"
  echo "  cd backend && docker compose up -d"
  exit 1
fi

pkill -f '[t]unnelmole' 2>/dev/null || true
sleep 1

LOG=/tmp/tmole.log
: >"$LOG"
nohup "$TMOLEbin" 4000 >>"$LOG" 2>&1 </dev/null &
echo $! >/tmp/tmole.pid
echo "tunnelmole started (pid $(cat /tmp/tmole.pid))"

for i in $(seq 1 40); do
  URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.tunnelmole\.net' "$LOG" | tail -1 || true)
  if [[ -n "${URL:-}" ]]; then
    echo "$URL" >/tmp/streamix-public-api.url
    echo ""
    echo "Public API URL:"
    echo "  $URL"
    echo ""
    echo "In the app: Profile → API server → paste URL → Save"
    echo "Or set StreamixApp/src/config.ts PUBLIC_API_URL and rebuild APK."
    echo "Logs: $LOG"
    exit 0
  fi
  sleep 1
done

echo "Timed out waiting for tunnel URL. Log:"
tail -40 "$LOG"
exit 1
