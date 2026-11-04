#!/usr/bin/env bash
set -euo pipefail

config_file="${PWFLEET_BACKUP_CONFIG_FILE:-/etc/pwfleet/backup.env}"
if [[ -r "$config_file" ]]; then
  set -a
  source "$config_file"
  set +a
fi

backup_root="${PWFLEET_BACKUP_ROOT:-/var/backups/pwfleet}"
[[ "$backup_root" == /* && "$backup_root" != "/" ]] || { echo "PWFLEET_BACKUP_ROOT must be a specific absolute path." >&2; exit 2; }
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup-native-production.sh" "$backup_root"
