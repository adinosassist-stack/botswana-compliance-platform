# Employee self-service v1 — protected, default-off development batch

## What is implemented
- A **separate employee identity** from the owner/manager/reviewer/auditor workspace. No new membership role and no access to company-wide workspace APIs.
- The owner/manager People module has employee invitations, task assignment, submitted-work review, and immediate account/session revocation.
- Employees receive a one-time 48-hour invitation **through a manager-controlled link** (not automatically emailed), choose a password and sign in via `/staff/`. Staff sees only their own assigned tasks.
- The allowed state machine is `assigned → in_progress → submitted → completed`; a manager can return a submitted task to `in_progress`. Submission is never self-approval.
- Separate tenant-scoped database records and task events. Task changes and their events commit in the same D1 batch with version and one-time transition markers.
- The employee task inbox shows the most recent non-empty manager review/return note; the manager People task list shows the employee's most recent non-empty progress/handover note. All notes are read only through a tenant- and employee-scoped task query; untrusted note content renders as text.

## Disabled unless separately qualified
`THEBE_STAFF_PORTAL_ENABLED` must be exactly `true`. No variable, public activation or migration execution is performed by this PR. Public staff routes return 404 when disabled.

When enabled, **both** `PUBLIC_RATE_LIMITER` and `SESSION_SECRET` are mandatory; otherwise the service refuses requests. Public mutations require the existing same-origin/fetch-metadata controls; employee task mutations also require a staff-session CSRF token. Manager routes remain behind the existing workspace session, origin and CSRF checks, and owner/manager role authorization.

## Security / privacy
- Staff credentials use a separate PBKDF2-SHA256 password hash and a separate HttpOnly, Secure, SameSite=Strict, 12-hour cookie. Session tokens and invitation tokens are random and stored as SHA-256 hashes, not in browser storage.
- The staff page reuses the centralized Thebe API client, but marks its HTML runtime as `staff` so the client does not redirect a protected staging hostname to production. A strict frontend route allowlist limits staff calls to `/public/employee/*`, and requests remain same-origin and HTTPS-only. The main workspace continues to enforce canonical production origin. Failed logout is never presented as successful.
- Invitations are single-use; resetting an account through a fresh manager invitation revokes old employee sessions. A manager can also revoke access immediately using People.
- Employees must be active within the same tenant on every authenticated request. Inactive/deleted employees lose portal access.
- No external messages, payroll transactions, employee scoring, disciplinary findings, pay calculation, company-wide reporting or automatic job execution.
- Existing `/report/` private-link daily reports and uploads remain separate. **Assignment photo uploads, staff MFA, email delivery, employee leave balances and full attendance check-in are not part of this v1.**
- Before production rollout: conduct privacy notice, record retention/access review (including task notes and audit history), security assessment and accessibility/mobile testing.

## Isolated Cloudflare D1 verification (8 November 2026)
- Database: `bw-employee-self-service-staging` (`adfa3871-5ecf-4672-8d2f-be9b142d5fc1`). The schema was applied to this separate D1; the production database was not written.
- The five portal tables and required indexes exist; `PRAGMA foreign_keys=1` and `PRAGMA foreign_key_check` reported zero violations.
- A second remote-D1 rehearsal inserted synthetic tenant A and B records and one synthetic assignment under tenant A. Tenant B task query returned **0**, tenant A returned **1**. The versioned update transitioned assigned to in_progress (version 1); the simulated stale-version update changed **0** rows; two immutable task audit events existed.
- All synthetic tenants, users, employees, tasks, and task events were deleted afterward. A fresh count of all eight relevant tables was **0**, and the foreign-key check remained clear.
- The SQL rehearsal does not prove deployed Worker request routing, actual browser authentication, native rate-limiting, or mobile accessibility. Those require independently reviewed staging release controls.

## Inert employee staging Worker preflight (8 November 2026)

- Review-only config: `cloudflare/wrangler.employee-self-service-staging.toml` names `bw-employee-self-service-staging` and binds **only** the already-created `bw-employee-self-service-staging` D1 (`adfa3871-5ecf-4672-8d2f-be9b142d5fc1`). It disables `workers_dev`, preview URLs, routes, static asset serving, application writes, staff logins, registration, payment and unrelated AI.
- `cloudflare/src/employee-self-service-staging-entry.js` is a **separate inert Worker**, not the production Worker and not a delegated employee login runtime. It fails closed until `STAFF_STAGING_SOURCE_SHA` is an exact attested commit SHA and the isolated database marker and five employee tables are present. Even when qualified, it allows only a non-secret status GET; employee login and management requests always return 403.
- `node scripts/employee-self-service-staging-preflight.mjs` verifies the absence of production identifiers or routes. `node scripts/employee-self-service-staging-preflight.mjs --identity-sql` **prints** staging-only marker SQL but does not execute it. The marker must be applied only to the verified isolated D1 after the appropriate staging qualification.
- `node --test tests/employee-self-service-staging-boundary.test.mjs` checks invalid flags, unexpected DB identity, missing schema, route denylist, production config exclusion and no-deployment behavior. The dedicated GitHub PR workflow runs these tests and existing employee lifecycle tests entirely offline.
- The config's `STAFF_STAGING_SOURCE_SHA = "UNQUALIFIED"` intentionally keeps the inert status unavailable until separately approved exact-source configuration. This is not evidence of a deployed or publicly reachable Worker.
- To perform actual login/assignment browser acceptance later, a **different independently reviewed authenticated staging profile** needs the full isolated workspace schema, real security bindings, staff-only staging origin and protections. Neither this inert Worker nor the sparse isolated D1 fixture can be used as a production substitute.

