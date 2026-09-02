#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 1 || "$1" != /* ]]; then
  echo "Usage: $0 /absolute/backup/directory" >&2
  exit 2
fi

app_env="${PWFLEET_APP_ENV_FILE:-/etc/pwfleet/app.env}"
[[ -r "$app_env" ]] || { echo "The protected application environment is unavailable." >&2; exit 1; }

set -a
source "$app_env"
set +a
export PGSSLMODE=verify-full
export PGSSLROOTCERT="$DATABASE_SSL_CA_FILE"

backup_root="$1"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install -d -m 0700 "$backup_root"
exec 9>"$backup_root/.backup.lock"
flock -n 9 || { echo "Another backup is already running." >&2; exit 1; }

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
stage="$(mktemp -d "$backup_root/.pwfleet-backup-${timestamp}.XXXXXX")"
cleanup() { rm -rf -- "$stage"; }
trap cleanup EXIT

pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges > "$stage/database.dump"
tar -C "$FILE_STORAGE_ROOT" -czf "$stage/uploads.tar.gz" .
cp "$repo_root"/migrations/*.sql "$stage/"
(
  cd "$stage"
  sha256sum database.dump uploads.tar.gz ./*.sql > SHA256SUMS
)

archive="$backup_root/pwfleet-${timestamp}.tar.gz"
tar -C "$stage" -czf "$archive" .
sha256sum "$archive" > "$archive.sha256"
echo "Backup created: $archive"
