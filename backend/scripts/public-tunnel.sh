#!/usr/bin/env bash
# Keep a public HTTPS URL pointed at local gateway :4000 (for phone APK while Mac is on).
# For Mac-free: use CLOUD_DEPLOY.md (Oracle VPS) instead.
set -euo pipefail
cd /tmp
pkill -f 'tunnelmole' 2>/dev/null || true
sleep 1
nohup npx --yes tunnelmole 4000 > /tmp/tmole.log 2>&1 &
echo "tunnelmole pid=$!"
for i in $(seq 1 40); do
  if grep -qoE 'https://[a-zA-Z0-9.-]+\.tunnelmole\.net' /tmp/tmole.log; then break; fi
  sleep 1
done
URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.tunnelmole\.net' /tmp/tmole.log | head -1)
echo "PUBLIC_URL=$URL"
echo "Paste into StreamixApp/src/config.ts → PUBLIC_API_URL, then rebuild APK."
curl -sS -m 20 "$URL/health" || true
echo
