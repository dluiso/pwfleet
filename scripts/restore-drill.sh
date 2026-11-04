#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 2 || "$2" != "RESTORE-INTO-ISOLATED-TARGET" ]]; then
  echo "Usage: $0 /absolute/path/pwfleet-backup.tar.gz RESTORE-INTO-ISOLATED-TARGET" >&2
  exit 2
fi
if [[ -z "${RESTORE_TARGET_DATABASE_URL:-}" || -z "${RESTORE_TARGET_UPLOADS_PATH:-}" ]]; then
  echo "RESTORE_TARGET_DATABASE_URL and RESTORE_TARGET_UPLOADS_PATH are required." >&2
  exit 2
fi
if [[ "$RESTORE_TARGET_UPLOADS_PATH" != /* || "$RESTORE_TARGET_UPLOADS_PATH" == "/" ]]; then
  echo "RESTORE_TARGET_UPLOADS_PATH must be a specific absolute path." >&2
  exit 2
fi

app_env="${PWFLEET_APP_ENV_FILE:-/etc/pwfleet/app.env}"
[[ -r "$app_env" ]] || { echo "The protected production environment is unavailable." >&2; exit 2; }
set -a
source "$app_env"
set +a

if [[ "$RESTORE_TARGET_DATABASE_URL" == "$DATABASE_URL" || "$RESTORE_TARGET_UPLOADS_PATH" == "$FILE_STORAGE_ROOT" ]]; then
  echo "A production database or storage path is forbidden as a restore-drill target." >&2
  exit 2
fi
if [[ -e "$RESTORE_TARGET_UPLOADS_PATH" && -n "$(find "$RESTORE_TARGET_UPLOADS_PATH" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
  echo "The isolated restore storage path must be empty." >&2
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

PGSSLMODE="${RESTORE_TARGET_DATABASE_SSL_MODE:-verify-full}" \
PGSSLROOTCERT="${RESTORE_TARGET_DATABASE_SSL_CA_FILE:-$DATABASE_SSL_CA_FILE}" \
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$RESTORE_TARGET_DATABASE_URL" "$stage/database.dump"
install -d -m 0700 "$RESTORE_TARGET_UPLOADS_PATH"
tar -C "$RESTORE_TARGET_UPLOADS_PATH" -xzf "$stage/uploads.tar.gz"
echo "Native restore drill completed in the isolated database and storage path. Run application reconciliation before recording acceptance."
