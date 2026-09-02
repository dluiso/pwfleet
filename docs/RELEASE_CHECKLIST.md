# Production Release Checklist

Each gate requires observed evidence. “Configured” without a test is not acceptance.

## Code and artifacts

- [ ] Clean reviewed release diff; no secrets, local environment files, debug output, or unrelated files.
- [ ] `pnpm install --frozen-lockfile`, `pnpm check`, dependency audit, and production Docker builds pass from a clean checkout.
- [ ] All migrations apply to a production-like empty database and an upgrade copy; applied checksums match source.
- [ ] Safety-cycle, report-delivery, vehicle-dossier, notification retry, PDF, CSV, and storage cleanup QA pass with exact cleanup.
- [x] The 15 findings from standard scan `95a72566-8a1a-430f-9e4b-1170b61dccb3` have focused source/test verification recorded in `SECURITY_REMEDIATION.md`; environment-specific security acceptance remains below.

## Identity and authorization

- [ ] OIDC discovery, PKCE login, nonce/state validation, identity binding, logout, expiry, secret rotation, and deactivated-user denial are observed.
- [ ] Driver, supervisor, fleet manager, maintenance technician, administrator, and auditor accounts each pass positive and negative authorization tests.
- [ ] At least two administrators exist under the approved continuity policy; self-lockout and last-administrator guards pass.
- [ ] QR scans disclose no secret or vehicle PII and require a valid application session.

## Operational safety

- [ ] PW approves every form field, conditional rule, severity, blocking disposition, notification recipient, escalation time, and estimate threshold.
- [ ] Critical defect alerts reach driver and responsible staff; required acknowledgment is visible.
- [ ] A blocked vehicle cannot be released without repair, clean reinspection, and authorized release.
- [ ] Reassignment, estimate approval/rejection, evidence, labor, parts, costs, and full audit history pass multi-user concurrency tests.

## Reports and communications

- [ ] PDF and CSV totals reconcile to source records in the configured Chicago time zone.
- [ ] Daily, weekly, monthly, and annual schedules execute once across DST boundaries.
- [ ] Manual and scheduled emails reach approved recipients with the correct attachment; retry and dead-letter monitoring is assigned.
- [ ] Vehicle registration/insurance/warranty expiration alerts reach fleet owners and expired records require acknowledgment.

## Infrastructure and recovery

- [ ] Public DNS/TLS, nginx request limits, forwarded-header replacement, loopback-only app binding, CSP, HSTS, and security headers are observed.
- [ ] PostgreSQL TLS and CA validation, least privilege, capacity, monitoring, and encrypted backup retention are approved.
- [ ] Persistent uploads survive container replacement; ClamAV rejects the EICAR test file in a controlled non-production test.
- [ ] `/api/live` and `/api/ready` alerts reach an accountable operator.
- [ ] A full database-plus-upload backup restores into an isolated target and sampled files/hashes/PDFs reconcile.
- [ ] Rollback and incident-response exercises are recorded.

## Acceptance and rollout

- [ ] Mobile phone, tablet, and desktop testing passes on supported browsers and accessibility checks.
- [ ] A small, named vehicle group completes the pilot, including driver handovers and offline/poor-connectivity procedures.
- [ ] City of Harvey PW designates application, fleet-safety, identity, SMTP, database, backup, and support owners.
- [ ] City of Harvey PW signs user acceptance and authorizes the production deployment window.
