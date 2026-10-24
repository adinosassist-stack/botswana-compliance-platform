# Thebe Desk — batched employee reviewer authorization qualification

Status: **DEVELOPMENT-ONLY / PRODUCTION HOLD**. No database migration, deployment, permission endpoint, worker, or employee execution is authorized by this batch.

## Why batch
Security steps previously landed across many small PRs. This batch combines related changes into **one branch, one reviewer request and one integrated disposable-PostgreSQL 16 CI gate**. Keep a distinct production release gate. Do not merge in failed CI or without independent current-head approval.

## This batch
1. A grant must already exist, must be disabled and unrevoked, and must have been issued by an active owner.
2. A **different** active tenant owner must authenticate through a current nonrevoked Node session to activate the grant. Neither the reviewer nor the issuer can self-activate.
3. Activation is append-only audited, linked to the exact UUID tenant, reviewer, issuer-independent activator and current session. The audit and enablement occur in one database transaction.
4. The database rejects an unaudited `enabled=true` commit, disallows repeated activation, and requires terminal revocation rather than silently toggling an active grant off and back on.
5. The existing authenticated review writer remains inert. CI verifies that a reviewer with a properly activated grant can record a session-bound review; no dispatch or worker is triggered.
6. PostgreSQL RLS preview is updated to deny access to the new audit table. The restricted role cannot read any tenant rows or modify drafts.

## Known, non-negotiable production gaps
- **SQL caller provenance**: Validating an existing session ID in an audit row is not proof that the SQL caller owns it. Privileged database writers could forge references. Production requires trusted session binding and narrow DB entry points; this draft does not solve that.
- **Tenant isolation**: The no-login preview role demonstrates fail-closed RLS only. It is not a production application role; a custom GUC such as `app.tenant_id` is spoofable unless bound to a trusted DB boundary.
- **Identity mapping**: Node tables use UUID for users and tenants; some proposal/outbox draft tables use text. Reconcile before any migration.
- **Migration**: Existing databases need a separate backed-up, reversible rollout with data reconciliation. Do not replay draft CREATE TABLE scripts in production.
- **Execution**: Worker lease fencing, retry limits, crash recovery, effect idempotency, rollback, tenant permissions, audit, monitoring and operator stop must be independently qualified.
- **Release**: Feature stays OFF; kill switch stays ON. Complete exact-head CI, independent approval, signed provenance, performance/navigation verification, release-manager decision and disabled-dispatch smoke tests.
- **Activation**: Production permission granting and autonomous workflow activation require separate approvals. No application route is registered by this batch.

## Future batching
- **Batch B — trusted database tenancy and least privilege**: Canonical UUID schema design, narrow role-based DB interfaces, authenticated identity binding, RLS across the workflow stack and cross-tenant adversarial tests in one PR.
- **Batch C — worker and operational recovery**: Default-off worker lifecycle, lease fencing, dead-letter, internal task/report-draft effect rollback and kill-switch tests in one PR.
- **Batch D — release qualification**: Migration/backup/rollback, signed provenance, independent review, authenticated navigation benchmarks and staged nonexecuting deployment qualification. Separate activation decision.

Production `release/production.json` is deliberately left untouched by this batch.
