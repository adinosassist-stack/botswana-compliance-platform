# Workspace Agent Node PostgreSQL schema candidate — review only

**Not a migration. Not authorized for execution or deployment.**

The candidate `db/drafts/workspace-agent-postgres-schema-review.sql` is a PostgreSQL-native, additive *design draft* for the Node Workspace Agent's future isolated test environment. It is intentionally outside `db/migrations` and `db/schema.sql`, and no application code, migration runner, workflow or deployment references it as executable input.

## Why a PostgreSQL-specific draft is necessary

The existing Node source `db/schema.sql` defines `tenants.id` and `users.id` as **UUID**. The Cloudflare D1 responsibilities migration `cloudflare/migrations/066_v285_agent_responsibilities.sql` instead uses TEXT foreign keys and SQLite syntax. The SQLite migration is not portable and must not be applied to Node PostgreSQL.

The candidate uses UUID foreign keys for tenant and actor identities, a TEXT responsibility identifier, strict workspace/status and bounded autonomy constraints, validated JSONB scope arrays, explicit activation requirements, and an index with leading columns `tenant_id,workspace,status,updated_at DESC` matching the Node private endpoint's parameterized, bounded read query.

## Safety and remaining differences

Only the existing test-only Node Agent adapter can read these rows, and only when `APP_ENV=test` AND `WORKSPACE_AGENT_NODE_PRIVATE_TEST_ENABLED=true`; **even those endpoint tests currently use mocked PostgreSQL and have not run against this schema**.

This draft does not implement SQLite's authority-escalation/terminal-state triggers, event history, write audit, full migrations, access grants, PostgreSQL RLS, or a provenance-approved activation workflow. They remain explicit blockers for any governed responsibilities write implementation. Do **not** treat column compatibility with the read-only endpoint as full D1 parity or runtime authorization.

The new CI workflow runs only static tests: Node UUID lineage, the SELECT shape and matching index, advisory-scope constraints, and absence of migrations/grants/side-effecting references. It has no database URL, credentials, SQL runner, or deployment action.

## Separate protected follow-up

Before any actual staging schema change: independently identify a **new disposable isolated PostgreSQL database** with synthetic data only; verify no production/customer access; approve exact-main source, SQL contents, rollback and least-privilege schema application plan; obtain owner and independent reviewer `thusico` approvals in a protected environment. Then qualify a separate reviewed migration workflow and re-run read-only metadata and real-session tenant-isolation tests. Production Agent activation remains disabled and separately governed.
