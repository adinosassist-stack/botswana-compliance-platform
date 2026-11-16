# Quotation Module: protected staging isolation plan

**Current status (16 Nov 2026):** The two separately authorized, immutable quotation D1 SQL migrations were executed **once** in the isolated D1 and post-verified in issue #2504 comment #6927692011. Three empty quotation application tables and one index now exist. The historical pre-migration preparation steps below are retained for audit only; **do not re-run the CREATE statements**. This plan does not authorize additional D1 writes, R2 uploads, Worker deployment, public access or customer quotations.

## Verified isolated infrastructure (2026-11-16 UTC)

Created after separate owner and independent `thusico` approval recorded in issue #2504:
- D1: `bw-quotation-staging`, UUID `aec227e9-b0f2-4b00-8de0-105465c4e2d6`
- Private logo R2 bucket: `bw-quotation-logo-private-staging`
- Private template R2 bucket: `bw-quotation-template-private-staging`
- Private key prefixes expected by the existing adapters: `quotation-logos/` and `quotation-templates/`

Before migration, Cloudflare read-only metadata reported **zero application tables** in the new D1; the current verified post-migration count is **three application tables and one index**. Both R2 buckets had `r2.dev` disabled and no custom domain. These checks do not prove future Worker configuration or binding isolation. Do not reuse production or unrelated staging storage. Never enable public R2 URLs, Worker routes, `workers.dev` or preview URLs while staging qualification remains incomplete.

