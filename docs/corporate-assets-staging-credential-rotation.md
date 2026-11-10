# Corporate Assets: staging-only credential replacement

Status: **review preparation**, not a staging deployment authorization. Production and
staging asset writes remain disabled. Never use production database or production secrets.

## Verified preconditions (9 November 2026)
- Worker: `bw-corporate-assets-staging`; isolated D1: `e19f09de-3bb9-4021-b4f8-44df04c8aaa8`.
- Isolated marker and nine table-column preflights pass.
- Both `SESSION_SECRET` and `AUDIT_INTEGRITY_SECRET` are currently `plain_text`.
- The deployed source marker is an ancestor of current main; it is **not**
  an exact reviewed-current-main deployment receipt.
- Deployment profile: `corporate-assets-isolated`; both writes and asset flags `false`.

## Protected execution sequence (not executed by this document)
1. Confirm a **pre-existing** `corporate-assets-staging-protected` GitHub environment
   with `thusico` as required independent reviewer, self-review prevention,
   main-only branch policy, and a dedicated least-privilege Cloudflare token.
   Creating a missing environment implicitly is **not** approval.
2. Confirm the exact protected `main` SHA and version/binding provenance. Do not
   accept a detached source marker or any change to route, origin, D1 ID or
   default-off write flags. Review a rollback to the prior private version.
3. Generate **two different** cryptographically random staging-only secrets
   within the approved secret-handling execution environment. Never print,
   upload to artifacts, echo in commands or save them in GitHub source.
4. Use a **version-only** secret update mechanism supported by the pinned
   Wrangler version (see Cloudflare's `wrangler versions secret put` guidance).
   Do not use `wrangler secret put`: it can deploy immediately. Creating a
   version does not grant permission to deploy it.
5. Verify on the specific **candidate version** that both bindings have
   `type=secret_text`, the correct isolated D1 remains bound, and
   `ASSETS_STAGING_WRITES_ENABLED=false` and
   `THEBE_CORPORATE_ASSETS_ENABLED=false`. Explicitly prove no routes or
   public preview were introduced, and no automatic traffic was shifted.
6. Independently approve the candidate and perform a protected deployment
   **only** after version/source and policy checks pass. Re-run the read-only
   metadata preflight using a dedicated read-only token, with `EXPECTED_MAIN_SHA`
   set to the exact reviewed SHA.
7. Qualify authenticated login/CSRF, same-tenant create → readback/relogin,
   idempotency/concurrency, audit integrity, cross-tenant denial, service
   scheduling, and mobile navigation against isolated D1 **only after** a
   separate approved staging-write enablement. Do not reuse test credentials.
8. Production migration, feature activation and customer traffic always need
   separate explicit write and release approvals.

## Read-only remote preflight

`node scripts/corporate-assets-staging-remote-preflight.mjs` requires
`EXPECTED_MAIN_SHA` (40 hex) and
`ASSETS_STAGING_CLOUDFLARE_READ_TOKEN` from a secure secret provider.
It performs only `GET /workers/scripts/bw-corporate-assets-staging/settings`,
returns fixed reason codes and does not print binding or secret values. A
passing receipt means **only** the metadata binding guard passed — not a
staging functional or production qualification.

Source: https://developers.cloudflare.com/workers/configuration/secrets/

## 10 November 2026 — deployed version differs from latest settings

**Verified read-only against Cloudflare account metadata; no secret values accessed:**

- Current `bw-corporate-assets-staging/settings` and `/secrets` endpoints report `SESSION_SECRET` and `AUDIT_INTEGRITY_SECRET` as `secret_text`. These endpoints may report the **latest candidate settings** rather than the code and bindings receiving traffic.
- Current **active 100%-traffic deployment** remains Worker version **2**, UUID `5497120e-4ae6-4665-b96f-4b040d32a249`, created 5 November 2026. Direct `/versions/{id}` readback reports both sensitive bindings as **`plain_text`**. Do not label active version secure or claim secret rotation completed just because generic settings are safe.
- A separate, **undeployed** version **3**, UUID `983daaea-1e6b-4359-9994-0b792578008b`, holds both as `secret_text` and preserves staging database isolation and write flags OFF, but has stale embedded source marker `062ef3ea4c598d38a56e15dba1691c30aa4e5c72`. It cannot be accepted as an exact-current-main Worker build or deployed merely to remove the plaintext without fresh source/credential provenance and independent authorization.
- Public `workers.dev` subdomain and preview URLs were disabled at readback. Both staging assets and writes are OFF, and no customer traffic is routed to this Worker. These guards limit exposure but **do not fix historical plaintext credential handling**.

**Updated metadata guard:** `scripts/corporate-assets-staging-remote-preflight.mjs` now reads the active deployment, each positive-traffic Worker version's actual bindings, and the deployment once again to reject drift. It requires `secret_text` for each credential, exact reviewed source SHA, correct isolated D1 and both feature/write flags OFF on active versions as well as latest settings. This is **read-only**, fails closed, emits only sanitized reason codes and cannot authorize deployment or attest compiled source bytes.

**Next separate operational actions (not performed here):** Independently confirm that exposed old values have been invalidated and replaced by fresh unrelated staging-only secrets; qualify an exact-current-main private Worker version with authenticated bundle/provenance hashes, protected source upload and independent `thusico` approval. Only after version-level and route/account-wide exposure checks pass may an owner initiate a **separately approved protected staging deployment**. Keep the staging flags OFF until isolated authenticated write/E2E acceptance is separately approved. No production database migration, deployment, payment approval, feature activation or traffic shift is authorized by these notes.
