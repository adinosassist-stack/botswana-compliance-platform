# Thebe Desk quotation — exact private Worker review artifact

This workflow packages the **owner-confirmed final editable Lovely quotation** service. The HTML source with editable customer details and distinct Concrete / Grout 2kg rows is authoritative; the old Candidate B PDF is obsolete.

## What the artifact proves

`.github/workflows/quotation-final-html-private-bundle.yml` performs an offline Wrangler `--dry-run` build of `bw-quotation-final-html-private-staging` with isolated `@cloudflare/playwright@1.3.0` lockfile. The artifact contains the actual compiled Worker, its build metadata, reviewed Wrangler manifest, pinned npm lock, SHA256SUMS, and a deterministic tar archive with hash. The BUILD-REFERENCE records the exact GitHub checkout SHA (PR merge-context or main), so only a **main-event artifact** should be considered for a future staging version submission.

**No Cloudflare API credentials or upload steps are present.** Tests must pass on the exact reviewed source and the approved output bytes must match the captured checksums independently. The Worker default HTTP handler returns 404; the named RPC is never invoked by this workflow.

## Operational activation gate (not part of this PR)

1. Confirm latest `main` and source checkout SHA. Independently review the main-run artifact, each SHA-256, and the full Worker code + browser, D1, R2 and secret bindings.
2. Confirm the account has actual Browser Run binding entitlement and acceptable session pricing. Use only isolated quotation staging D1 and private logo R2; no production D1, no payments, no customer records.
3. Register the **exact** PNG extracted from the finalized HTML only through separately approved tenant-scoped private upload and verify its hash and two-page placement. The actual logo is **not** included in this artifact.
4. Provision distinct session and internal-caller secrets through approved secret settings; never commit, log or copy them into GitHub.
5. Require explicit owner approval and independent `thusico` acceptance **of the exact artifact and its proposed no-public-route staging upload/activation**, plus a rollback/teardown plan. A source PR approval alone is not sufficient.
6. Test a synthetic active tenant invitation/login, draft save/reopen/edit/revision denial, CSRF and cross-tenant denial, private logo, real two-page A4 PDF, browser closure and restoration/recovery.
7. Keep `workers_dev:false`, `preview_urls:false`, `routes:[]` and default fetch 404; separate protected release approval required for customer issuance or any public route.

## Existing read-only resource evidence

- Cloudflare account `ddd23cab31928a4bb3d4998df9b26d1d`
- Auth staging D1 `d7ad8e99-2ee4-446c-9358-0e186031571d`
- Quotation staging D1 `aec227e9-b0f2-4b00-8de0-105465c4e2d6`
- Private logo R2 `bw-quotation-logo-private-staging`
- Final Worker `bw-quotation-final-html-private-staging` was not yet created at last read-only check (Cloudflare code 10007).
- Final HTML template SHA-256 `c57be4e21c126dc318c0caafc17c04cdee50099e130db2f1796f2d93cc982449`
- Embedded lovely logo PNG SHA-256 `36439e3c7f3e8feaedb31347367c0bfd57f2516f8afde85fbec4c7bb3dfca610`

**Neither an offline build nor a passing CI gate is authority to create, upload or activate any Cloudflare resource.**
