# Production Runbook

This runbook prepares Harvey PW Fleet for a Debian or Ubuntu host. It does not authorize a deployment. Production writes, DNS changes, identity-provider registration, SMTP delivery, database migration, and restoration require the owner’s explicit approval and the credentials of the target environment.

## 1. Required services and ownership

- A supported Linux host with Docker Engine, the Docker Compose plugin, nginx, `envsubst`, and systemd.
- A dedicated HTTPS hostname and trusted TLS certificate.
- PostgreSQL 17 reachable over TLS. The supplied single-host topology keeps it on an internal-only Docker network with a dedicated persistent volume; use a dedicated application role and an encrypted backup policy owned by the organization.
- An OpenID Connect confidential client. Register exactly `${APP_BASE_URL}/auth/callback` as a redirect URI and `${APP_BASE_URL}/auth/login` as an allowed post-logout redirect.
- An approved SMTP relay and sender address.
- Disk or volume capacity for controlled vehicle documents, inspection evidence, and report artifacts.
- Named owners for application administration, identity, database, backups, SMTP, TLS, and incident response.

## 2. Prepare configuration

1. Install the repository at `/opt/harvey-pw-fleet` or update the supplied systemd unit if a different path is selected.
2. Create `/etc/harvey-pw-fleet` owned by root with mode `0700`.
3. Copy `deploy/app.env.example` to `/etc/harvey-pw-fleet/app.env`, fill every required value, set owner `root:root`, and mode `0600`.
4. Copy `deploy/database.env.example` to `/etc/harvey-pw-fleet/database.env`, set the dedicated database name, user, and password, and protect it with owner `root:root` and mode `0600`. Encode the same connection values in `DATABASE_URL`; do not use the PostgreSQL superuser for the application.
5. Copy `deploy/deploy.env.example` to `/etc/harvey-pw-fleet/deploy.env`, select immutable image tags or a controlled local build, and set mode `0600`.
6. Run `scripts/prepare-database-tls.sh` once as root. It creates an internal CA and a certificate valid only for the Docker DNS name `postgres`; the application validates that name and CA, and PostgreSQL backup tooling uses `verify-full`.
7. Generate `AUTH_SECRET` from at least 32 random bytes using the organization’s approved secret process. Store it only in the protected environment file or secret manager. Rotation invalidates every application session.
8. Set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_DISPLAY_NAME` for the initial administrator. The deploy script creates that record idempotently after migrations and refuses to add a second administrator outside the authenticated administration workflow.
9. Keep `DEV_ACTOR_EMAIL` empty. Production validation rejects development authentication, HTTP application URLs, database connections without TLS, untrusted proxy headers, and disabled malware scanning.

The application never auto-provisions a role from an external claim. The controlled bootstrap creates only the first local administrator authorization record; it creates no password. The first successful sign-in requires an actual OIDC `email` claim with `email_verified=true`, then binds that record to the provider’s issuer and immutable subject. Bound users are resolved by issuer and subject, not by mutable username claims. A later mismatch is denied until an administrator performs an audited identity-binding reset after independent verification. Logout revokes the server-side session row, so a copied cookie cannot be reused.

## 3. Reverse proxy

Render `deploy/nginx/harvey-pw-fleet.conf.template` with controlled values for hostname, certificate paths, and loopback port. Review the rendered file before installation, run `nginx -t`, and reload nginx only after validation. The template replaces any client-supplied forwarding chain with nginx’s observed address; this is required because `TRUST_PROXY_HEADERS=true` enables application request controls.

Do not expose container port 3000 publicly. The production Compose file binds it to `127.0.0.1`.

## 4. Database migration and deployment

The release procedure is fail-closed:

```bash
FLEET_DEPLOY_ENV_FILE=/etc/harvey-pw-fleet/deploy.env ./scripts/deploy-production.sh
```

The script builds the app and worker, starts the internal database and scanner, validates every security-sensitive configuration field and the mounted database CA before any database mutation, applies checksum-verified migrations under a PostgreSQL advisory lock, creates the initial administrator idempotently, runs the production preflight, starts the app, and waits for `/api/ready`. The full preflight validates every migration checksum, writable persistent storage, a reachable OIDC discovery document, ClamAV, SMTP authentication/relay availability, and at least one active administrator. It never sends an email.

After the command succeeds, verify through the public HTTPS URL:

- `/api/live` returns `200` when the process is alive.
- `/api/ready` returns `200` only when PostgreSQL, storage, and ClamAV are available.
- An unauthenticated application URL redirects to the approved identity provider.
- A registered test user signs in, sees the expected role, signs out, and cannot reuse the local session.

## 5. Scheduled work

Install the supplied one-shot worker service and timer, review both files, then enable the timer. The worker uses PostgreSQL advisory locks and deterministic keys, so overlapping attempts do not duplicate scheduled reports or escalations.

```bash
systemctl enable --now harvey-pw-fleet-worker.timer
systemctl list-timers harvey-pw-fleet-worker.timer
journalctl -u harvey-pw-fleet-worker.service --since today
```

Investigate a non-zero worker exit. Repeated email failures become dead-letter records; they are not silently discarded.

## 6. Backup and restoration

Run `scripts/backup-production.sh` from a controlled backup host with access to Docker and the application directory. It creates a PostgreSQL custom-format dump, an upload-volume archive, all migration sources, and SHA-256 manifests under an operator-selected absolute directory. Encrypt and copy the resulting artifacts to the approved backup destination; the script does not invent an encryption key or upload data externally.

Pause the scheduled worker during a backup window. For the strongest consistency guarantee, quiesce application writes or use coordinated database and filesystem snapshots.

`scripts/restore-drill.sh` reads the configured production database URL and upload-volume name, rejects either exact target, and requires an explicit confirmation phrase plus isolated target variables. Run it with `FLEET_DEPLOY_ENV_FILE` pointing to the protected production deployment file. It is destructive to the selected restore database and must never be pointed at production; use network and database permissions as an independent isolation boundary. After restoration, start a separate release-matched app against the restored targets and verify record counts, random inspection PDFs, vehicle documents, QR routing, and SHA-256 manifests. Record recovery time and recovery point evidence in the release checklist.

## 7. Monitoring and incident actions

Monitor:

- public HTTPS availability and certificate expiration;
- `/api/live` and `/api/ready` separately;
- worker exit status and runtime;
- PostgreSQL capacity, connections, replication, and backup age;
- upload-volume capacity and inode use;
- ClamAV health and signature freshness;
- SMTP failures and dead-letter count;
- OIDC discovery/login failures and unusual throttling.

If credentials or session integrity may be compromised, rotate `AUTH_SECRET` and the affected provider or SMTP secret, restart the containers, review authentication/audit events, and follow the organization’s incident process. Do not weaken TLS, scanning, authentication, or authorization to restore availability.

## 8. Rollback

Application images must be immutable and tagged. A code rollback may select the previously accepted app/worker images only when their database compatibility is documented. Database migrations are forward-only; do not manually reverse schema changes. If the prior release is incompatible, stop writes and restore the accepted database and upload snapshot as one recovery point.
