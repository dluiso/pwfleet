#!/usr/bin/env bash
set -euo pipefail
umask 077

tls_dir="${1:-/etc/pwfleet/database-tls}"
if [[ "$tls_dir" != /* ]]; then
  echo "Database TLS directory must be an absolute path." >&2
  exit 2
fi

install -d -m 0755 "$tls_dir"
if [[ -e "$tls_dir/ca.key" || -e "$tls_dir/ca.crt" || -e "$tls_dir/server.key" || -e "$tls_dir/server.crt" ]]; then
  echo "Database TLS material already exists; no files were changed."
  exit 0
fi

work_dir="$(mktemp -d)"
cleanup() { rm -rf -- "$work_dir"; }
trap cleanup EXIT

openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 3650 \
  -subj "/CN=Harvey PW Fleet Database CA" \
  -keyout "$work_dir/ca.key" -out "$work_dir/ca.crt" >/dev/null 2>&1
openssl req -newkey rsa:3072 -sha256 -nodes \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" \
  -keyout "$work_dir/server.key" -out "$work_dir/server.csr" >/dev/null 2>&1
openssl x509 -req -sha256 -days 825 \
  -in "$work_dir/server.csr" -CA "$work_dir/ca.crt" -CAkey "$work_dir/ca.key" \
  -CAcreateserial -copy_extensions copy \
  -out "$work_dir/server.crt" >/dev/null 2>&1

install -m 0600 "$work_dir/ca.key" "$tls_dir/ca.key"
install -m 0644 "$work_dir/ca.crt" "$tls_dir/ca.crt"
install -m 0600 "$work_dir/server.key" "$tls_dir/server.key"
install -m 0644 "$work_dir/server.crt" "$tls_dir/server.crt"
if getent passwd postgres >/dev/null; then
  chown postgres:postgres "$tls_dir/server.key" "$tls_dir/server.crt"
fi
echo "Database TLS material created."
