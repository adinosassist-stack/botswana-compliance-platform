# Employee dispatch production release qualification — 22 October 2026

Status: **NOT RELEASE AUTHORIZED**. Documentation-only checklist. No feature activation, database migration, deployment, or worker execution is approved by this document.

## Baseline and evidence
- Reviewed and merged governance integration: PR #1706, merge commit `ed9fb711b4e65237905c4772f5fb0d1bab4f6c0b`.
- At preparation time `release/production.json` records sequence **564**, source SHA `1fd70f3bca897ae1e14e721eb4d5a00fc82eb0fe`. This manifest is not evidence of a live deployment.
- `docs/employee-workflow-dispatcher-contract.md` explicitly says design-only/default-off. The SQLite draft is **not** a production migration or production execution adapter.

## Latest merged qualification — 24 October 2026
- PR #1744 merged to main at commit `141eeddcefbabba2b109baeef911517407951cc2` after independent reviewer `thusico` approved commit `5353c8f5cd2d7d628db3b9dd97978832d12dc344`.
- All eight reported PR workflows passed on `5353c8f5cd2d7d628db3b9dd97978832d12dc344`, including Employee Dispatcher Admission Tests, Audit remediation CI, Recovery CI, and independent review regressions. Main-branch governance and recovery workflows also passed after merge.
- Production release manifest sequence 576 records source SHA `27136a6325c88cea30224b4515249e7728d9c6be`, not the PR merge SHA. This manifest alone is not evidence of live deployment; live artifact and release provenance remain unverified.
- Dependencies Zod 4.6.7 and ip-address 10.7.4 were qualified on the PR. Passing unit/CI checks does not establish production transactional adapter, migration, worker, or release readiness.
- This PR is merged, **not deployed or activated by this qualification**. All nine hold points remain in force; autonomous execution stays default-off with the kill switch on.

## Non-negotiable hold points
1. Confirm a production-compatible tenant-scoped storage adapter with transactional approval/proposal freshness, idempotency lock, intent and immutable audit persistence. Prove actual deployed database transaction semantics rather than relying on SQLite reference tests.
2. Review a real migration plan for existing production databases: backup, forward migration, rollback/recovery, tenant isolation and audit integrity. Never run the draft CREATE TABLE script as an upgrade.
3. Implement and independently review a bounded worker loop and an allowlisted internal task/report-draft execution adapter; no payroll, external messaging, financial posting, filings, deletion, or permissions changes.
4. Prove lease fencing, crash/retry idempotency, dead-letter recovery, rollback of effects on rejected completion, and current authorization rechecks immediately before commit. Do not claim atomicity for external effects.
5. Verify strict boolean feature controls: `featureEnabled === true`, `killSwitch === false`, `auditAvailable === true`. Keep feature **off** and kill switch **on** through all preparatory deployments.
6. Run exact-release-commit CI and independent security review; record signed provenance, backup/rollback evidence, and release-manager authorization.
7. Validate authenticated cold/warm workspace navigation and click-to-paint responsiveness. The outstanding cross-page freeze issue is a separate release risk; do not infer it is fixed by employee dispatch tests.
8. After a separately approved deployment, perform API, asset, authorization, tenant-isolation and disabled-dispatch smoke tests; verify actual live artifact SHA against the intended release SHA.
9. Require a **separate explicit activation decision** with operator stop, observability, staged rollout and rollback. A merge or release manifest update never implies activation.

## Release decision
**HOLD** for autonomous employee execution. A default-off code-only release may be separately qualified, but this checklist does not authorize it. Record the approver, exact commit, CI run URLs, deployment ID, database backup reference, smoke-test results and rollback owner before changing this decision.

## PostgreSQL adapter gap assessment — 24 October 2026
- `server/employee-workflow-postgres-store.js` persists employee-owned workflow definitions only; it is **not** an employee dispatch admission or outbox adapter. Its `saveOwned` and `listOwned` methods do not implement `transaction`, `lockDispatchKey`, persisted proposal/review freshness, `insertIntentOnce`, or `appendAudit` required by `queueEmployeeDispatch`.
- `db/drafts/employee-dispatch-outbox.sql` uses SQLite-specific `typeof(...)`, `RAISE(ABORT,...)`, and trigger syntax. It must not be run as a PostgreSQL or production migration.
- Before implementation, map authoritative proposal/review tables and immutable revision identifiers; define tenant isolation, transaction isolation/locking, compound foreign keys, unique idempotency constraints, append-only audit privileges, and rollback guarantees. Audit acknowledgement must return exactly boolean `true` after successful persistence inside the transaction.
- Qualification must include PostgreSQL-backed concurrent same-key admission, cross-tenant rejection, stale/revoked approvals, audit-insert rollback, lease fencing, crash/retry, and operator stop. A passing mock or SQLite test is insufficient.
- No database migration, worker execution, feature enablement, or deployment is authorized by this gap assessment.
