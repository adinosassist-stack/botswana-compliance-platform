# Workspace Agent: private PostgreSQL staging metadata preflight

**Status: candidate source only, NOT EXECUTED against a database.** This gate is safe to merge and test offline, but provides no authorization to provision, migrate or expose staging or production.

The Node Workspace Agent API uses the existing authenticated Node session and queries `agent_responsibilities` with the parameters `tenant_id`, `workspace`, and active `status`. Node PostgreSQL table existence and the minimum schema remain *unqualified*. Cloudflare D1 migration 066 is **SQLite-specific and must not be applied to PostgreSQL**.

`server/workspace-agent-postgres-readonly-qualification.js` exports an injectable function `qualifyWorkspaceAgentPostgresReadOnly({pool,schema:"public"})`. It only makes three read-only metadata queries:
1. `information_schema.columns`: confirm `id`, `tenant_id`, `objective`, `workspace`, `status`, `updated_at` exist, are NOT NULL, and have compatible PostgreSQL types.
2. `has_table_privilege`: confirm the **calling staging database principal** can SELECT and cannot INSERT, UPDATE or DELETE on that table.
3. `pg_catalog.pg_indexes`: ensure a tenant-first index whose leading keys are `tenant_id, workspace, status, updated_at` for the bounded read query.

The function neither opens a network connection nor runs data SELECTs against the responsibility table. It does **not** output table contents, secrets, user identities, SQL DDL or credentials. Any metadata error or missing permission fails closed. A passing metadata receipt *still* returns `readyForStagingDeployment:false` and `productionActivationAuthorized:false`.

The new workflow runs **mock-only** contract tests. It has read-only GitHub permissions, no database secrets, no migration and no deployment step. Its passing CI does NOT mean a live database was inspected.

## Separate approvals required for any live qualification

A private PostgreSQL instance must first be independently identified as isolated from production, with no customer data or public routes. Use a **dedicated SELECT-only credential** with no DDL/DML permissions, restrict network access, and independently review the exact source SHA and protected environment. Do not run this preflight with an application owner/superuser credential or assume a test-looking database name ensures isolation.

A separately approved future protected workflow may invoke the function against that isolated staging database and collect a sanitized receipt; this PR provides no such workflow, access, credentials, token or operator instructions to use production. The PostgreSQL schema itself, any DDL migration, realistic session tests and app activation require *separate* independently reviewed changes and explicit owner authorization. Continue to keep the feature flag off and preserve the independent `thusico` review gate.
