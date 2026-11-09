# General AI isolated D1 fixture adapter — review-only (7 November 2026)

This is an **unmounted candidate** that adds parameterized SQL creation and cleanup for the dedicated General AI staging test database's `users`, `memberships`, and `sessions` schema. The adapter is not imported by any deployed Worker, runner, or GitHub Action. It has no credentials or Cloudflare API client and is NOT permission to write to staging.

The adapter takes a synthetic run-owned ID, a precomputed HMAC-SHA256 session hash, a synthetic CSRF token, an explicit expiry, and a separately supplied D1-like database binding. It never obtains the underlying session secret or accepts raw session cookies. SQL is fixed and uses bind parameters; cleanup is scoped to the exact run-owned user, membership, and token-hash. Combined with the independently reviewed lifecycle in PR #2233, it verifies zero residual fixture records.

**Important limitation:** The injected DB object alone cannot prove its own Cloudflare D1 database ID or authorization. A future independently approved protected runner must verify binding identity, permission scope and exact-main approvals before providing it. The current helper's scope assertions are not an authorization credential. Do not allow untrusted users to call the helper or supply fixture values, and do not deploy it into a public Worker.

Test with `node --test tests/general-ai-private-d1-fixture-adapter.test.mjs`. Local pre-submit real in-memory SQLite test: 4 passed, 0 failed. Test covers complete creation/cleanup, preservation of unrelated records, a partial-write failure, and malformed synthetic credential rejection. GitHub PR checks and independent `thusico` approval remain separate gates.

Next requirements: independently review non-public invocation, staging-only secret handling and parameterized adapter scope, protect fixture writer, and exercise authenticated live negative paths with fixture cleanup, hard cost limits, and no public route. Keep both General AI production flags and advanced exports OFF. No source in this PR is a deployable invocation endpoint.
