# Implementation Plan

## Phase 1 - Operational foundation (completed locally)

- Establish the vehicle, class, QR, user, role, inspection, defect, attachment, notification, and audit data model.
- Digitize the two supplied paper forms as separate versioned templates.
- Route each active vehicle QR to the vehicle record and currently assigned form.
- Deliver an English mobile-first driver workflow and basic fleet administration views.
- Generate individual inspection PDFs and capture alert emails without external delivery.
- Validate a reproducible Linux container build.

Exit evidence: migrations and seed complete, unit tests pass, main routes pass browser smoke testing, QR routing is verified, a sample inspection produces a rendered PDF, and no dependency audit finding exists at moderate or higher severity.

## Phase 2 - Identity, administration, and rule approval (implemented locally)

- Completed locally: validated vehicle and user administration, automatic QR issuance/replacement, published-form assignment, reversible assignment ending, audit events, and optimistic edit concurrency.
- Completed locally: server-side administration data access, same-origin mutation checks, JSON type/size limits, and role-based authorization on every administration endpoint.
- Completed locally: form-definition and rule review, immutable version history, and transactional cloning of a published form into a complete draft successor.
- Completed locally: draft-only visual editing of sections, fields, options, exception rules, evidence requirements, notifications, severity, and disposition with atomic saves and optimistic concurrency.
- Completed locally: conditional field visibility with earlier-field-only references, client/server evaluation parity, and rejection of hidden-field submissions.
- Completed locally: hash-bound review rounds, independent operations and governance decisions, self-review prevention, controlled publication, review history, and assignment-safe retirement.
- Completed locally: provider-neutral OIDC Authorization Code + PKCE, signed provider-token verification, encrypted sessions, secure cookies, logout, identity binding/revocation, and authentication audit events. Real-provider acceptance remains external.
- Completed locally: vehicle asset dossier, controlled images/documents, expiration alerts, and operational/maintenance history. Vehicle-class creation remains an administrator seed/configuration task rather than an end-user workflow.
- QR replacement remains audited and preserves historical labels; a dedicated visual replacement timeline is a post-pilot enhancement because current operational pages show the active label and audit records preserve prior events.
- Complete multi-user acceptance testing for the dual-control workflow after OIDC identities and group mappings are available.

Design constraint: a published template is immutable. Any form or rule change creates a draft successor version, and vehicle assignments remain pinned until that version is reviewed and published.

Administrators can also create an independent form family from an empty draft. Drafts may be saved while incomplete; review readiness requires at least one section, one field, a required attestation, and explicit defect handling for each Pass/Defect/N/A field. Only unused drafts may be deleted. Published versions are retired rather than deleted.

Exit evidence: OIDC and RBAC acceptance tests pass; development bypass is absent from production; authorized PW representatives approve every release rule and recipient group.

## Phase 3 - Maintenance and supervisor workflow

- Completed locally: supervisor workbench with acknowledgment, explicit hold, maintenance routing, and guarded release actions.
- Completed locally: technician assignment, repair start/completion notes, independent reinspection linking, failed-reinspection return to maintenance, and supervisor-only release.
- Completed locally: append-only chain of custody from source inspection through repair, reinspection, release, audit events, and captured email notifications.
- Completed locally: configurable priority and target-resolution SLA, overdue indicators, service-provider/work-order references, labor, parts, external services, costs, and protected evidence attachments.
- Completed locally: maintenance totals integrated into the workbench and reports snapshot, with end-to-end lifecycle coverage and exact QA cleanup.
- Completed locally: in-app notifications and acknowledgment tracking for drivers and responsible parties.
- Completed locally: configurable escalation reminders, reassignment, estimates/approvals, and manager exception handling.

Exit evidence: no blocked vehicle can return to service without the configured approvals; concurrency and authorization tests cover every state transition.

## Phase 4 - Reporting and scheduled delivery (implemented locally)

- Completed locally: daily, weekly, monthly, annual, and custom-range fleet reports.
- Completed locally: filters for vehicle, class, driver, form, severity, disposition, and maintenance status. Defect category remains represented through severity and maintenance case filtering until PW defines a controlled category taxonomy.
- Completed locally: PDF and CSV with timezone, filters, generation timestamp, and source identifiers.
- Completed locally: administrator-managed subscriptions, schedules, registered recipients, manual delivery, and delivery history.
- Completed locally: idempotency, retry, dead-letter status, and worker results suitable for systemd monitoring.

Exit evidence: aggregate totals reconcile to source records; scheduled delivery is idempotent; recipients and attachment contents pass acceptance tests.

## Phase 5 - Production hardening and Linux deployment (release candidate implemented)

- Completed in repository: hardened app/worker containers, production Compose, nginx template, systemd worker timer, fail-closed environment validation, and production preflight.
- Completed in repository: nonce CSP, HSTS/security headers, persistent request throttling, controlled file handling, mandatory production ClamAV, and storage retention.
- Completed in repository: checksum-locked migrations, liveness/readiness, backup artifact generation, and a guarded isolated restore-drill tool.
- Completed in repository: remediation and focused verification of all 15 findings from standard security scan `95a72566-8a1a-430f-9e4b-1170b61dccb3`; target-environment security acceptance remains external.
- Verified locally: lint, type checking, unit tests, optimized build, safety/report/dossier QA, responsive server-rendered layouts, QR/form routing, and fail-closed container behavior. Full interactive browser and role-matrix acceptance remains an environment gate.
- External gate: provision real secrets/services, observe provider/SMTP/database/TLS behavior, perform a restoration exercise, run all-role acceptance, rehearse incident response, and approve the PW pilot.

Exit evidence: release checklist is signed, backups restore successfully, rollback is rehearsed, monitoring alerts reach the responsible team, and PW accepts the pilot.
