# Production Runbook

This runbook covers the native Ubuntu deployment of City of Harvey PW Fleet. Docker is not used.

## 1. Native production topology

```text
Internet -> Cloudflare Tunnel -> 127.0.0.1:3000 -> Next.js/systemd
                                              |-> PostgreSQL over local TLS
                                              |-> /var/lib/pwfleet
                                              |-> ClamAV local socket
systemd timer -> PW Fleet worker -> capture mode or approved Microsoft SMTP
```

The application runs as the unprivileged `pwfleet` system account. The checkout is `/opt/pwfleet`; the root-managed environment is `/etc/pwfleet/app.env`. The service binds only to loopback. Cloudflare owns the public HTTPS edge and forwards to `http://localhost:3000`.

## 2. Bootstrap configuration

Keep machine and secret material outside Git. The protected environment supplies the HTTPS base URL, database TLS connection, root encryption secret, storage limits, proxy trust, ClamAV socket, and safe bootstrap modes:

- `AUTH_MODE=local`
- `EMAIL_MODE=capture`
- `DEV_ACTOR_EMAIL` empty
- `TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip`

Microsoft and SMTP credentials are not placed in deployment files. They are entered later under **Administration > Microsoft & email integrations**, stored with authenticated encryption, and never returned to the browser.

## 3. Deploy an accepted revision

From a clean checkout as root:

```bash
cd /opt/pwfleet
git pull --ff-only origin main
PWFLEET_APP_ENV_FILE=/etc/pwfleet/app.env ./scripts/deploy-native-ubuntu.sh
```

The deployment restores locked dependencies, runs lint, TypeScript, unit tests and the production build, installs the systemd units, validates base configuration, applies checksum-locked migrations, bootstraps the form catalog and administrator, executes the full preflight, and starts the application and worker timer.

For the first local administrator only, set the password through the protected standard-input prompt:

```bash
set -a
source /etc/pwfleet/app.env
set +a
pnpm db:bootstrap-local-password
```

Never place that password in an argument, environment variable, shell history, Git, or documentation.

## 4. Acceptance checks

```bash
systemctl is-enabled pwfleet.service pwfleet-worker.timer
systemctl is-active pwfleet.service pwfleet-worker.timer
curl --fail http://127.0.0.1:3000/api/live
curl --fail http://127.0.0.1:3000/api/ready
```

Then verify through the public hostname: login, role, logout, dashboard, vehicle creation, QR download, each assigned form, critical hold behavior, maintenance review, PDF/CSV export, and responsive mobile/tablet/desktop layouts.

## 5. Microsoft and email activation

Keep local authentication and capture mode active until the tenant work in `MICROSOFT_MANUAL_CONFIGURATION.md` is complete. An administrator then enters the values in **Administration > Microsoft & email integrations**.

- Entra activation is restricted to the official Microsoft identity host, validates discovery, binds the current administrator Object ID, and revokes existing sessions.
- SMTP activation is restricted to `smtp.office365.com`, obtains an OAuth token when selected, verifies TLS and authentication, and saves only after validation succeeds.
- Capture mode never sends externally. SMTP activation allows the next worker runs to deliver newly pending notifications.

## 6. Scheduled work and monitoring

```bash
systemctl list-timers pwfleet-worker.timer
journalctl -u pwfleet.service --since today
journalctl -u pwfleet-worker.service --since today
```

Monitor the public HTTPS endpoint, `/api/live`, `/api/ready`, PostgreSQL capacity, storage capacity, ClamAV health/signature freshness, timer failures, dead-letter notifications, Microsoft login failures, and unusual throttling.

## 7. Backup and recovery

Use `scripts/backup-native-production.sh` with an operator-selected protected destination. It creates the database and file artifacts required by the native deployment. Encrypt and copy backups to the organization-approved off-host destination. Run restoration drills only against an isolated database and storage path; never point a drill at production.

Database migrations are forward-only. For rollback, stop writes, select a previously accepted Git revision only when it is compatible with the applied schema, rebuild and restart the native service. If compatibility is not established, restore the matching database and file backup as one recovery point.

## 8. Incident response

If a provider secret is suspected compromised, replace it through the integration screen and review audit events. If `AUTH_SECRET` is compromised, rotate it in the protected environment, replace every encrypted provider credential through Settings, restart both services, and invalidate all sessions. Do not weaken TLS, authentication, authorization, malware scanning, or audit controls to restore availability.
