# Agent approval history: verified database integration gap

The existing Node/Postgres store in `server/agent-postgres-store.js` operates on `agent_action_approvals` and `agent_action_audit`. Its verified approval columns are `id`, `tenant_id`, `actor_id`, `action`, `argument_digest`, `nonce`, `status`, `expires_at`, and `consumed_at`.

The new `cloudflare/src/agent-approval-history-service.js` deliberately accepts an injected read-only storage adapter and is default disabled. It is **not** connected to PostgreSQL. Its projection currently expects `workflow` and `timestamp`, which have not been established as columns of the existing approval table. Do not claim database integration or map `action` to a workflow without an explicit, reviewed canonical mapping.

## Required before connection
1. Inspect the exact applied migration and schema of `agent_action_approvals`, including timestamp columns, indexes, and tenant row isolation.
2. Define the canonical workflow-to-action mapping and an immutable audit timestamp source. Do not fabricate either.
3. Implement a parameterized, read-only query constrained by authenticated `tenant_id`, and `actor_id` for managers. Apply a hard limit of 50.
4. Project only `id`, mapped `workflow`, `status`, and verified timestamp. Never expose `nonce`, `argument_digest`, or arbitrary metadata.
5. Add database integration tests for cross-tenant isolation, malformed rows, unavailable DB, and manager visibility.
6. Integrate through existing authenticated middleware with origin/CSRF/rate limiting and a default-off staging flag. Preserve independent `thusico` review.

No schema migration, route, live DB read, deployment, or approval execution is included in this PR.

## Verified repository schema and qualification status (2026-11-10)

Repository migration `db/migrations/20261015_agent_action_governance.sql` confirms `created_at timestamptz`, the `pending`/`approved`/`rejected`/`expired` status constraint, and nullable `consumed_at`. The workflow/action identifiers were verified against `cloudflare/src/agent-workflow-simulation.js`. The read-only PostgreSQL adapter now uses those exact fields, maps `pending` to `requested`, and maps non-null `consumed_at` to `consumed`. This confirms repository schema compatibility, **not** that migrations have been applied in staging.

The opt-in integration test `tests/agent-approval-history-postgres-integration.test.mjs` skips unless `AGENT_HISTORY_TEST_DATABASE_URL` points to an isolated disposable database. A successful GitHub Actions job alone is **not evidence** that this live database test ran. Before protected staging, inspect test skip counts, verify migrations on the isolated database, and run the test with its explicit environment variable. Never point this test at production: it inserts and deletes synthetic approval rows.

The HTTP adapter is still deliberately unmounted; no existing authenticated route stack has been bound to its five mandatory guard callbacks. A green unit test cannot substitute for a verified production-grade authentication integration. Independent `thusico` review and protected release checks remain mandatory.