**Resource creation and the exact two-file staging schema migration are complete** (owner/reviewer and recovery approvals: issue #2504 comments #6916022563, #6927289181, #6927478636). **Worker activation and private template upload have NOT been approved.**

## Qualification and approval order

1. Read exact current main SHA from GitHub and independently verify it against the proposed staging source. The preflight only compares SHA inputs; it cannot prove GitHub origin.
2. Obtain distinct owner authorization and independent thusico review before provisioning, migrating, activating or promoting resources.
3. Resource provisioning is complete; do not recreate or bind those resources to an unauthorized runtime.
4. **Completed historical step:** Independently reviewed `docs/sql/quotation-logo-staging-candidate.sql` and the draft SQL candidate, confirmed unchanged immutable Git blobs, accepted the recovery procedure, and executed only the four approved DDL statements in dedicated staging D1. They intentionally use `CREATE` without `IF NOT EXISTS` so repeating them will fail; **never rerun**. Any future schema change requires its own new exact-scope owner/`thusico` approvals.
5. Independently inspect the clean Lovely two-page PDF for blank logo zones, intact terms, correct labels and no leftover customer data. The original client PDF is NOT an approved reusable template. Store a reviewer-approved, SHA-256-pinned, logo-free PDF privately; do not commit the customer PDF.
6. Adapt the existing verified server session and company permissions; enforce authenticated edit role and CSRF before reading request bodies. Never trust company IDs from the browser.
7. Run qualifyQuotationPrivateStaging with verified distinct D1 UUIDs, private R2 bucket names, explicit no-exposure flags, read-only bindings and matching source SHAs.
8. Run real authenticated synthetic-tenant staging acceptance: upload normalized PNG, save layout, reload private logo, preview quotation with integer BWP totals, compare actual PDF page content and logo zones.
9. Require independent thusico approval and all protected exact-main CI before any production promotion.

## Staging SQL review limitations

The schema enforces tenant-scoped asset identifiers and R2 object keys, logo dimensions and aspect ratio consistency, two-table foreign-key integrity, and left/right logo boundaries. Vertical logo geometry depends on the referenced logo aspect ratio and **is not guaranteed by SQL alone**; the saved-settings service and PDF renderer must continue enforcing vertical height and approved logo zones. The test workflow runs on an ephemeral in-memory SQLite database with no Cloudflare tokens, not on live D1. The earlier migration was authorization-gated and has now been executed and verified once.

## Runtime blocker

The production frontend is served primarily through a Cloudflare Worker using D1/R2. The separate Node app uses PostgreSQL and S3. The current quotation Node staging composition uses a D1-style store, Node-only PNG decoding (node:zlib) and an injected PDF engine. It is NOT ready to mount in either live host. Isolated CI installation of pdf-lib does not install that package in production.

## What read-only preflight means

The preflight only checks supplied isolation IDs, explicit exposure flags, available D1 schema and private R2 list permissions. It performs a SELECT and private bucket list operations; no writes. A successful result is NOT proof that the IDs were correctly sourced, the template is approved, the user/session pipeline is integrated or deployment is authorized. deploymentAuthorized is always false.

Production databases, payments, routes and customer data must remain unchanged.

## Read-only inventory runner (added 2026-11-15)

The operator may invoke the manually dispatched, main-only GitHub Action
`.github/workflows/quotation-staging-inventory.yml` after the PR is reviewed and
merged. It calls only Cloudflare D1/R2 metadata GET endpoints. The workflow
requires these configuration items to be set by a privileged administrator:

- secret `QUOTATION_STAGING_READ_TOKEN`: read-only Cloudflare token scoped to the selected account (D1 Read and Workers R2 Storage Read only)
- variable `QUOTATION_CF_ACCOUNT_ID`: Cloudflare's exact 32-character account ID
- variable `QUOTATION_PRODUCTION_D1_ID`: known production D1 UUID used to forbid reuse
- variable `QUOTATION_PRODUCTION_R2_NAMES`: comma-separated known production bucket names; this list is mandatory and must be reviewed for completeness

The workflow supplies its own exact GitHub SHA and never accepts an input token
or client-provided tenant ID. The script returns exit code 2 while any dedicated
quotation resource is absent; this is an expected blocker, not permission to
create resources. It never stores API response bodies as artifacts or logs
credential values. A positive inventory result only confirms resource presence
and nonidentical **listed** IDs/names; it does not verify bucket public-access
settings, Worker routes, staging schema, private template approval or deployment
authorization. Do not enable any production or public route based on that result.


## Draft save/reload schema — migrated, runtime still gated

The `quotation_drafts` table and its index are now installed in isolated staging D1 after the separately authorized draft SQL migration. The source-only quotation draft runtime remains UNMOUNTED and NOT customer-enabled. Both logo and draft SQL were executed once, as documented in issue #2504 #6927692011.

- Executed-once migration provenance (do not rerun): `docs/sql/quotation-drafts-staging-candidate.sql`
- Exact target if separately approved: D1 `bw-quotation-staging`, UUID
  `aec227e9-b0f2-4b00-8de0-105465c4e2d6`
- Required objects: `quotation_drafts` with tenant-scoped compound key, and
  `idx_quotation_drafts_tenant_updated`
- Strict source-only verification:
  `qualifyQuotationDraftPrivateStaging` runs the existing identity / R2
  isolation preflight and a **SELECT from sqlite_master** to check the draft
  DDL against the pinned review-only SQL; it also rejects unknown user tables
  and named indexes. It has no database mutation, migration or deployment.
- It purposely reports `logoSchemaDeepVerified=false`: checking the logo
  tables' names does not prove their constraints or PDF rendering.
- Missing approved tables or unexpected schema are **blockers**, not permission
  to apply migrations automatically.
- Before any **new** D1 migration, reverify current `main`, the new authorized SQL blob and target UUID, secure distinct owner/`thusico` execution approvals, current schema inventory and accepted recovery plan. **Do not** demand an empty database for the already completed migration or treat old approval as reusable.
- Even a positive read-only result returns
  `deploymentAuthorized=false`, `migrationAuthorized=false`,
  `templateUploadAuthorized=false` and
  `privateWorkerBindingAuthorized=false`.

After schema approval, actual encrypted/private runtime compatibility, authenticated
synthetic tenants, CSRF denial, preview-only PDF terms, and customer-data
segregation must be proved in isolated staging. No template/customer PDF may be
uploaded until its distinct visual and privacy approval is recorded.
