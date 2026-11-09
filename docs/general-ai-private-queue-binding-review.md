# Queue→D1 atomic replay integration candidate (not deployed)

This code-review batch integrates the previously merged private Queue consumer and atomic D1 ledger. It introduces a **separate review-only entrypoint** `cloudflare/src/general-ai-private-queue-d1-entry.review.js` with no fetch handler or registered deployment config. The existing default-OFF review Wrangler profile remains unchanged. No Queue, D1 database, schema, secret, token, consumer or Worker is created.

The integrated entry requires `PRIVATE_AI_NONCE_DB`, verified isolation and schema flags, exact approved SHA, and a private service binding. It explicitly rejects injected `PRIVATE_AI_NONCE_LEDGER` to prevent replacing durable claims with permissive fakes. These flags are assertions and **do not authenticate** the deployment or prove D1 identity. A protected external authority must verify live D1 resource ID, schema migration provenance, GitHub review and caller credentials prior to using them.

Local `node --test tests/general-ai-private-queue-d1-entry.test.mjs` exercises real in-memory SQLite across separate consumer calls, duplicate-denial, wrong/unqualified environment, injected ledger bypass, malformed Queue envelope and missing schema. These are **offline simulation**, not Cloudflare live E2E, contention semantics, signed operator identity or staging D1 proof.

### Required before any staging provisioning or test dispatch

1. Independent owner and `thusico` approve the exact source SHA and scope of a dedicated NEW staging replay D1, isolated from `bw-general-ai-auth-staging` and production D1, plus the unique claim schema and retention.
2. Separately provision dedicated private Queue, least-privilege Queue publisher and reviewed environment-bound consumer Worker; require no public URLs, no preview and no routes.
3. Prove actual D1 bound database ID, schema and atomic `meta.changes` behavior under concurrent Cloudflare requests; log/retry/dead-letter policy must bound costs and never replay a successful claim.
4. Explicitly wire this entrypoint into a protected staging deployment only after reviewed approval and verify disable-on-exit, receipt, claim retention and zero exposed URLs.
5. Only then run **disabled-state negative paths** (404/404/405). Authenticated AI, CSRF/tenant isolation, rate limiting, model provider cost acceptance and production General AI release remain additional independently gated tests.

Keep production General AI, research and exports disabled. No real credential, customer session, D1 write or provider request is needed to review this PR.
