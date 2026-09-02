#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 2 || "$2" != "RESTORE-INTO-ISOLATED-TARGET" ]]; then
  echo "Usage: $0 /absolute/path/harvey-pw-fleet-backup.tar.gz RESTORE-INTO-ISOLATED-TARGET" >&2
  exit 2
fi
if [[ -z "${RESTORE_TARGET_DATABASE_URL:-}" || -z "${RESTORE_TARGET_UPLOADS_VOLUME:-}" ]]; then
  echo "RESTORE_TARGET_DATABASE_URL and RESTORE_TARGET_UPLOADS_VOLUME are required." >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
deploy_env="${FLEET_DEPLOY_ENV_FILE:-/etc/harvey-pw-fleet/deploy.env}"
if [[ ! -r "$deploy_env" ]]; then
  echo "The production deployment environment is required to prove target isolation." >&2
  exit 2
fi
production_uploads_volume="$(awk -F= '$1 == "FLEET_UPLOADS_VOLUME" { print $2 }' "$deploy_env" | tail -n 1)"
app_env="$(awk -F= '$1 == "FLEET_APP_ENV_FILE" { sub(/^[^=]*=/, ""); print }' "$deploy_env" | tail -n 1)"
if [[ -z "$production_uploads_volume" || "$production_uploads_volume" == *[!A-Za-z0-9_.-]* || "$app_env" != /* || ! -r "$app_env" ]]; then
  echo "Production database and upload identities cannot be resolved safely." >&2
  exit 2
fi
production_database_url="$(awk -F= '$1 == "DATABASE_URL" { sub(/^[^=]*=/, ""); print }' "$app_env" | tail -n 1)"
if [[ -z "$production_database_url" ]]; then
  echo "The production database identity cannot be resolved safely." >&2
  exit 2
fi
if [[ "$RESTORE_TARGET_UPLOADS_VOLUME" == "$production_uploads_volume" || "$RESTORE_TARGET_DATABASE_URL" == "$production_database_url" ]]; then
  echo "A production database or uploads volume is forbidden as a restore-drill target." >&2
  exit 2
fi
if [[ "$RESTORE_TARGET_UPLOADS_VOLUME" == *[!A-Za-z0-9_.-]* ]]; then
  echo "RESTORE_TARGET_UPLOADS_VOLUME is invalid." >&2
  exit 2
fi

archive="$1"
if [[ "$archive" != /* || ! -r "$archive" || ! -r "$archive.sha256" ]]; then
  echo "The absolute backup path or its checksum file is unavailable." >&2
  exit 2
fi
sha256sum --check "$archive.sha256"

stage="$(mktemp -d)"
cleanup() { rm -rf -- "$stage"; }
trap cleanup EXIT
tar -C "$stage" -xzf "$archive"
(
  cd "$stage"
  sha256sum --check SHA256SUMS
)

docker run --rm -i -e DATABASE_URL="$RESTORE_TARGET_DATABASE_URL" -v "$stage:/restore:ro" postgres:17.6-alpine pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$RESTORE_TARGET_DATABASE_URL" /restore/database.dump
docker volume create "$RESTORE_TARGET_UPLOADS_VOLUME" >/dev/null
docker run --rm --read-only -v "$RESTORE_TARGET_UPLOADS_VOLUME:/restore-target" -v "$stage:/backup:ro" node:24-bookworm-slim sh -c 'test -z "$(find /restore-target -mindepth 1 -print -quit)" && tar -C /restore-target -xzf /backup/uploads.tar.gz'
echo "Restore drill completed in the isolated database and uploads volume. Run application smoke tests before recording acceptance."
