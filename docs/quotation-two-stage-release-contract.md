# Quotation release contract: draft-only private stage before full PDF release

**Status: proposed source/release-plan clarification. No deployment, template upload, customer issuance, or Cloudflare mutation authorized.**

## Verified source boundary

The current entrypoint `server/quotation-service-bound-staging-worker.mjs`, configured by `deploy/quotation-private-staging/wrangler.jsonc`, is a **private synthetic draft service candidate**, NOT a complete quotation application.

It accepts only `GET /api/quotation/drafts` and `PUT /api/quotation/drafts` via a service-binding-only caller, with an expected synthetic origin, private-caller secret, tenant-scoped session, role controls and mutation CSRF. The current source **deliberately denies PDF preview, logo upload and issuance routes**. The test `tests/quotation-service-bound-staging-worker.test.mjs` asserts those denials. Therefore a deployment of this entrypoint cannot be represented as enabling a customer-facing quotation editor or PDF download.

The reviewed release-plan alternative in PR #2596 defers the *optional* synthetic caller and private Workflow harness. That de-scope does not grant a new access mechanism, allow public routing or exempt the quotation Worker from authenticated live staging acceptance.

## Stage A — isolated synthetic draft acceptance only

Before any executable private staging version or deployment, owner and independent `thusico` must approve the **exact current source/binary**, isolated D1 resource bindings, staging-only secrets and authenticated private invocation. The mechanism must not rely solely on a caller header or publicly reachable virtual origin. No public/custom route, workers.dev, preview URL, scheduled trigger, Workflow execution, real customer data or production changes.

### Acceptance evidence

- Exact approved Worker binary/manifest hashes and independently verified Cloudflare bindings:
  - `AUTH_DB` = `d7ad8e99-2ee4-446c-9358-0e186031571d`
  - `QUOTE_DB` = `aec227e9-b0f2-4b00-8de0-105465c4e2d6`
  - `LOGO_R2` = `bw-quotation-logo-private-staging`
  - `TEMPLATE_R2` = `bw-quotation-template-private-staging`
- Synthetic tenant/actor/session setup in isolated AUTH D1, with separate explicit write authorization; no replay of completed quotation schema migrations.
- Authenticated draft PUT then GET/reopen and revision update with correct BWP totals. Negative evidence for anonymous, cross-tenant, staff mutation, invalid CSRF, stale revision, and invalid private caller.
- Verify **404 on PDF, logo and issue routes in this Stage A Worker**; never call them completed.
- Prove data isolation, exact redacted audit receipts and real rollback/cleanup using isolated synthetic resources. A backup bookmark alone is not tested restore.

**Stage A completion proves only the isolated draft service, not PDFs or public quotations.**

## Stage B — full quotation PDF application

Separate review and implementation are required to mount the full two-page PDF, private template and logo pipeline behind actual verified sessions/tenant/CSRF. Final Lovely template candidate B is not globally accepted merely because its five-office footer was approved. Track in #2542:

- Qualified Botswana contract/consumer-terms review, exact two-page rendering, owner acceptance of legal issuer, payment instructions and final SHA.
- Owner plus independent `thusico` exact SHA + scoped tenant R2 object upload approval; validate stored bytes and private access.
- Actual Workers-runtime-compatible PDF and PNG-only processing tests; reject unsupported image types.
- Protected staging tests of edited customer information, items/discounts, draft save/reopen, actual two-page PDF composition and nonissuance preview, logo position, cross-tenant/role/CSRF denial, and tested recovery.
- Exact-current-main independent production approval and postflight before exposing any customer-facing quotation routes.

## No false readiness claims

| Capability | Current private Worker | Stage A live test | Stage B full launch |
| --- | --- | --- | --- |
| Draft GET/PUT implementation | Source present | Requires protected live test | Required |
| Authenticated tenant/role/CSRF boundary | Source and offline tests | Requires real verification | Required |
| Logo upload | Deliberately denied | Must remain denied | Separate integration and acceptance |
| Two-page PDF preview | Deliberately denied | Must remain denied | Separate integration and acceptance |
| Customer quotation issuance | Deliberately denied | Must remain denied | Separate production authorization |
| Optional Workflow harness | Deferred | Not a prerequisite if replacement private evidence approved | Not a prerequisite |
| Public access | Disabled | Must remain disabled | Separate explicit approval |

**Reviewer request:** Independently verify this source/feature boundary, approve or correct the Stage A and B evidence requirements, and identify the actual private invocation mechanism before any operational approval. Approval of this document is never upload/deploy/execution authorization.
