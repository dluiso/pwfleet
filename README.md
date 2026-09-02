# Harvey PW Fleet

Mobile-first fleet inspection and vehicle-readiness application for the City of Harvey Public Works Department.

## Current milestone

The repository is a locally verified production release candidate. It includes:

- vehicle inventory with internal unit numbers and optional display codes such as `DT-03`;
- one revocable, non-authenticating QR identifier per vehicle;
- administrator workflows to create and update vehicles, automatically issue or replace QR labels, and preserve QR audit history;
- user administration for all six application roles, with self-lockout and last-administrator protections;
- published-form assignment and reversible assignment ending that preserves inspection history;
- form-definition review by section, field, exception rule, operational disposition, and blocking behavior;
- immutable form version history with complete published-to-draft cloning as the foundation for the visual designer;
- administrator creation of independent form families from an empty draft, plus a focused draft builder with section navigation, field canvas, property inspector, searchable fields, separate logic editing, responsive live preview, settings, and publication readiness;
- configurable metadata, ordered sections and fields, field types, options, conditional visibility, exception rules, evidence requirements, notifications, severity, and vehicle disposition;
- saveable incomplete drafts, protected deletion of unused drafts, immutable published history, successor versioning, independent review, publication, assignment, and assignment-safe retirement;
- conditional field visibility that may reference only an earlier field, preventing circular dependencies and rejecting answers submitted for hidden fields;
- atomic draft saves with optimistic concurrency, structural-use guards, audit events, and fail-safe critical-rule validation;
- hash-bound review rounds with separate operations and governance approval lanes, self-review prevention, controlled publication, and assignment-safe retirement;
- optimistic concurrency protection for vehicle and user edits;
- QR-to-vehicle-to-assigned-form routing;
- versioned Dump Truck Pre-Trip and Standard Truck inspection templates;
- configurable response rules with fail-safe handling for unconfigured defects;
- driver, supervisor, fleet, maintenance, administrator, and auditor permission definitions;
- inspection submission, defects, vehicle disposition, audit events, and notification outbox;
- an active safety-case workbench with supervisor acknowledgment/hold decisions, maintenance assignment, technician custody, repair completion, independent reinspection, and supervisor-only release;
- append-only safety-case activity history, optimistic concurrency, role-specific actions, and automatic driver/technician case notifications;
- configurable maintenance priority and target-resolution SLA, overdue indicators, service-provider and work-order references;
- structured labor, parts, external-service, cost, and time records with audit history;
- protected maintenance evidence galleries for normalized repair photos, invoices, and receipts;
- secure image normalization and storage for inspection evidence;
- individual inspection PDF export;
- aggregate filtered PDF/CSV reports, manual delivery, daily/weekly/monthly/annual subscriptions, retry, dead-letter tracking, and a no-send capture mode for development;
- an in-app notification center with required acknowledgment, configurable maintenance escalation, reassignment, estimates, and approval thresholds;
- a complete vehicle dossier with asset data, a primary image, controlled documents, expiration alerts, inspection history, maintenance labor/cost history, and evidence-preserving retirement;
- OIDC Authorization Code + PKCE authentication, verified first-binding email, encrypted short-lived tokens backed by revocable server sessions, secure cookies, local authorization, immutable provider identity binding, logout, and login auditing;
- PostgreSQL-backed request throttling, per-actor upload quotas, bounded image/PDF processing, nonce-based CSP, security headers, fail-closed ClamAV upload scanning in production, storage capacity thresholds, and automated retention;
- English responsive UI for phone, tablet, and desktop;
- native Ubuntu services under a dedicated `pwfleet` account, systemd web/worker units, PostgreSQL TLS, ClamAV, production preflight, backup tooling, and an optional container topology for other environments.

No real production deployment has been performed. Production credentials, the approved identity provider and SMTP relay, a TLS-enabled PostgreSQL target, DNS/TLS, an observed backup restoration, and City of Harvey user acceptance remain external release gates. See [Release Status](docs/RELEASE_STATUS.md), [Production Runbook](docs/PRODUCTION_RUNBOOK.md), and [Release Checklist](docs/RELEASE_CHECKLIST.md).

## Local development

Requirements:

- Node.js 24 or newer;
- pnpm 11;
- Docker or Colima for PostgreSQL.

Copy `.env.example` to `.env.local`. The example contains no secret values and is configured for the local PostgreSQL container.

```bash
docker compose up -d postgres
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open `http://localhost:3000`. Development authentication uses the explicit `DEV_ACTOR_EMAIL` identity and is rejected when `NODE_ENV=production`.

Useful checks:

```bash
pnpm check
pnpm audit --audit-level moderate
pnpm qa:create-inspection
pnpm qa:safety-cycle
pnpm qa:report-delivery
pnpm qa:vehicle-dossier
pnpm notifications:process
```

All QA mutation scripts refuse to run in production and remove their exact temporary records and files. `notifications:process` captures messages without external delivery while `EMAIL_MODE=capture`.

## Configuration and secrets

