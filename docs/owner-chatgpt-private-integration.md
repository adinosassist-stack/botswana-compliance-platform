# Private ChatGPT owner assistant — integration contract (issue #2592)

Status: design-only; no deployment, credentials, routes or production enablement.

## Existing controls to reuse
- `server/oauth-state.js`: signed OAuth state codec; not by itself an OAuth authorization server.
- `docs/agentic-platform-implementation-2026-10-09.md`: tenant-scoped MCP read tools, runtime guards, disabled-by-default flags, audit receipts, cost budgets and internal OpenAI observation adapter.
- `cloudflare/src/billing-dashboard-reads.js`: fail-closed owner billing evidence validation.

## Owner assistant MVP
Expose **only** explicitly registered, read-only tools after a separate security review: `owner.branch_summary.read`, `owner.sales_summary.read`, `owner.quotation_summary.read`, `owner.asset_summary.read`, `owner.manager_summary.read`. Every result must include source timestamp, scope, evidence availability and redaction metadata. Unavailable evidence is never represented as zero.

## Authentication and privacy
- Use the supported ChatGPT plugin authentication flow and an owner-only OAuth authorization-code/PKCE exchange where supported; validate redirect URI, state, issuer, audience and token binding. Signed state alone is insufficient.
- Server must derive owner identity and tenant permissions from verified credentials; never accept user-supplied tenant/role claims as authority.
- Keep access tokens short-lived; rotate and revoke refresh tokens; protect credentials in secret storage; no credentials in source, logs or chat.
- Block cross-tenant IDs, manager impersonation, injection from quotation notes and arbitrary SQL. Strict input/output schemas and allowlisted tool names only.
- No raw customer names, phone numbers, financial account numbers or employee PII sent to ChatGPT without separately approved data processing scope.

## Release plan
1. Map existing session middleware, owner role enforcement, MCP tool registry, audit receipts and Cloudflare Access.
2. Write synthetic-data contract tests: owner allow, non-owner deny, tenant mismatch deny, expired/revoked token deny, no writes, no public route, evidence-unavailable error.
3. Implement isolated private staging with feature flags off by default; prove revocation and kill switch.
4. Independently review exact commit, security tests, privacy scope and teardown plan with thusico.
5. Obtain separate owner activation approval before enabling any production route.

Explicitly excluded: payments, migrations, customer-data exports, quotation activation, production deployment and automated approvals.
