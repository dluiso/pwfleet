# Release Status

Status date: 2026-09-01

## Local release candidate

The repository is complete as a local Linux production release candidate. Current observed evidence:

- lint, TypeScript, 35 unit tests, and optimized Next.js build pass;
- configurable form-family creation, empty-draft rendering, and protected unused-draft deletion passed a local API/database lifecycle check with exact QA cleanup;
- dependency audit reports no known vulnerability;
- all 18 checksum-locked migrations are applied in the local upgrade database;
- critical safety-case, report-delivery, vehicle-dossier, notification, and retention QA cycles pass with cleanup;
- all 15 findings from standard security scan `95a72566-8a1a-430f-9e4b-1170b61dccb3` have focused remediation verification;
- app and worker images build from the current checkout, and native Ubuntu service definitions are provided;
- production Compose resolves with a read-only database CA mount and `verify-full` for PostgreSQL tools;
- the app container runs as `nextjs`; with deliberately invalid production configuration, liveness remains `200`, readiness is `503`, and protected application rendering fails closed;
- production configuration validation runs before migrations, and the full preflight runs before the application is made ready;
- no embedded private key, common provider token, hardcoded credential assignment, or public secret variable was detected.

Responsive Chrome inspection confirmed the desktop dashboard, mobile navigation, QR-to-vehicle routing, blocked-vehicle messaging, and both source-form variants. It also led to corrections for blocked inspection launch and stale report-delivery copy. During the final automation session Chrome displayed the server-rendered pages but did not execute the Next.js client bootstrap, so interactive client controls must be observed again in the target browser/UAT environment; CSP was not weakened to bypass this condition.

## Production go-live status

Actual go-live remains **NO-GO** until the following target-owned evidence exists:

- approved OIDC registration and observed verified-email first binding, role matrix, logout/revocation, and deactivated-user denial;
- approved SMTP relay with observed TLS verification, delivery, retry, and dead-letter monitoring;
- least-privilege PostgreSQL over validated TLS/CA, capacity monitoring, and encrypted backup ownership;
- public DNS, trusted certificate, nginx validation, security headers, request limits, and operational alerts;
- full database-plus-upload backup restored into an independently isolated target and reconciled;
- driver, supervisor, maintenance, fleet manager, administrator, and auditor interactive acceptance on supported mobile, tablet, and desktop browsers;
- PW approval of every form field, rule, blocking disposition, escalation, recipient, and pilot vehicle group;
- an immutable Git revision/image tag, deployment window, rollback evidence, and explicit authorization to deploy.

Use `PRODUCTION_RUNBOOK.md` for execution and record every observed gate in `RELEASE_CHECKLIST.md`. No deployment, external email, identity-provider change, Git commit, or push was performed by this local release-candidate workflow.
