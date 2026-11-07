# General AI private staging — protected rollout handoff (review only)

**NOT DEPLOYED.** This handoff provides exact Cloudflare resource identities, an inert Worker configuration and a static guard, but grants no cloud modification permission.

Reviewed source baseline: `e552588983b7cd8279abe45a366783f764762e90`. This PR's new head and subsequent merges must be re-reviewed and pinned separately before rollout.

## Verified resources, created 7 Nov 2026
- Account: `ddd23cab31928a4bb3d4998df9b26d1d`.
- Queue: `bw-general-ai-private-acceptance-queue` / `f22ef664047947afab5d2cedeb4ee534`. Initial and repeated readback: **zero consumers**.
- Isolated nonce replay D1: `bw-general-ai-private-queue-nonce-staging` / `71e2d394-7dec-4878-bdc8-afe8f73cf541`. Initial/repeated readback: **zero application tables**.
- Original private auth D1 `ff229eef-7724-49ae-9d68-d3a1db669b63` remains a distinct database and MUST NOT be used for replay claims.
- Target `bw-general-ai-staging` has both General AI and research feature flags OFF and is not opened publicly.

## Required separately approved operations — do not execute from this PR
1. Secure operator/owner plus independent `thusico` approve **schema installation** on exact replay-only D1 UUID, exact reviewed SHA, retention policy, credentials risk and rollback in a protected staging environment. A terse prior approval applied only to creation of the two empty resources.
2. Read-only recheck source SHA, Queue ID/name, replay D1 UUID/name, target privacy, no existing consumer, unrelated auth/production D1 IDs, any account-wide Cloudflare token permissions and presence of a dedicated least-privilege staging credential. Never reuse production deployment tokens.
3. After separate approval, apply `cloudflare/schema/general-ai-private-queue-ledger-candidate.sql` only to the replay-only D1. Verify resulting table and unique index by read-only metadata. No customer data and no write to auth/production D1.
4. Qualify real D1 atomic `INSERT OR IGNORE` / `meta.changes`, including two independent concurrent claims and ambiguous failures, in isolation with strict cleanup/retention controls. Local SQLite tests alone do not qualify Cloudflare semantics.
5. Obtain another **deployment and protected dispatch** approval for the exact PR-head source, user/operator environment and no-public-route/no-preview settings. The proposed Wrangler config is intentionally default OFF and contains no `APPROVED_SOURCE_SHA`. Do not deploy while OFF as a workaround to approval, and do not enable a live consumer from an unprotected shell.
6. With independent approval, verify Queue consumer identity and service-binding scope; run one disabled-state only test (404/404/405); inspect Queue retries, receipt/logs and nonce claim retention. Do not enable General AI or access model provider.
7. Disable consumer and revoke temporary staging publish permissions; preserve the evidence and separately qualify tenant/session/CSRF/rate and model spending before any production decision.

## Static offline qualification
`node scripts/general-ai-private-rollout-preflight.mjs`
`node --test tests/general-ai-private-queue-d1-entry.test.mjs tests/general-ai-private-queue-d1-ledger.test.mjs`

## Holds
This review-only profile is not referenced in a deployment workflow. No Cloudflare schema, consumer, Worker, secret, Queue message, authenticated test or production configuration is applied by creating or merging this PR.
