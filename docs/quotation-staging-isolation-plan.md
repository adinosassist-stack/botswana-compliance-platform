# Quotation Module: protected staging isolation plan

Status: PREPARATION ONLY. This plan does not authorize deployment, customer enablement, migrations or external access.

## Read-only infrastructure inventory (2026-11-15)

The connected Cloudflare account has no quotation-specific D1 database or private R2 buckets. Existing staging databases and buckets serve other application workloads. Do not reuse those or production resources for quotations.

## Proposed resources (NOT provisioned)

- D1: bw-quotation-staging
- Private logo bucket: bw-quotation-logo-private-staging
- Private template bucket: bw-quotation-template-private-staging
- Private prefixes: quotation-logos/ and quotation-templates/

Never enable public bucket URLs, Worker routes, workers.dev or preview URLs while the staging worker remains inert.

## Qualification and approval order

1. Read exact current main SHA from GitHub and independently verify it against the proposed staging source. The preflight only compares SHA inputs; it cannot prove GitHub origin.
2. Obtain distinct owner authorization and independent thusico review before provisioning, migrating, activating or promoting resources.
3. After separate authorization, provision dedicated D1 and R2. Do not reuse production D1 or unrelated R2 buckets.
4. Review and apply docs/sql/quotation-logo-staging-candidate.sql only to the dedicated isolated D1; this PR does not apply it.
5. Independently inspect the clean Lovely two-page PDF for blank logo zones, intact terms, correct labels and no leftover customer data. The original client PDF is NOT an approved reusable template. Store a reviewer-approved, SHA-256-pinned, logo-free PDF privately; do not commit the customer PDF.
6. Adapt the existing verified server session and company permissions; enforce authenticated edit role and CSRF before reading request bodies. Never trust company IDs from the browser.
7. Run qualifyQuotationPrivateStaging with verified distinct D1 UUIDs, private R2 bucket names, explicit no-exposure flags, read-only bindings and matching source SHAs.
8. Run real authenticated synthetic-tenant staging acceptance: upload normalized PNG, save layout, reload private logo, preview quotation with integer BWP totals, compare actual PDF page content and logo zones.
9. Require independent thusico approval and all protected exact-main CI before any production promotion.

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
