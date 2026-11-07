# General AI private Worker one-time bootstrap — review-only handoff

This is a **source-only** proposal for an inactive named Worker. Merging does not create a token, deploy a Worker, attach Queue triggers, send messages, enable AI, or change production.

## Source and review
- All execution must be pinned to **exact-current-main SHA**. Earlier source 5d59ad7 qualified offline preflight 42420407060, but a later commit must be reviewed independently.
- Issue #1950 contains a bounded thusico approval for the initial bootstrap, not for an unlimited or changed-source release. Protected environment approval is separately required.
- Cloudflare target Worker bw-general-ai-private-queue-acceptance was absent, Queue f22ef664047947afab5d2cedeb4ee534 had no consumers. Reinspect before execution.

## Security design
- Config contains no Queue consumer, D1, service, R2, env vars, routes, workers.dev, preview URL or provider credential. Fetch handler answers only HTTP 503/no-store.
- A one-time, expiring, independent-reviewed Workers product Admin credential is needed to create a previously nonexistent Worker. Put it ONLY in the protected GitHub environment secret GENERAL_AI_QUEUE_BOOTSTRAP_CLOUDFLARE_TOKEN; do not reuse regular staging or production tokens.
- Protected general-ai-private-staging environment must enforce thusico reviewer, prevention of self-review, main-only branch and no bypass. Workflow rechecks SHA after review and immediately before deployment, refuses overwriting existing Worker, and reads back binding and public subdomain state.
- The one-time product Admin permission can affect other Workers; revoke it and delete GitHub bootstrap credential after use. Issue #1950 remains HOLD until independently verified.
- Once the Worker exists, issue a much narrower Individual Workers Editor token for that Worker only. Check any future Queue-specific permission separately. A subsequent consumer deployment, test message and customer AI activation each require distinct authorization.

## Non-goals
No PR deployment, production writes, bank/payment access, POP uploads, customer AI, Queue processing, provider calls, D1 writes, public routes, bypass, or secret disclosure.

## Acceptance
Exact-source CI, required independent reviewer decision, protected workflow run, only-target Worker creation and binding readback, public exposure off, zero Queue consumers, time-limited token revoked, and independently signed gate record.
