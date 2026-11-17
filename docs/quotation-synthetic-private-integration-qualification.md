# Quotation private integration — synthetic source qualification

**Status: SOURCE ONLY — UNMOUNTED.** This change is not authority for
Cloudflare deployment, a real customer quotation service, a template upload,
the old 404-version operation or production activation.

## Purpose

The new server/quotation-synthetic-private-integration.mjs assembles the
already-reviewed private D1 session verifier, host session gate and portable
quotation handlers, without duplicating their authentication SQL or billing logic.

It exports only a factory and an explicit handle(request) method.
It does not export a Worker fetch entrypoint, register routes, read real
customer records or create any Cloudflare resources. Callers must explicitly
pass enabled=true, the quotation-private-staging environment, a virtual
.test/.invalid HTTPS origin, a dedicated internal caller secret distinct from
the session HMAC secret, an exact expected synthetic tenant ID, and isolated
resource identity. Default remains disabled.

The factory checks that auth D1 and quotation D1 bindings are distinct and
the supplied resource identities match the dedicated IDs/names:

- Synthetic AUTH D1: d7ad8e99-2ee4-446c-9358-0e186031571d
- Quotation D1: aec227e9-b0f2-4b00-8de0-105465c4e2d6
- Private logo R2: bw-quotation-logo-private-staging
- Private template R2: bw-quotation-template-private-staging

**These strings do not prove actual Cloudflare binding identity.** A protected
host must independently verify remote bindings and reject production or
cross-environment binding before construction.

## Security boundaries

1. The internal caller is checked before session cookies, D1 or body reads.
   Any failure returns a generic 404. Only six quotation endpoints may be
   delegated; the origin is a nonpublic synthetic test domain.
2. Verified session and active matching tenant membership are required;
   actor/tenant are never accepted from client JSON, query or companyId.
3. Edit/read rights derive from verified actor and exact tenant. Staff may
   read; only owner/admin/manager may mutate.
4. Mutations require private same-origin and verified session-bound CSRF.
   Existing D1/R2 handlers still enforce tenant and revision checks.
5. The original two-page Lovely PDF remains untouched. The new full-text
   browser preview is not yet approved contractual or worker-side PDF output.
6. Cloudflare Worker bw-quotation-auth-private-staging has one **undeployed**
   source-reviewed static 404-only version `cc20de6e-ab08-409f-89a1-390e0eaf5be1`,
   created under separate owner and independent thusico approval. A fresh
   Cloudflare GET on 17 Nov 2026 confirms `deployed_on:null`, zero deployments,
   both public/preview URL settings disabled and no domain references.
   This version contains **no quotation application code or bindings**.
   Do not deploy or replace it under source-only PR #2566.

## Test and approval

The Quotation Real PDF Acceptance workflow invokes
tests/quotation-synthetic-private-integration.test.mjs with synthetic mocks.
It tests denied internal caller, invalid origin, wrong tenant, invalid CSRF,
staff mutation and independent resource identity, plus an isolated read.

Passing CI is NOT real private staging end-to-end qualification.
Before Cloudflare staging use, obtain separately recorded exact-main owner and
independent thusico approval, qualify Worker/bindings and private template R2
object, test actual authenticated synthetic create/edit/PDF/recovery, and prove
no URL exposure or cross-tenant access. No production activation.

## Current operational blocker

**Previously approved 404-only upload is complete, not pending.** Issue #2542
comment #6936158566 records one successful, version-only upload under
renewed, matching approvals on historical main
`03229409c314ab0164434ba295447d4384910544`.
The dedicated Worker remains undeployed and unexposed; no replay is permitted.

Source-only PR #2566 subsequently passed independent `thusico` review and
merged to main at `47b35ba367a8d8d8125d2bf9b561e602b53f4da1`.
That source merge did **not** authorize a real private quotation Worker version,
D1/R2 binding, synthetic seed data, customer PDF upload, contractual terms,
production activation or real customer issuance.

The next step is a separately authorized, exact-current-main private staging
qualification with real (but synthetic-only) data, bound resources verified
against independently inspected Cloudflare evidence, explicit approved
recovery/abort plan, verified authentication and tenant isolation, then
actual PDF/reload/CSRF negative tests. Never treat old SHA-scoped approvals,
tests or the mere existence of a 404 version as authorization for this step.

The source-only `scripts/quotation-private-version-readiness-guard.mjs`
assesses verified Cloudflare GET snapshots and auth table row counts for
requesting a future approval, not for deployment. It must receive freshly
independently verified source SHA, Worker, version and no-exposure metadata;
unknown bindings or missing resource evidence fail shut. Even a passing
result sets `deploymentAuthorized`, `versionUploadAuthorized`,
`bindingAuthorized`, `templateUploadAuthorized`,
`customerIssuanceAuthorized` and `productionAuthorized` to `false`.
