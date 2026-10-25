# Employee dispatch persisted approval model

Status: design only. Autonomous execution remains disabled. This is not a database migration.

## Existing storage

The employee_ai_workflows table stores definitions, not immutable proposal versions. The agent_action_approvals table supports generic agent actions, not employee proposal-specific reviewer independence. The agent_action_outbox is a separate queue and must not be reused without a reviewed compatibility model.

## Required guarantees

1. Persist immutable proposal revisions with tenant, author, action and content digest.
2. Persist independent review decisions bound to an exact proposal revision.
3. Lock current revision and review status within the dispatch transaction; reject revoked or stale approvals.
4. Enforce tenant-scoped idempotency and reject changed-payload replays.
5. Insert the intent and durable append-only audit atomically.
6. Verify tenant isolation, concurrent admissions, audit rollback and approval revocation races on real PostgreSQL.

No migration or worker should be activated before independent security review, backup and rollback planning, and separate production release authorization.