## Human staging and release gates
1. Independently review branch diff, SQL migration, staff authentication/anti-brute-force controls, cross-tenant access, revocation and employee data use.
2. Qualify migration `cloudflare/migrations/20261108_employee_self_service.sql` **on isolated staging D1**; verify schema, foreign keys, indexes and backup/rollback evidence. Production D1 is unchanged by this PR.
3. Run `npm run test:employee-self-service`, `npm run check` and existing production/full suites. Test both staff and owner/manager sessions against synthetic tenants and active/inactive employees.
4. Run an authenticated mobile staging acceptance: manager adds a staff record → issues invite → employee activates and signs in → manager assigns a task → employee starts and submits → manager approves/returns → employee sees the outcome → manager revokes and session loses access.
5. Confirm Cloudflare rate limiter binding and `SESSION_SECRET`, test rate limiting/fetch metadata/CSRF, password re-issue and login errors. Independently verify route-security inventory and avoid accidental production flags.
6. Obtain independent `thusico` code/security review and separate deployment/migration/feature-activation approval. Do not self-approve, merge automatically, or turn on the feature during this batch.

## API routes (staging only when enabled)
- `POST /api/employee-self-service/invitations` (owner/manager)
- `POST /api/employee-self-service/tasks` and `GET /api/employee-self-service/tasks` (owner/manager)
- `POST /api/employee-self-service/tasks/:id/review` and `POST /api/employee-self-service/employees/:id/revoke` (owner/manager)
- `POST /public/employee/accept`, `POST /public/employee/login`, `POST /public/employee/logout`
- `GET /public/employee/me`, `GET /public/employee/tasks`, `POST /public/employee/tasks/:id/progress`

## Rollback
Leave or set `THEBE_STAFF_PORTAL_ENABLED` absent/false. Do **not** delete employee audit history without a separately reviewed retention/deletion decision. Disabling the feature blocks staff and manager API reads/mutations without changing unrelated People/daily-report operations.

## Employee portal continuation — 26 November 2026

The staff dashboard reads the employee's latest 30 daily work reports from the
existing `daily_employee_reports` records, including branch names, work completed,
wins, blockers, incidents, next plans and correction counts. The new GET
`/public/employee/reports` resolves tenant and employee only from the active staff
session; query-string employee identifiers cannot select another employee.
Branch joins require the same tenant. The response is no-store. Submission and
corrections still use the existing manager-issued private reporting link; this
change does not add a second reporting write path or expose private link tokens.

The main Worker now delegates the previously unwired staff cash GET, expense POST
and count POST routes through the existing gated, CSRF-protected cash handler.
Daily cash count history and manager review reasons are visible in the staff UI.
Successful sign-out clears rendered private lists; responses from a prior session
are rejected before consumers render them.

Local verification: real SQLite daily-report isolation test first failed with
404 before implementation and now passes, including same-tenant peer isolation,
foreign-tenant isolation, mismatched branch exclusion, anonymous/revoked denial
and write denial. Cash history UI tests cover count decisions, reasons rendered
as text and denied feature access. Existing employee lifecycle, cash security,
staging boundary and bootstrap/preflight tests pass. Syntax and route inventory
checks pass. These are offline checks, not hosted mobile or staging acceptance.

Hosted staging remains unqualified. On 26 November the cloud browser displayed
GitHub's signed-out page at the employee environment settings URL, so current
secret presence and environment controls could not be reverified. Historical
missing-secret findings must not be presented as fresh evidence. No workflow,
D1 migration, Worker deployment, feature activation or finance posting was run.

Remaining full-portal scope: session-based report creation/correction and secure
receipt uploads, cash collection/handovers, controlled expense resubmission and
reimbursement, approval ceilings, schedule/reminder integration and complete
permission-aware navigation. Keep these in the same consolidated portal batch;
require isolated hosted qualification and independent review before activation.

### Continuation: task history, accommodation and CI inventory

- Staff task responses now include the latest 500 own-task events, joined by
  tenant and employee. Actor account identifiers are excluded. The UI shows
  submission/approval history under each task, using text rendering.
- Accommodation is accepted as an expense category, with duplicate-request
  behavior verified against SQLite.
- GitHub employee cash and self-service offline checks passed at `51ee3cc`.
  Recovery and audit-remediation CI failed because the historical route inventory
  test expected 34 pre-auth method/routes and six staff routes. The reviewed
  additions require 38 and ten respectively; the updated test also verifies
  exact methods for each of the four added staff paths.
- Fresh local checks: 45 employee tests pass; route-security adversarial test
  passes 59 assertions, and route inventory passes. Broader GitHub CI must rerun
  on the new head; no hosted qualification or activation is implied.

### Employee delivery and installation reminders

The staff report-history response now includes structured jobs plus reminders from
`dueDeliveryReminders`, the same service used by the private reporter and manager
workflows. Every query is scoped to the authenticated employee and tenant before
reading records. Active branches only; latest completion/cancellation wins.
The dashboard shows reminders from four days before the scheduled date, due today,
and up to seven days overdue, and includes branch, date and job reference.
Dates use Africa/Gaborone. Historical reports retain their recorded job statuses.
No email, push delivery, new reporting write route or migration is introduced.

The clean continuation checkout started at `9d54a24`, which had 24 returned CI
runs successful, including Recovery, audit remediation and Employee Cash. Those
results apply to that head only. New reminder integration tests verify D-4/due-day
visibility, D-5 and completed suppression, same-tenant peer and cross-tenant
isolation, and inactive-branch exclusion using actual SQLite queries.
