#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this deployment command as root." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_env="${PWFLEET_APP_ENV_FILE:-/etc/pwfleet/app.env}"
cd "$repo_root"

for command in git node pnpm psql pg_dump clamdscan systemctl curl; do
  command -v "$command" >/dev/null || { echo "Required command is unavailable: $command" >&2; exit 1; }
done
getent passwd pwfleet >/dev/null || { echo "The pwfleet system user is unavailable." >&2; exit 1; }
[[ -r "$app_env" ]] || { echo "The protected application environment is unavailable." >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "The deployment checkout is not clean." >&2; exit 1; }

pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test

service_was_active=0
if systemctl is-active --quiet pwfleet.service; then
  service_was_active=1
  systemctl stop pwfleet.service
fi

restore_previous_service() {
  if [[ "$service_was_active" -eq 1 ]] && ! systemctl is-active --quiet pwfleet.service; then
    systemctl start pwfleet.service || true
  fi
}
trap restore_previous_service EXIT

pnpm build
install -d .next/standalone/.next/static
cp -a .next/static/. .next/standalone/.next/static/
if [[ -d public ]]; then
  cp -a public .next/standalone/
fi

install -o root -g root -m 0644 deploy/native/pwfleet.service /etc/systemd/system/pwfleet.service
install -o root -g root -m 0644 deploy/native/pwfleet-worker.service /etc/systemd/system/pwfleet-worker.service
install -o root -g root -m 0644 deploy/native/pwfleet-worker.timer /etc/systemd/system/pwfleet-worker.timer
chown -R root:pwfleet "$repo_root"
chmod -R g=rX,o= "$repo_root"

set -a
# The protected file is controlled by root and must remain valid shell environment syntax.
source "$app_env"
set +a

pnpm production:config-check
pnpm db:migrate
pnpm db:bootstrap-catalog
pnpm db:bootstrap-admin
if [[ "$AUTH_MODE" == "oidc" ]]; then
  pnpm db:bind-bootstrap-admin
fi
runuser -u pwfleet --preserve-environment -- ./node_modules/.bin/tsx src/db/production-readiness.ts

systemctl daemon-reload
systemctl enable --now pwfleet.service pwfleet-worker.timer

for attempt in {1..30}; do
  if curl --fail --silent --show-error http://127.0.0.1:3000/api/ready >/dev/null; then
    echo "Native deployment readiness check passed."
    exit 0
  fi
  sleep 2
done

echo "The application did not become ready within 60 seconds." >&2
systemctl --no-pager --full status pwfleet.service >&2 || true
exit 1
