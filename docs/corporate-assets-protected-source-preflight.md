# Corporate Assets: protected source-to-upload preflight (read-only)

**Status:** protected preflight is implemented; source-to-upload provenance and deployment are **not** yet authorized or implemented.

## What this phase does

`.github/workflows/corporate-assets-protected-provenance-preflight.yml` provides:
- Offline tests for each PR changing this qualification.
- Manual **main-only** protected preflight using `corporate-assets-staging-protected`. It requires an exact reviewed main SHA and explicit `READ_ONLY_ASSETS_SOURCE_PREFLIGHT` input, then waits for the independently managed `thusico` environment approval.
- A second independent check of live GitHub main tip, required reviewer, self-review prevention, admin bypass disabled and exact main-only branch policy before reading Cloudflare.
- Cloudflare GET-only inspection of old staging v3 and deployment metadata, along with an offline SHA-256 source-input manifest.
- An explicit non-release receipt with `exactSourceUploadVerified:false`, `uploadAuthorized:false`, and `deploymentAuthorized:false`.

No token values are logged and no Cloudflare mutation is called. The existing dedicated staging environment secrets are accessed only inside the protected manual job, never on untrusted pull-request jobs.

## How to run (only after merge and separate independent authorization)

Open the workflow under GitHub Actions on `main`, choose `preflight-only`, enter the exact latest reviewed `main` SHA and `READ_ONLY_ASSETS_SOURCE_PREFLIGHT`. The protected job cannot proceed without `thusico`'s independent environment approval. Inspect the receipt and errors. This is **not** permission to create a Worker version or shift traffic.

## Remaining release blockers

A new version-only source upload must be separately proposed, reviewed and explicitly approved. The upload pipeline must bind the exact reviewed checkout and source artifact hash to an independently verifiable Cloudflare version/upload receipt, preserve separate protected staging credentials, verify no write-flag/route changes, and demonstrate a safe rollback. If evidence is insufficient, release must fail closed.

The existing v3 Worker carries the historical `ASSETS_STAGING_SOURCE_SHA`; matching Cloudflare ETags or offline SHA-256 source-input receipts cannot retroactively prove a current-main upload. Keep the currently deployed v2 at 100%, staging assets/writes disabled and production unchanged.
