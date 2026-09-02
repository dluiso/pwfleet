#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /absolute/backup/directory" >&2
  exit 2
fi

backup_root="$1"
if [[ "$backup_root" != /* ]]; then
  echo "Backup directory must be an absolute path." >&2
  exit 2
fi

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

mkdir -p "$backup_root"
exec 9>"$backup_root/.backup.lock"
if ! flock -n 9; then
  echo "Another backup is already running." >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
stage="$(mktemp -d "$backup_root/.fleet-backup-${timestamp}.XXXXXX")"
cleanup() { rm -rf -- "$stage"; }
trap cleanup EXIT

compose=(docker compose --env-file "$deploy_env" -f compose.production.yaml)
"${compose[@]}" --profile tools run --rm -T db-tools 'pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges' > "$stage/database.dump"

uploads_volume="$(awk -F= '$1 == "FLEET_UPLOADS_VOLUME" { print $2 }' "$deploy_env" | tail -n 1)"
if [[ -z "$uploads_volume" || "$uploads_volume" == *[!A-Za-z0-9_.-]* ]]; then
  echo "FLEET_UPLOADS_VOLUME is missing or invalid." >&2
  exit 1
fi
docker run --rm --read-only -v "$uploads_volume:/data:ro" node:24-bookworm-slim tar -C /data -czf - . > "$stage/uploads.tar.gz"

cp migrations/*.sql "$stage/"
(
  cd "$stage"
  sha256sum database.dump uploads.tar.gz ./*.sql > SHA256SUMS
)
archive="$backup_root/harvey-pw-fleet-${timestamp}.tar.gz"
tar -C "$stage" -czf "$archive" .
sha256sum "$archive" > "$archive.sha256"
echo "Backup created: $archive"
