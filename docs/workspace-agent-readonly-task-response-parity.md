# Workspace Agent read-only task response parity — fail closed

This batch protects the existing optional, default-OFF advisory task endpoints. It is **code and synthetic-test only**: there is no Cloudflare Worker upload, database migration, payment action, feature activation, configuration change, route, Access setup, or production deploy.

## Transport contract
- Both Cloudflare D1 and private Node/PostgreSQL use the existing **server-authenticated** tenant/user identity and role checks, never request-supplied tenant/user IDs. Tasks remain GET-only, tenant-bound and advisory with no execution authority.
- Omitted `workspace` defaults to `owner` for backward compatibility. An **empty**, invalid, or repeated `workspace` query parameter returns HTTP 400 without reading responsibilities. Cloudflare now checks `URLSearchParams.getAll()`, while the private Node transport no longer treats explicit empty values as omitted.
- A valid empty D1 query result (`results: []`) yields an empty verified task snapshot; an **absent, malformed or failed** D1 result yields 503 `task_source_unavailable`, not an empty success. Mock results larger than the SQL limit (24) also fail closed. Node already rejected an absent PostgreSQL rows array and continues to do so.
- Neither transport permits POST, DELETE, PUT or PATCH; each continues to use parameterized, tenant-scoped `SELECT`.

## New synthetic evidence
`tests/workspace-agent-tasks-api-contract.test.mjs` uses a synthetic session cookie, synthetic authenticated D1 query result, and a SELECT-only in-memory stub. It checks forged request identity, allowlisted scopes, duplicate/blank query rejection before task SQL, malformed/error D1 returns, missing session, unauthorized role and method denial. Existing Node unit and loopback HTTP tests are extended for explicit-empty scope rejection.

The mock session does **not** authenticate actual customer sessions and no live D1/PostgreSQL database is contacted. Existing private staging, no-route architecture, `thusico` review and production release requirements remain unchanged. The team must separately approve and qualify isolated real staging before asserting live readiness.
