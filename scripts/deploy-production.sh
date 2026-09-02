#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
deploy_env="${FLEET_DEPLOY_ENV_FILE:-/etc/harvey-pw-fleet/deploy.env}"
if [[ ! -r "$deploy_env" ]]; then
  echo "Deployment environment file is unavailable." >&2
  exit 1
fi

database_ca_host_file="$(awk -F= '$1 == "FLEET_DATABASE_CA_HOST_FILE" { sub(/^[^=]*=/, ""); print }' "$deploy_env" | tail -n 1)"
if [[ "$database_ca_host_file" != /* || ! -r "$database_ca_host_file" ]]; then
  echo "FLEET_DATABASE_CA_HOST_FILE must identify a readable absolute CA file." >&2
  exit 1
fi

compose=(docker compose --env-file "$deploy_env" -f compose.production.yaml)
"${compose[@]}" build app worker preflight
"${compose[@]}" up -d postgres clamav
"${compose[@]}" --profile jobs run --rm worker pnpm production:config-check
"${compose[@]}" --profile jobs run --rm worker pnpm db:migrate
"${compose[@]}" --profile jobs run --rm worker pnpm db:bootstrap-admin
"${compose[@]}" --profile tools run --rm preflight
"${compose[@]}" up -d app postgres clamav

http_port="$(awk -F= '$1 == "FLEET_HTTP_PORT" { print $2 }' "$deploy_env" | tail -n 1)"
if [[ -z "$http_port" || "$http_port" == *[!0-9]* ]]; then
  echo "FLEET_HTTP_PORT is missing or invalid." >&2
  exit 1
fi
for attempt in {1..30}; do
  if curl --fail --silent --show-error "http://127.0.0.1:${http_port}/api/ready" >/dev/null; then
    echo "Deployment readiness check passed."
    exit 0
  fi
  sleep 2
done
echo "Deployment did not become ready within 60 seconds." >&2
"${compose[@]}" ps >&2
exit 1
