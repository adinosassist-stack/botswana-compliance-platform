# Manager private staging — exact-main deployment gate

Status: **review only; no deploy / DNS / route / secret / live activation authorized by this file**.

## Source and authorizations

- Exact reviewed base main for this qualification branch: `520877e74e923d353da6438b40903f2ce60090e3` (2026-11-17). Recompute and re-approve if main advances.
- Original manager invite PR #2579 merged in `1bba36bedcd71cc21c4495973a2fffb404221315`. Its `thusico` approval covers its original head and review packet, **not automatically all new release actions or later main SHAs**.
- Owner authorization: one private staging Access tester `banabothem@yahoo.com`, hostname `manager-staging.thebedesk.com`, no production activation.
- Distinct Cloudflare Access app `7934753d-0188-4796-9288-bfd99d3be791`; sole allow policy `3f18551c-b867-4e73-bd7b-a6359297c791`, exact email as above. Cloudflare lists One-time PIN IdP; OTP receipt is not yet demonstrated.
- Isolated D1 `bw-manager-invitations-synthetic-staging` / `518a9e33-b2ba-4204-ac52-aae4150a7b52`; read-only recovery bookmark retrieval succeeded, actual restored-state check remains pending.
- Worker candidate `bw-manager-invitations-functional-private-staging` **does not yet exist** in the inspected account. No DNS, custom domain or Worker route for manager-staging hostname was present at inspection.

## Reviewer must verify before staging Worker creation

1. Rebase / inspect the exact current main SHA and pin its compiled Worker source, assets manifest, Wrangler configuration and dependencies. Verify that unrelated changes since merged PR #2579 do not alter manager access semantics.
2. Confirm Access app is `self_hosted`, exact-host only, with **one** allow policy for `banabothem@yahoo.com`, no Everyone/bypass/service tokens/wildcards and no additional unexpected precedence; confirm One-time PIN delivery and IdP eligibility.
3. Verify Worker bindings: `DB` only isolated manager D1, `ASSETS` static files, no production DB, R2, billing/payment, queues, scheduled jobs or AI bindings.
4. Keep `workers_dev=false`, `preview_urls=false`, all three `MANAGER_INVITATIONS_* = false`, `REGISTRATION_MODE=hold`, empty public origin until Access-first ingress is approved. No accidental production or public route.
5. Have approved process generate `SESSION_SECRET` securely as a **staging Worker secret binding only**. Never place secret bytes in a PR, comment, local document, workflow log or source.
6. Produce an isolated D1 schema preflight plus Time Travel bookmark; verify rollback/teardown evidence and no customer records.
7. Independently approve exact source, Access policy, bindings, staging secret and rollback plan in a new review decision before any Worker activation / DNS / custom domain routing.

## Controlled execution after approval only

- Verify the Access protection intercepts **all seven** paths enumerated by `scripts/manager-staging-access-preflight.mjs` with redirects disabled; deny uncredentialed and non-allowlisted users.
- Use synthetic tenant/owner/manager identities to test invitation creation; fragment-only one-time token claim and replay denial; login; assigned location dashboard; cross-tenant denial; grant revocation; suspension; D1 recovery.
- Redact tokens, cookies, passwords, OTP and SESSION_SECRET in all receipts. Record actual Cloudflare IDs and deployment version; do not infer test success from local unit CI.
- Production remains disabled until **separate exact-SHA owner authorization and fresh independent `thusico` approval**.

## Current stop gate

Review-only. App and policy exist; the exposed hostname and functional Worker do not. **Do not create public routing, deploy functional code, or mark staging tests complete until independent exact-main review and Access-first negative testing are possible.**
