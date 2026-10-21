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
