# Thebe Life inert private staging Worker — protected deployment runbook

Dedicated Cloudflare D1 is `bw-life-staging` (`fa58bcb8-5871-4272-b3e8-c8cc2548dcd2`), with six isolated Life tables. Never use production, billing, POP, General AI, or operations D1.

This workflow is **manual only** and runs exclusively from the exact reviewed `main` SHA. It requires a pre-existing and verified GitHub environment `thebe-life-private-staging` with `thusico` as required reviewer, prevention of self-review, and only the `main` branch allowed. The first job checks those settings **before** the deployment job references the environment, avoiding implicit creation of an unprotected environment.

Prerequisites: a GitHub token for read-only environment protection inspection saved as repository secret `LIFE_STAGING_GITHUB_ENV_READ_TOKEN`; in the protected environment, dedicated least-privilege Cloudflare worker-only deployment token `LIFE_STAGING_CLOUDFLARE_TOKEN` and `LIFE_STAGING_CLOUDFLARE_ACCOUNT_ID`. Do not reuse production or payment tokens. Never put token values in the repository or chat.

After protected PR merge and independent approval, dispatch `Thebe Life protected private Worker deployment` on `main` with exact `source_sha` and `approval_phrase` equal to `DEPLOY_INERT_THEBE_LIFE_PRIVATE_STAGING`. GitHub must request independent `thusico` deployment approval. Confirm this is a distinct deployment approval, not just PR review.

The deployed entrypoint always returns HTTP 404, with `workers_dev=false`, `preview_urls=false`, no public routes/domains, and Life household, insurance, motshelo payments and public route flags disabled. No customer data, migration, or financial movement. Verify Cloudflare script exists and still has no route/preview before marking successful.

**Do not dispatch if the environment protection cannot be verified.** On any failure, leave the Worker undeployed and investigate permissions or environment settings. This release does not enable a family tester API.