All environment variables are validated at runtime. Do not commit `.env.local`, production environment files, certificates, credentials, or tokens.

Production validation requires:

- `APP_BASE_URL` using HTTPS;
- `DATABASE_SSL_MODE=require` and an approved CA bundle mounted read-only into the containers;
- `AUTH_MODE=local` with an independent high-entropy `AUTH_SECRET`, or `AUTH_MODE=oidc` with issuer, client ID, client secret, and `AUTH_SECRET`;
- no `DEV_ACTOR_EMAIL`;
- trusted reverse-proxy client headers, with `TRUSTED_CLIENT_IP_HEADER` set to the single header overwritten by that proxy;
- persistent file storage and `FILE_SCANNING_MODE=clamav` with a reachable scanner;
- either non-delivery `EMAIL_MODE=capture`, or SMTP configuration with explicit unauthenticated relay, password, or OAuth2 client-credentials authentication. Native Microsoft 365 deployments use OAuth2.

Values prefixed with `NEXT_PUBLIC_` are intentionally avoided for secrets because those values are embedded in browser JavaScript at build time.

## Linux deployment direction

The selected production topology for the City of Harvey Ubuntu host is:

```text
Internet -> Cloudflare Tunnel -> Next.js on 127.0.0.1:3000 -> local TLS PostgreSQL
                             |-> persistent evidence storage
                             |-> local ClamAV
systemd timer -> one-shot worker ---------------------------> approved SMTP relay
```

The native service binds only to loopback, runs as the unprivileged `pwfleet` account, and uses systemd filesystem, device, kernel, and privilege restrictions. PostgreSQL accepts only local connections and uses hostname-validated TLS. Its backup, capacity, and restoration policy still requires an accountable operator.

Deploy the accepted checkout on Ubuntu with:

```bash
sudo PWFLEET_APP_ENV_FILE=/etc/pwfleet/app.env ./scripts/deploy-native-ubuntu.sh
```

The deployment bootstraps only the two supplied inspection form families and their vehicle classes. It does not create sample vehicles, drivers, assignments, or QR codes. Re-running the catalog bootstrap is idempotent and does not overwrite forms that already exist.

Production supports two authentication modes. `local` provides a temporary, database-backed sign-in with scrypt password hashing, encrypted cookies, server-side session revocation, and database rate limits. The initial password is read only from standard input by `pnpm db:bootstrap-local-password`; it must never be placed in an environment file or command argument. `oidc` replaces the login entry point with Microsoft Entra while preserving users, roles, fleet records, and audit history. `EMAIL_MODE=capture` keeps notification work inside the application until SMTP is approved; it does not deliver messages externally.

Do not deploy until every environment-specific gate in the release checklist has observed evidence and explicit deployment approval has been given.

## Data and safety model

- A QR code contains only a random public identifier and never a VIN, password, token, driver identity, or authorization grant.
- Authentication and authorization are still required after scanning.
- Vehicle unit numbers remain strings so values such as `03` keep their leading zero.
- Display codes such as `DT-03` are operational labels; immutable UUIDs remain the database keys.
- Published form versions are treated as immutable. Future edits will create a draft successor version rather than change the meaning of historical inspections.
- Form definitions are stored in PostgreSQL and managed from `Form Reviews`; the supplied paper forms are development seed examples, not runtime-coded screens. Administrators can create a new form family, build it from empty, publish it after review, and assign it to one or more vehicles.
- Only an unpublished draft with no assignment or inspection history may be physically deleted. Published versions are retired so historical PDFs and inspections retain their original meaning.
- A review round locks the draft to a SHA-256 definition hash. Publication requires approvals for that exact hash from both an operations reviewer and a different eligible governance reviewer.
- Published versions cannot be retired while an active vehicle assignment still references them.
- A driver may inspect multiple vehicles and a vehicle may be used by multiple drivers.
- An unconfigured defect is automatically treated as a major issue, blocks departure, and requires supervisor review.
- Draft rule sets block vehicle release even when every answer passes.
- Critical rules can notify the driver, supervisor, fleet manager, and maintenance recipients.
- Vehicle disposition is never automatically downgraded by a less-restrictive inspection.
- Only supervisors, fleet managers, or administrators may release a safety case; a blocking defect always prevents release.
- Repair completion moves a vehicle only to `Ready for Reinspection`. A clean reinspection still requires an explicit supervisor release decision.

## Report and email handling

Every submitted inspection has a server-generated PDF route. The PDF is derived from the immutable submitted template version and stored answers; it is not trusted from browser HTML.

The notification outbox uses deterministic event keys and message IDs. A single-worker advisory lock prevents overlapping processors. Delivery uses exponential retry, records failed attempts, and moves exhausted messages to a visible dead-letter state. Report artifacts and orphaned uploads follow automated retention rules.

Fleet exports have configurable database row, PDF detail, render-concurrency, and queue limits. A capped export is marked explicitly so it cannot be mistaken for a complete reconciliation. CSV cells that could be interpreted as spreadsheet formulas are neutralized.
