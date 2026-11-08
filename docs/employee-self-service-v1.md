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
