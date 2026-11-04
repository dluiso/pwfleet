#!/usr/bin/env bash
set -euo pipefail

app_env="${PWFLEET_APP_ENV_FILE:-/etc/pwfleet/app.env}"
[[ -r "$app_env" ]] || { echo "The protected application environment is unavailable." >&2; exit 1; }
set -a
source "$app_env"
set +a

curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/api/ready >/dev/null
curl --fail --silent --show-error --max-time 15 "${APP_BASE_URL%/}/api/live" >/dev/null
systemctl is-active --quiet pwfleet.service pwfleet-worker.timer
echo "PW Fleet health check passed."
