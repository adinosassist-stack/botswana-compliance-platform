# Thebe Desk Essentials — protected quotation release candidate

**21 November 2026. Source/CI PR only. This document and its merge are NOT
a production release or Cloudflare execution approval.** Tracking #2735.

## Evidence and why this batch is necessary
- Protected source `main` at initial audit `089c47cc7384f73b6f522bc807d9819537e50a9b`.
- Merged quotation mobile print PR #2747, 11/11 CI passes,
  independent `thusico` approval. It introduces mobile help heading
  `How to save as PDF on your phone`, >=44px touch targets, and honest
  fallback. The original Lovely two A4 pages, red/charcoal/white styling,
  legal terms, sample watermark and browser-native `window.print()` remain.
- Production Cloudflare account `ddd23cab31928a4bb3d4998df9b26d1d`,
  Worker `bw-compliance-os` last observed deployment
  `be3e7c6b-be12-4dc1-b91b-bab1a47a2a8a` at
  **2026-11-20T08:51:15Z**, 100% version
  `7adb802d-30de-426a-afe5-52db7d375f63` (#613).
  This predates PR #2747. Do not mistake a merged PR for a live release.
- Read-only browser at `/js/quotation-customizable-page.mjs` lacked the
  new mobile help heading despite it being present in current GitHub source.
  This is confirmed **live/source asset drift** at the time of the audit.
  The raw live HTTP digest was not captured, so this is a feature-level
  content mismatch, not a full artifact integrity attestation.
- A clean non-signed-in browser displayed sample-only editors on both
  quotation preview and customer-ready paths; raw HTTP status was not
  captured and no real customer data exposure was observed. Current
  `cloudflare/src/quotation-browser-preview.js` requires an authenticated
  same-tenant onboarded owner for either route. Treat the observed behavior
  as an unqualified access boundary until exact postrelease HTTP denial.
  Client-side sample warnings are NOT authorization.

## Consolidated remediation in this PR
1. Before consulting the in-process `auth/me` resolver, reject a browser
   request lacking any session cookie for preview or customer-ready, even if
   the resolver would otherwise inadvertently return an owner. Preserve
   existing role/tenant/onboarding and missing binding 404 fail closed.
2. Add regression for **both slash spellings** of each document path,
   cookie-less guest, a fake 200 owner resolver, and invalid session,
   plus update synthetic Chromium two-page print fixture to carry a
   synthetic browser session cookie (not a real token).
3. Add `scripts/quotation-production-release-proof.mjs`, an **explicit
   read-only --live verifier** comparing `/api/version` release sequence
   and `sourceSha` to the current reviewed manifest; SHA-256 byte
   matching on exact production quotation JS; and HTTP **404** anonymous
   denial for both private quotation routes. No log of response bodies or
   customer data. Only GET requests, no cookies/auth, no redirects.
4. Add mock negative tests for stale release SHA, wrong asset, 200 sample
   instead of server denial, 302/404, failed network, malformed manifests
   and illicit origin. These tests run on PR without network credentials.
5. Add quotation live proof to the EXISTING postdeployment smoke workflow,
   which only follows approved production deployment authority or a separately
   owner-dispatched exact-SHA postdeploy verification. This modification
   **does not** create a production deployment workflow or trigger release.
6. Add isolated PR-only offline CI; preserve existing final Lovely two-page
   Chromium PDF acceptance. Real Android Chrome and embedded WebView
   user-gesture printing remain independent physical-device checks.

## Separate protected production promotion is still REQUIRED
1. Verify actual source SHA, branch governance and mandatory checks on exact
   latest PR head; independent `thusico` review and no unresolved threads.
2. Independently review this source patch and all included differences from
   production—not just quotation—before deciding whether a whole Worker
   promotion is safe. Confirm costs, payment-provider `none`,
   POP/AI flags OFF, D1/R2 bindings, secrets and recovery baseline.
3. Use a distinct manifest-only release PR advancing sequence by exactly
   one from reviewed `release/production.json`, pinning the exact
   approved source parent; BF-07 and all supply-chain checks must pass.
   Prior checks or stale SHA are not a substitute.
4. Owner must separately initiate the protected production deployment;
   independent environment reviewer `thusico` must approve it. No
   automatic deployment from this code-only PR.
5. Postdeploy perform exact version and JS digest checks and **actual HTTP
   404** against unauthenticated preview/customer-ready URLs, then owner
   synthetic browser quotation/print and rollback receipts. If either
   private route returns 200 for a guest, classify as **FAIL**, even
   with demo-only values or a warning banner. Do not assert customer
   issuance or bank-account verification.
6. Preserve the distinct C4 quotation customer identity/consent and
   isolated D1 staging approvals in #2695 and #2542. Never enable real
   customer issuance, use unverified finance bank credits or expose
   session/payment credentials as part of this release.

## Truth table
| Area | After source merge | Requires separate approval |
|---|---|---|
| Source cookie-less guest precheck | Merged after CI and review | Production promotion |
| Tenant/owner/onboarding session check | Existing source | Live auth-negative evidence |
| Mobile print guidance | Merged PR #2747 | Live asset update / real device test |
| Verified live JS SHA-256 | Offline verifier written | Production postdeploy check |
| Actual customer issuance/login | Still gated | C4 identity, consent, recovery, release |
| Production Worker / D1 / R2 / DNS | **Unchanged by PR** | Protected owner + `thusico` |
