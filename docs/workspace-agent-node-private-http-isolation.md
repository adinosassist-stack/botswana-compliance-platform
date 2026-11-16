# Workspace Agent — synthetic Node HTTP transport qualification

**Code-only testing. No live PostgreSQL, staging Worker, release flag, customer account or production deployment.**

The existing private Node Workspace Agent API uses authenticated `user_id` and `tenant_id` from the Node session middleware, but the prior unit tests mainly invoked its handler with fabricated request objects. This batch adds a separate **real loopback HTTP** test (Express 5 over Node `http.Server`) to exercise route registration and response headers with two synthetic UUID tenants.

The test harness runs only inside CI on a random `127.0.0.1` port; no external hostname is created. A **test-only mock authentication middleware** uses fixed synthetic sessions; it is NOT wired into `server/server.js`, is NOT a substitute for the real signed cookie/session database validator, and is never used in deployments. A fake in-memory PostgreSQL adapter records read query text and parameter values. It rejects non-SELECT SQL, and the test fails on attempted mutation.

## Tested properties

- Production and development Node modes register no Agent identity/task endpoints, even with the test flag.
- The private authenticated owner/manager endpoint returns the synthetic opaque tenant and user identity from the middleware, never forged query values.
- Two tenants receive separate advisory tasks for owner and finance scopes, and the server query uses parameterized tenant/workspace binding.
- Unauthorized reviewer, auditor and missing/removed sessions are denied.
- Unsupported and duplicate workspace query values are rejected; writes return 405 and do not reach the data layer.
- A missing responsibilities table yields 503 without inventing tasks.
- Task snapshots remain advisory-only: no execution authority, no external side effects and approval remains required.

## Not yet proven

This is **not** live Node/Postgres or Cloudflare staging qualification. The mock middleware does not authenticate the real session cookie. The fake database does not prove PostgreSQL DDL, row-level security, network isolation or dedicated least-privilege credentials. The protected staging process must still qualify the `agent_responsibilities` schema, real server session validation, revocation/concurrency, and two genuine synthetic isolated tenants. Protected owner and independent `thusico` approval is required for any staging deployment/activation. The production Agent feature remains disabled.
