# Security Remediation Record

## Review scope

Standard repository scan `95a72566-8a1a-430f-9e4b-1170b61dccb3` reviewed the complete local source snapshot before production release work. It reported 15 validated findings: two high, ten medium, and three low. The original scan did not exercise a real identity provider, SMTP relay, TLS database, public reverse proxy, or restore target.

## Current disposition

All 15 original exploit paths were traced again after remediation and are closed in the current checkout:

- vehicle and active safety-case state are serialized inside inspection and maintenance transactions;
- release requires an approved rule set, a non-blocking authoritative disposition, and no open blocking defect;
- last-administrator changes use a transaction advisory lock, and self email, role, activation, and identity-binding changes are blocked;
- production cookie creation and deletion share valid `__Host-` attributes;
- encrypted cookies identify revocable, expiring PostgreSQL sessions validated on every authenticated request;
- first OIDC binding accepts only an actual verified `email` claim, while later sign-in uses immutable issuer and subject;
- inspection and maintenance evidence claims are single-use conditional updates, coordinated with a `pending` to `purging` retention claim;
- QR identifiers must be active and belong to the active vehicle being inspected;
- inspection and administrative odometer updates cannot lower or overwrite a newer value;
- uploads have actor quotas, global processing concurrency and queue limits, decode pixel limits, malware scanning, and a storage free-space threshold;
- fleet data and PDF detail are capped, related data is aggregated in SQL, rendering is admission-controlled, and truncated reports identify their scope;
- SMTP requires TLS when implicit TLS is not selected, validates certificates, and requires TLS 1.2 or newer.

Verification evidence completed through 2026-09-01 included lint, TypeScript, 35 unit tests, optimized production build, safety-case lifecycle QA, report-delivery QA, vehicle-dossier QA, and notification/retention worker execution. Environment-specific penetration, identity-provider, SMTP, database CA, reverse-proxy, and recovery tests remain release gates and must be recorded in `RELEASE_CHECKLIST.md` on the target infrastructure.
