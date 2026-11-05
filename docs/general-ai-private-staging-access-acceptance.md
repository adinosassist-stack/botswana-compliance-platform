# General AI private staging: internal-only HTTP acceptance design

**Status:** Proposal for independent security review, not deployment authority.
**Related:** Issue #1950, merged offline gate PR #2212.
**Target:** Existing private Worker `bw-general-ai-staging` only.

## Transport (proposed)
Cloudflare Workers **service bindings** support Worker-to-Worker invocation without a public URL: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/. A separately reviewed, no-route/no-workers.dev/no-preview test-harness Worker can bind solely to `bw-general-ai-staging` using `[[services]]` and `env.STAGING_AI.fetch(request)`. The binding alone does not provide a callable test channel: a separate authenticated, restricted execution method must be designed and reviewed before any live execution. Do not expose a public or preview URL to run test requests. Do not add a route or domain to the target Worker.

Before any harness deployment: independently review binding scope, how the harness will be invoked without a public route, environment protections, script identity, cost, request logging, automatic cleanup and negative-path isolation. Fail closed if private invocation cannot be proven. Do not use a production Worker as a test relay.

## Synthetic fixtures (not provisioned)

Use the existing isolated D1 `ff229eef-7724-49ae-9d68-d3a1db669b63` only, after an independently reviewed one-time fixture creation and cleanup job:
- Generate random non-reusable user ID, tenant ID, raw session token and CSRF token in the protected job; hash the session token using the staging `SESSION_SECRET` HMAC-SHA256 algorithm. Never print raw tokens, secret values, or session cookies.
- Insert one synthetic `.invalid` email, one active membership, one bounded-expiry session using parameters and a unique run-specific namespace. Do not reuse any production identity, real email or customer data.
- Make negative-path tests with malformed token, expired/revoked session, inactive membership, mismatched Origin and CSRF, unrelated tenant, limit exhaustion. Validate 401/403/404/429/503 and no leakage, and run the general answer only with a separately authorized staging provider and cost cap.
- Strictly clean all synthetic sessions, memberships and users in a `finally` cleanup that verifies zero residual run-owned rows; failure to clean up is a release NO-GO and requires manual review before further tests.
- Record only status codes, test counts, resource IDs, SHA, costs and timestamps in release evidence. Never retain response bodies or tokens.

## Gates before any live tests
1. Verify current staging Worker version/bindings and both General AI flags are still OFF; independently review any temporary staging-only flag plan and immediate rollback.
2. Approve a no-public-route internal invocation path, dedicated CI environment and reviewer; token policy must be staging-only and least-privilege.
3. Create fixture in isolated D1 only after separate authorization. Test account and session lifecycle via protected workflow, no production writes.
4. Provision dedicated staging-only `OPENAI_API_KEY` and `THEBE_GENERAL_AI_MODEL` (only for approved paid test), fixed spend budget and provider timeout; keep research OFF.
5. After tests, restore flags OFF, destroy test fixtures, revoke/rotate any temporary credential, verify no new Worker route/domain or preview, and audit access logs.
6. For production: require full independent exact-final-SHA approvals, production budget and limiter, dock/mobile/voice regression, privacy and rollback review. Staging success alone cannot authorize customer activation.

## Already proven offline
The new `tests/general-ai-staging-sqlite-acceptance.py` exercises the **exact SQL SELECT** parsed from the staging entrypoint against the reviewed schema in a temporary in-memory SQLite connection. It tests valid tenant-bound session, forged token, inactive membership, revoked generation, expired session, cross-tenant membership, tenant FK enforcement and DB integrity. It neither accesses Cloudflare nor creates staging identities.

**Do not deploy any new Worker or add any synthetic fixture based on this document alone.**
