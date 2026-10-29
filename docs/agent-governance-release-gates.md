# Agent governance release gates (default off)

PR #1939 contains isolated contracts and tests, **not** a production-ready agent spending feature.

## Required before any production integration

1. **Authenticated context:** tenantId and actorId come from verified server session and role checks, never client request JSON. An approval must be stored and independently verified server-side; `policy.approved` in client input is not authoritative.
2. **Transactional budget adapter:** reserve, ledger insert and audit append commit atomically in a real supported database transaction. On any error all three must roll back. Do not use a callback wrapper that lacks real rollback semantics.
3. **Concurrency:** prove two simultaneous requests cannot overspend; enforce unique (tenant_id, agent_id, request_id), version-fenced policy update and per-tenant isolation.
4. **Idempotency:** repeated request with same cost returns existing result; same ID with changed cost fails closed.
5. **Audit integrity:** event digests alone do not prove tamper evidence or persistence. Add append-only storage, access control, retention and integrity verification.
6. **Stop switch:** disabled or stopped agents cannot reserve budget or execute actions, including after a race with shutdown.
7. **Budget semantics:** current reference design increments `spent_minor` on reservation. Define settlement/refund/release lifecycle before any monetary action. Avoid double counting and orphan reservations.
8. **Financial boundaries:** payment execution, subscription activation and regulatory activation remain prohibited without separate authorization, reconciliation and independent review.
9. **Database qualification:** run migrations in isolated staging with rollback, backups, race tests and representative schema validation. No production schema writes in this PR.
10. **Review and deployment:** all required checks must match protected ruleset check names/sources, independent reviewer approval is required, and rollout stays default off.

## Current known limitations

- `reserveAgentBudget` depends on an injected transaction interface; the test adapter does not prove real rollback or concurrency.
- Owner summary is a pure projection and has no authenticated HTTP endpoint or UI integration.
- Audit event `digest` is deterministic hashing, not a signed or chained tamper-proof log.
- Reference SQL is not migrated, and there is no live database adapter.
- No production deployments or payment permissions are authorized by this document.
