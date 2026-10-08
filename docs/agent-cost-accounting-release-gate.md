# Agent cost accounting — release gate

Status: **experimental / disabled**. The SQL in `cloudflare/experimental/agent_cost_accounting.sql` is not a numbered production migration. Do not apply it to a production D1 database or enable autonomous execution as part of this PR.

## Verified in branch CI
- Budget admission, reservation, settlement and release, with database-enforced budget movements.
- Append-only cost event ledger and direct-SQL invariant tests.
- Existing workspace, client-runtime, voice and recovery regression suites (check the latest commit's CI before merge).

## Required before production promotion
1. Reconcile this branch with current `main` and rerun all checks; the feature branch has diverged.
2. Review the latest production migration numbering, migration ledger, deployment sequence and release manifest. Allocate a unique migration only through the repository's governed release process.
3. Test the migration against a disposable D1 database using the actual Cloudflare D1 runtime, including foreign-key behavior, SQLite trigger compatibility, and transactional `DB.batch` failure semantics.
4. Validate concurrent reservations, retry/idempotency, tenant isolation, overspend denial, provider-usage reconciliation and append-only ledger access permissions.
5. Establish budget creation and operator controls, reconciliation of stale reservations, monitoring/alerts, and an incident rollback plan. Never reset spent amounts to recover a failed run.
6. Wire runtime cost admission only **after** existing authentication, tenant authorization and owner approval checks. Set a feature flag that defaults to off. Never treat a successful cost reservation as permission to execute an agent.
7. Verify owner-approved production rollout, deployment health, and end-to-end accounting before enabling the feature for any tenant.

## Release decision
**No-go** for production until every item above is evidenced. CI success proves tests pass, not that the deployment and financial controls are ready.
