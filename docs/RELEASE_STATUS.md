# Release Status

Status date: 2026-09-02

## Release candidate and native server preparation

The repository is complete as a local Linux production release candidate. Current observed evidence:

- lint, TypeScript, all 43 unit tests, and the optimized Next.js standalone build pass locally and on the Ubuntu target;
- configurable form-family creation, empty-draft rendering, and protected unused-draft deletion passed a local API/database lifecycle check with exact QA cleanup;
- dependency audit reports no known vulnerability;
- all 20 checksum-locked migrations are represented in the release;
- critical safety-case, report-delivery, vehicle-dossier, notification, and retention QA cycles pass with cleanup;
- all 15 findings from standard security scan `95a72566-8a1a-430f-9e4b-1170b61dccb3` have focused remediation verification;
- the native Ubuntu web service runs the supported standalone artifact, and the scheduled worker executes directly under the restricted `pwfleet` account;
- production configuration validation runs before migrations, and the full preflight runs before the application is made ready;
- no embedded private key, common provider token, hardcoded credential assignment, or public secret variable was detected.

Responsive Chrome inspection confirmed the desktop dashboard, mobile navigation, QR-to-vehicle routing, blocked-vehicle messaging, and both source-form variants. It also led to corrections for blocked inspection launch and stale report-delivery copy. During the final automation session Chrome displayed the server-rendered pages but did not execute the Next.js client bootstrap, so interactive client controls must be observed again in the target browser/UAT environment; CSP was not weakened to bypass this condition.

The Ubuntu 24.04 target is deployed natively without Docker. Node.js 24, PostgreSQL 16, ClamAV, the dedicated `pwfleet` system account, protected application directories, local PostgreSQL TLS, systemd units, and the Git checkout are installed. The application and worker timer are enabled and active. Production contains only the two supplied form families, two vehicle classes, 10 sections, and 63 fields; it contains no sample vehicles or users. The existing Cloudflare tunnel route points the public hostname to the loopback application port.

No Azure, Microsoft Entra ID, Exchange Online, Microsoft 365, or Cloudflare control-plane setting was changed. Secure local authentication and non-delivery email capture are active, and public HTTPS login was observed successfully through the existing Cloudflare route. Administrators can now configure and validate Microsoft authentication and Microsoft 365 SMTP from the application; provider secrets are write-only, encrypted at rest, and never returned to the browser.

## Production trial status

The native production environment is **READY FOR CONTROLLED OPERATIONAL TESTING** with local authentication and capture-only email. Full organizational go-live still requires the following target-owned evidence:

- approved OIDC registration and observed verified-email first binding, role matrix, logout/revocation, and deactivated-user denial;
- approved SMTP relay with observed TLS verification, delivery, retry, and dead-letter monitoring;
- capacity monitoring, encrypted off-host backup ownership, and a restoration drill for the prepared least-privilege TLS PostgreSQL deployment;
- public HTTPS application verification through the existing Cloudflare route, security headers, request limits, and operational alerts after service activation;
- full database-plus-upload backup restored into an independently isolated target and reconciled;
- driver, supervisor, maintenance, fleet manager, administrator, and auditor interactive acceptance on supported mobile, tablet, and desktop browsers;
- PW approval of every form field, rule, blocking disposition, escalation, recipient, and pilot vehicle group;
- a protected release revision, deployment window, rollback evidence, and explicit authorization for final service activation.

Use `PRODUCTION_RUNBOOK.md` for execution and record every observed gate in `RELEASE_CHECKLIST.md`. Native target preparation, database initialization, Git commits, and pushes have been performed with authorization; no external email or identity-provider change has been performed.
