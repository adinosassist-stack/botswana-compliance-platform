# Agent cost accounting: controlled rollout and rollback

Status: experimental, not approved for production. The schema in agent_cost_accounting.sql is intentionally outside production migrations.

## Release gates
1. Confirm all required CI workflows pass on the same reviewed commit.
2. Export a D1 backup and rehearse restoration in a nonproduction environment.
3. Apply the schema to a disposable D1 database; validate indexes, triggers, tenant isolation, insufficient budgets, duplicate retries, settlements and releases.
4. Confirm the runtime authorizes the owner and applies policy checks before any cost reservation. Schema deployment alone must not activate agents.
5. Keep budgets disabled by default; explicitly enable only a low-limit internal test tenant after operator approval.
6. Record operator, migration SHA, backup ID, timing and reconciliation results.

## Rollback
1. Disable or suspend budgets and stop new reservations first.
2. Settle or release outstanding reservations through authorized paths and reconcile spent/reserved totals.
3. Revert runtime feature flags or application entrypoints separately; retain append-only audit records.
4. Restore a verified backup only with an approved maintenance plan and external-usage reconciliation; do not blindly overwrite recent events.

## Known blockers
- Schema has not been promoted into the production migration sequence.
- Application transactional batches write ledger events; direct SQL reservation changes can update budget counters without producing corresponding audit events. Restrict direct database writes.
- The reservation module is not proven to be connected to live execution.
- CI success is not migration rehearsal or deployment approval.

## Mandatory reconciliation gate
Before any budget activation, query `SELECT * FROM agent_cost_ledger_gaps;` on the target database. The result must be empty. If any rows appear, halt rollout, disable new reservations, investigate the originating writes, and reconcile with independently recorded provider usage. Do not delete or backfill events without an approved audit-repair process.

## Final go/no-go checklist
- [ ] Exact release commit passes every required workflow, including Recovery CI and Audit Remediation.
- [ ] Migration tested on an isolated D1 database with rollback/restore rehearsal.
- [ ] `agent_cost_ledger_gaps` returns zero rows after a representative lifecycle test.
- [ ] Database write permissions and application-only audit event creation are reviewed.
- [ ] Runtime owner authorization and feature flag isolation are demonstrated.
- [ ] Release owner signs off on tenant budgets, activation scope, monitoring, and rollback.

Do not treat this checklist as complete merely because the CI badge is green.
