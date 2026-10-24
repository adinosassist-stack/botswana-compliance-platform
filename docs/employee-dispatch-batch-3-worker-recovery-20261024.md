# Thebe Desk — Batch #3: worker recovery qualification

**Status: DEVELOPMENT-ONLY / NO PRODUCTION EXECUTION.** This branch does not install a worker, expose an endpoint, run a migration, create a task/report, send messages or activate autonomous AI. The feature remains disabled and the kill switch remains active.

## Single-batch scope
- Create a separate PostgreSQL worker-claim state table for existing audited dispatch intents; do **not** rewrite immutable employee_dispatch_intents.
- Bound every claim to at most three attempts; lease UUIDs are randomly rotated and tied to the exact tenant and intent. Claim transactions use PostgreSQL `FOR UPDATE SKIP LOCKED` to prevent two workers acquiring the same state.
- An expired lease can be reclaimed, but its previous token cannot retry or qualify the new holder. Failure on the third attempt moves the row to an irreversible dead-letter state.
- Every transition requires its corresponding append-only audit event before COMMIT; injected audit failure rolls back the attempt, lease and state change.
- Require strict booleans before entering even this simulation: `featureEnabled === true`, `killSwitch === false`, `auditAvailable === true`, `operatorStop === false`, and `simulationOnly === true`. Defaults deny.
- Check current tenant, latest approved revision, independent reviewer, authenticated-session provenance, valid reviewer permission and issuance owner, and existence of the creation admission audit at claim and resolution time. This is a CI-only current-approval probe, not a complete production dispatch authorization adapter.
- The state `qualified` means **simulated preflight only**, never successful action execution. No code invokes internal effects.

## Test evidence to collect
The disposable PostgreSQL 16 CI suite must validate simultaneous claims, stopped/default-off behavior, tenant mismatch, token replacement after expiration, max-attempt dead-lettering, stale-token denial, DB-enforced audit on COMMIT, rollback on audit failure, and reviewer revocation immediately before qualification. Existing CI remains required.

## Still HOLD before any execution
1. Production-ready tenant/UUID schema migration, backup and tested rollback, full DB RLS and distinct least-privilege writers; the CI owner bypasses RLS.
2. Trusted session-to-DB principal binding: knowing a session UUID is not itself proof the SQL caller owns it. No application-side authorization may be inferred from untrusted request fields.
3. An *actual internal-only* effect adapter with atomic effect+lease completion+audit commit and idempotency; this branch has no effect adapter. External side effects cannot be assumed transactional.
4. Durable operator stop semantics and monitoring across worker instances, governance rechecks at effect commit, backlog and dead-letter recovery policy, rate limits, bounded poller, and cancellation tests.
5. Independent review, exact-head CI, production navigation performance qualification, signed release provenance, staged safe deployment, and separately authorized feature activation.

The existing `release/production.json` and runtime startup are intentionally untouched. Merge to main **does not mean deployment**.
