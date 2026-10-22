# Employee workflow dispatcher — pre-implementation contract

Status: design-only, default-off. This document grants no execution authority.

## Scope
Connect approved People workflow proposals to **internal** task creation and report-draft preparation only, through a future tenant-scoped dispatcher. No payroll, financial posting, external messaging, regulatory filing, deletion, or permission changes.

## Preconditions
1. Authenticate the employee and resolve tenant/actor from server-side identity, never proposal fields.
2. Require a persisted approved proposal, valid reviewer authority, immutable review history, and a matching tenant.
3. Re-check authorization at dispatch time, including kill switch, feature flag, budget and audit availability.
4. Map template IDs to a fixed server-maintained action registry. Reject unknown actions and untrusted arguments.
5. Use a durable tenant-scoped idempotency key and transactionally persist authorization audit + dispatch intent.
6. Keep approved proposal and execution state separate. Approval alone never executes a task.
7. Workers revalidate the kill switch, permissions and scope before side effects; record attempts and outcomes.
8. Expose bounded retries, dead-letter recovery, and a manual operator stop control.

Governance control inputs are typed booleans: dispatch requires
`featureEnabled === true`, `killSwitch === false`, and `auditAvailable === true`.
Missing, null, string, numeric or object values must deny admission and worker
execution. Resolve configuration strings to explicit booleans in the trusted
caller; these policies must never use truthiness to grant execution eligibility.

## Required regression tests
- Cross-tenant proposal replay and actor spoofing fail closed.
- Repeated dispatch requests yield one durable intent.
- Audit insert failure leaves no intent or execution.
- Revoked permissions, disabled flag or kill switch block dispatch and worker execution.
- Unsupported/sensitive actions are rejected even when allowlisted in a proposal.
- Worker crash/retry does not duplicate task or report creation.
- Manager approval does not itself enqueue an action.
- All tests run with real schema migration and durable storage adapter.

## Release gates
Independent review, exact-head CI, migration backup/rollback evidence, signed release provenance, and post-deployment API/asset/authorization smoke tests. Activate only after these pass.
## Transactional reviewer provenance and freshness

The storage adapter must implement `isAuthorizedReviewer(tenantId, reviewerId, proposalId, reviewId)` and `isCurrentApprovedReview(tenantId, proposalId, reviewId)` within the same transaction as proposal/review reads and queue insertion. Both must return the boolean `true` only for trusted, persisted, tenant-scoped authorization and the latest unrevoked approval of the exact immutable proposal revision. Missing methods, unavailable governance data, or a false result deny admission. Never accept reviewer role, review status, or proposal revision supplied by the caller. The draft SQL outbox does not implement these checks; a production adapter is still required.

## Immutable proposal revision binding

The adapter must also implement `isCurrentProposalRevision(tenantId, proposalId, reviewId)`, returning `true` only when the reviewed immutable proposal revision is exactly the currently dispatchable revision. A changed, withdrawn, or replaced proposal must require fresh independent approval. This check must be part of the same atomic admission transaction and must not rely on caller-provided revision metadata.

## Draft SQLite audit verification

The draft outbox now includes `employee_dispatch_audit` with an intent foreign key. The SQLite integration suite exercises both an atomic successful insert and rollback when the audit foreign key rejects an insert. A production adapter must enable foreign keys, bind authenticated tenant/actor, validate tenant consistency for audit rows, and guarantee one transaction across review checks, intent insertion and audit. These draft tests do not prove Cloudflare D1 interactive transaction compatibility or a deployed worker.

## Tenant-safe audit linkage

The draft SQLite schema now rejects audit rows whose `tenant_id` differs from the referenced intent's tenant. This is enforced by an insert trigger in addition to the intent foreign key and covered by an integration test. Production implementation must apply equivalent tenant isolation on inserts and updates, and must not use a caller-provided tenant identifier as authorization evidence.
