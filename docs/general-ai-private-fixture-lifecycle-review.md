# Private General AI fixture lifecycle — review-only candidate (7 Nov 2026)

This is a **non-deployed safety helper and synthetic offline test suite** for the next General AI private staging acceptance gate. It does not implement a Cloudflare D1 adapter, authenticated service-binding runner, staging write, provider call, or a workflow dispatch. Its existence does not establish staging E2E or production launch readiness.

## Exact scope

- Target Worker: `bw-general-ai-staging`; isolated D1: `ff229eef-7724-49ae-9d68-d3a1db669b63`.
- General AI and research must stay disabled; no public Worker route or preview.
- Independent protected staging write approval and exact-current-main source review are required before a real adapter may be connected.
- Caller supplies one unique synthetic id `ga-test-<32 lowercase hex>`; all fixture records must be scoped to this identifier, never a customer ID.
- Adapter is injected, has no default implementation, and requires `create`, `remove`, and `assertAbsent`. Its future implementation must enforce the approved DB identity **itself**; a scope object is an extra assertion, not an authorization credential.
- Session/membership/user creation order is fixed. Cleanup runs in reverse order even when creation fails part-way, and verifies no residual records. Cleanup failure is a hard NO-GO; do not retry unsafe writes blindly.
- No session tokens, secret values, email addresses, provider prompts or response bodies are logged by the helper. This helper does not create or handle session tokens and does not provision even synthetic identities by itself.

## Offline qualification

Run `node --test tests/general-ai-private-fixture-lifecycle.test.mjs`. Tests use only an in-memory fake adapter and include partial-write, exercise-error, missing-adapter, wrong-scope, wrong-identifier and cleanup-failure regression cases. No credentials or network are involved. The existing General AI production readiness workflow selects `tests/general-ai-*.test.mjs` and will include this test at PR head.

## Mandatory separate next gate

Independent `thusico` review must first approve an authenticated **non-public** invocation plan for the service binding, exact-staging credential permissions, and a distinct restricted D1 fixture adapter with parameterized SQL and run-specific row ownership. Only after protected environment approval may it create disposable staging identities and run live auth/CSRF/tenant/limiter negative paths, followed by mandatory zero-residual cleanup. Separately qualify model cost cap and timeout. A deployable runner must not be inferred from this module.

**Explicit exclusions:** no production deployment, no D1/R2 mutation, no AI feature-flag changes, no provider charges, no public routes, no approved restore or customer AI activation. Production remains HOLD until all gates in `docs/general-ai-production-readiness.md` pass.
