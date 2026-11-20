# C4 customer quotation — OFFLINE compiled Worker review handoff

**SOURCE/CI REVIEW ONLY. NOT A STAGING DEPLOYMENT. NOT CUSTOMER LOGIN.**

This single consolidated batch produces a bounded SHA-256 evidence artifact for the
already merged, **default-404-only** C4 customer quotation Worker candidate.
It does **not** turn that module into a real OIDC host, does not create a Google
project or OAuth client, does not link a real external customer to a quote and
does not modify any Cloudflare account.

## Exact existing source scope

- Repository: adinosassist-stack/botswana-compliance-platform
- Worker name: bw-customer-quotation-identity-private-staging
- Source: server/essentials-private-customer-worker-candidate.mjs
- Manifest: deploy/customer-quotation-private-staging/wrangler.jsonc
- Isolated customer D1 binding: CUSTOMER_CONSENT_DB
- D1 UUID: 56f48000-9d89-47d5-a077-47dfe0825662
- Public routes: none
- Worker.dev: disabled
- Preview URLs: disabled
- Main entry: unconditionally returns 404

Existing bw-quotation-auth-private-staging is a different inert quotation
bootstrap, and must never be presented as the new C4 customer host.

## CI build / evidence boundary

The new path-scoped GitHub Actions job performs only these actions:

1. Checks out the current PR/commit without preserving credentials.
2. Uses the repository Node version and exact lockfile / Wrangler 4.135.0.
3. Runs the existing private Worker adversarial suite and new receipt
   tampering, no-public-route, source and binding negative tests.
4. Executes a Wrangler *dry run* that writes the compiled JS into the local
   ephemeral runner directory; **no Cloudflare API mutation step exists**.
5. Verifies the expected compiled worker.js, hashes the source/manifest/tests/
   lockfile and every compiled file, and emits a JSON evidence receipt with
   checkout SHA, source-input digest, exact binary SHA-256 and receipt digest.
6. Saves the offline compiled bytes and receipt as a short-retention CI artifact.
   The artifact is neither uploaded to Cloudflare nor approved for upload.

The checkout SHA is evidence about the *actual checked-out code*. Pull request
jobs may check out GitHub-generated merge refs; therefore a PR receipt must
**not** be misidentified as a separately approved exact-main artifact.
After independent source merge, the same workflow can run on main to make
a main-event receipt. Every later source/configuration change invalidates
the previous receipt.

**The bundle currently authenticates nobody:** its default HTTP handler is
all-404. A future reviewed *executable private host* will need its own pinned
compiled binary and new source review; this artifact only establishes the
build/receipt method and current deny-all baseline.

## Remaining blockers before private login testing

- Independent, restricted Google project/client/issuer and confidential
  authorization-code exchange. No new broad OAuth cloud-platform consent or
  Google resource create has been approved by this source change.
- A trusted real-customer ownership verifier from the authoritative tenant
  and quotation records, a separately approved invitation delivery authority,
  and a frozen quotation with complete contractual terms.
- A private HTTPS host, verified Access policy, complete isolated nonproduction
  D1 binding, scoped secrets and audited recovery/restore proof.
- Genuine IdP PKCE/nonce/callback, one-use customer session, wrong-tenant,
  forwarded-link, stale/replayed invite, CSRF, browser/mobile and explicit
  accept/reject end-to-end tests in a separately authorized isolated staging.
- Fresh exact-binary resource approvals, independently authored by the owner
  and thusico; separate formal production release after staging acceptance.

Passing CI or receiving the offline bundle cannot set any deployment,
database-write, customer-invitation or production-login gate to approved.
