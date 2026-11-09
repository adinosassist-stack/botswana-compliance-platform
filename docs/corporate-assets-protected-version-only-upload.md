# Corporate Assets — protected version-only source upload

## Authorization boundary

This is a *write-capable workflow*, but this PR does not execute it. Manual `workflow_dispatch` must run from the exact live `main` commit with `mode=create-version-only` and `authorization=CREATE_ISOLATED_ASSETS_SOURCE_VERSION`. The dedicated `corporate-assets-staging-protected` environment requires independent `thusico` approval, prevents self-review and is main-only. The previous read-only approval **does not authorize this write**. A PR or default preflight dispatch cannot upload.

## Exact steps in the protected job

1. Verify protected GitHub policy and exact live current main SHA; inspect existing historical v3 and full account-wide zone/Worker private exposure inventory via GET.
2. List all Worker versions and deployments, requiring complete metadata, the known rollback v2 version at 100%, no existing public access, and existing `secret_text` credential types plus isolated D1.
3. Run two independent offline pinned Wrangler dry-run compilations. The executable JavaScript must match; generated sourcemaps/README may vary and that is not accepted as full artifact identity.
4. Recheck GitHub protected policy and exact main before mutation. Run `wrangler versions upload --strict` using a temp JSON config that has no routes, no workers.dev, no preview URLs, disabled writes and isolated D1. This creates an undeployed version, not a deployment.
5. Read the Worker version list and require precisely **one new version**. Read its bindings: secrets must remain `secret_text`, isolated D1 retained, source marker exact, dangerous features/payment/registration disabled. Recheck deployment history and account-wide public route exposure.
6. Emit a receipt with a new version ID, local executable SHA-256, and *explicitly false* uploaded-bytes-cryptographically-verified and deployment-authorized fields.

## Critical evidence limitation

Wrangler and Cloudflare return authenticated version metadata, but this path does **not** establish byte-for-byte equivalence of the exact compiled version served by Cloudflare. The source SHA marker and opaque Cloudflare ETag are not such proof. Future deployment still needs independently verified source-to-upload evidence, secret-value continuity or suitable controls, and separate owner and reviewer approval.

**If the upload succeeds but subsequent verification fails, a new undeployed candidate may remain in Cloudflare. Do not blindly rerun: inspect the version inventory and reconcile the candidate first.**

Cloudflare Workers docs indicate Wrangler secrets are not removed by deployment, yet this flow still independently requires credential binding types before and after. No secret values are read, logged, invented or rotated.

References: https://developers.cloudflare.com/workers/wrangler/commands/workers/ ; https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/ .

## Non-goals

No production change, no D1 mutation, no Workers.dev/preview enablement, no traffic shift, no Worker deployment and no activation of Corporate Assets functionality. The historical v3 is not promoted or falsely certified.