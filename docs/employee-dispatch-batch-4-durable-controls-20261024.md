# Batch #4 — durable operator stop for the development-only worker

Production execution remains **HOLD**. No migration, route, poller, task/report
effect adapter, deployment or autonomous activation is included.

## Contract

- Each tenant has one PostgreSQL control row. New rows must start with the
  feature disabled, the kill switch active and operator stop active. A missing
  row, unavailable database or any stopping control denies work.
- The caller's existing strict boolean gates remain necessary but cannot
  override the stored controls. Controls are read inside every claim and
  resolution transaction using `FOR SHARE`, before lease or approval locks.
- A control update takes a conflicting row lock. It waits for an in-flight
  simulated operation to commit or roll back. Once the stop update commits,
  later claims and resolutions from every worker instance are denied.
- Stop does not retroactively cancel an operation that committed before stop.
  Existing leases remain fenced and keep their attempt counts; resuming a
  still-live lease is possible only after controls are enabled again.
- Every control insertion/update writes its revision and settings to an
  immutable state-change audit in the same transaction. Database-assigned
  revisions cannot be reset, and neither control rows nor audit rows can be
  deleted through normal SQL operations. Audit failure rolls back the change.
- Both new tables use default-deny RLS and have no public/preview/tenant grants.
  The disposable test database owner bypasses RLS; that is not a production
  least-privilege writer model.

## Verification

The existing PostgreSQL 16 recovery suite is extended to test cross-instance
claim/resolve denial, missing controls, stop ordering against an in-flight
transaction, audit rollback and immutability, and denied preview-role access.
Earlier lease-expiry, concurrency, bounded retry and dead-letter tests remain.

## Remaining execution blockers

There is no production control-writing API or authenticated operator identity
binding. Audit rows describe state changes and do not assert who authorized
them. Production UUID/tenant migration and least-privilege writers, actual
atomic internal effects/idempotency, bounded polling, cancellation/recovery
policy, monitoring and independent activation approval remain separate work.

The release manifest and production runtime startup are unchanged. Merging
this development batch is not a production deployment or permission to execute.
