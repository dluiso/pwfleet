# Release Status

Status date: 2026-11-04

## Release candidate and native server preparation

The repository is complete as a local Linux production release candidate. Current observed evidence:

- lint, TypeScript, all 44 unit tests, the optimized Next.js standalone build, and 15 Playwright smoke scenarios across desktop/tablet/mobile layouts pass locally;
- configurable form-family creation, empty-draft rendering, and protected unused-draft deletion passed a local API/database lifecycle check with exact QA cleanup;
- the production dependency audit reports no known vulnerability;
- all 22 checksum-locked migrations are represented in the release;
- critical safety-case, report-delivery, vehicle-dossier, notification, and retention QA cycles pass with cleanup;
- all 15 findings from standard security scan `95a72566-8a1a-430f-9e4b-1170b61dccb3` have focused remediation verification;
- the native Ubuntu web service runs the supported standalone artifact, and the scheduled worker executes directly under the restricted `pwfleet` account;
- production configuration validation runs before migrations, and the full preflight runs before the application is made ready;
- no embedded private key, common provider token, hardcoded credential assignment, or public secret variable was detected.
- vehicle profiles now expose form assignment directly, and every published version is validated and immediately available in the assignment selector;
- local user administration now supports password creation/reset with session revocation, accurate authentication-state messaging, manager-scoped role protections, and controlled deletion of accounts without operational history.
- the November dependency security refresh updates Next.js, Nodemailer, Sharp, Zod, Vitest, Vite, source-map-js, brace-expansion, and their lockfile graph so production dependencies have no known `pnpm audit --prod` findings; lint, type generation, all tests, and the standalone production build pass after the refresh. The full development audit retains one transitive `minimatch` advisory in the ESLint toolchain because the affected consumers still require the older API; a global major-version override was rejected after a focused compatibility reproduction demonstrated a real ESLint plugin regression.
- production keeps Next.js 16.4's experimental shared Turbopack runtime disabled because its bootstrap script is emitted without the request nonce and the enforced CSP correctly blocks it, preventing React hydration. The ordinary Turbopack runtime preserves the strict nonce policy and restores interactive controls without allowing unsafe inline scripts.
- the Fleet registry actions are operational: **Add vehicle** opens the administrative creation form directly, and **Print QR batch** renders every active fleet label on its own printable page instead of presenting inert controls.
- vehicle classes are managed from the application, bulk vehicle registration is an atomic CSV workflow, vehicle profiles show QR replacement history, and form-builder sections and fields can be duplicated without hardcoded definitions;
- the administration control center includes a centralized audit trail and a read-only pilot-readiness dashboard that identifies unpublished forms, assignments, role coverage, and deferred integrations without creating or changing users;
- inspection entry retains an in-session recovery draft, blocks submission when offline, and publishes PWA install/offline metadata without caching protected APIs or authentication routes;
- native systemd backup and readiness-monitor timers, configurable retention, and a guarded native isolated-restore tool are included in the deployment artifact.

Responsive Chrome inspection confirmed the desktop dashboard, mobile navigation, QR-to-vehicle routing, blocked-vehicle messaging, and both source-form variants. It also led to corrections for blocked inspection launch and stale report-delivery copy. Browser acceptance after every framework upgrade must include an authenticated client interaction, not only server-rendered page visibility; CSP must never be weakened to make that check pass.

The Ubuntu 24.04 target is deployed natively without Docker. Node.js 24, PostgreSQL 16, ClamAV, the dedicated `pwfleet` system account, protected application directories, local PostgreSQL TLS, systemd units, and the Git checkout are installed. The application and worker timer are enabled and active. The two supplied form families and vehicle classes remain the bootstrapped catalog; production now also contains administrator-created trial users and vehicles used for controlled acceptance. The existing Cloudflare tunnel route points the public hostname to the loopback application port.

The September 15 user-administration and vehicle-assignment usability changes were deployed to the Ubuntu target and verified through the public application. Subsequent releases, including dependency security maintenance, use the same guarded native deployment command and independent post-deployment health checks.

No Azure, Microsoft Entra ID, Exchange Online, Microsoft 365, or Cloudflare control-plane setting was changed. Secure local authentication and non-delivery email capture are active, and public HTTPS login was observed successfully through the existing Cloudflare route. Administrators can now configure and validate Microsoft authentication and Microsoft 365 SMTP from the application; provider secrets are write-only, encrypted at rest, and never returned to the browser.

## Production trial status

The native production environment is **READY FOR CONTROLLED OPERATIONAL TESTING** with local authentication and capture-only email. Full organizational go-live still requires the following target-owned evidence:

- approved OIDC registration and observed verified-email first binding, role matrix, logout/revocation, and deactivated-user denial;
- approved SMTP relay with observed TLS verification, delivery, retry, and dead-letter monitoring;
- encrypted off-host backup ownership and an observed restoration drill for the prepared least-privilege TLS PostgreSQL deployment;
- public HTTPS application verification through the existing Cloudflare route, security headers, request limits, and operational alerts after service activation;
- full database-plus-upload backup restored into an independently isolated target and reconciled;
- driver, supervisor, maintenance, fleet manager, administrator, and auditor interactive acceptance on supported mobile, tablet, and desktop browsers;
- PW approval of every form field, rule, blocking disposition, escalation, recipient, and pilot vehicle group;
- a protected release revision, deployment window, rollback evidence, and explicit authorization for final service activation.

Use `PRODUCTION_RUNBOOK.md` for execution and record every observed gate in `RELEASE_CHECKLIST.md`. Native target preparation, database initialization, Git commits, and pushes have been performed with authorization; no external email or identity-provider change has been performed.
