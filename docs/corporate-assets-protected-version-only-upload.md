# Corporate Assets — protected version-only source upload

## Protected write-concurrency separation

An older [source-upload run #42719464957](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/42719464957)
from 2026-11-09 remains **waiting** for independent `thusico` environment approval
on an outdated source commit. It must not be approved as if it were current
main, and it must not be cancelled automatically without separate direction.
The static workflow-level concurrency group previously also blocked innocent
PR-triggered **offline CI** from starting.

The workflow now assigns **all write-capable `workflow_dispatch` attempts
the same original single-writer group**, while each pull request's
offline-only validation uses a distinct PR-specific concurrency group.
This permits security tests and code review to progress **without**
restarting or circumventing the pending protected operation. It does not
change the protected environment, separate owner authorization, or independent
review requirements.

## Authorization boundary

This is a *write-capable workflow*, but this PR does not execute it. Manual `workflow_dispatch` must run from the exact live `main` commit with `mode=create-version-only` and `authorization=CREATE_ISOLATED_ASSETS_SOURCE_VERSION`. The dedicated `corporate-assets-staging-protected` environment requires independent `thusico` approval, prevents self-review and is main-only. The previous read-only approval **does not authorize this write**. A PR or default preflight dispatch cannot upload.

## Required protected credentials and current blocker

The version-only workflow requires three **separate existing** GitHub environment
secrets: `ASSETS_STAGING_GITHUB_READ_TOKEN`,
`ASSETS_STAGING_CLOUDFLARE_TOKEN`, and
`ASSETS_STAGING_CLOUDFLARE_ACCOUNT_READ_TOKEN`.
The account-wide Worker domains and zone inventory must use the dedicated
account-read token, and the Worker route inventory must remain read-only.
Missing or malformed account-read credentials fail before any source upload.

**The current active staging Worker is NOT ready for a version-only upload.**
The protected read-only run #43697633873 on 2026-11-15 failed with
`active_version_credential_safety_not_verified`: active version
`5497120e-4ae6-4665-b96f-4b040d32a249` retains `plain_text`
binding types for `SESSION_SECRET` and `AUDIT_INTEGRITY_SECRET`.
**Updated after v4 creation (2026-11-15).** The Worker's latest mutable
settings now report `secret_text` after the single approved undeployed
secret candidate v4 `dc708a58-4da1-4af5-a10a-17ace5ea25fa`
was created. Those latest settings **do not repair the active immutable
version v2**: v2 at 100% still has `plain_text` credential bindings.

The version-only source uploader now checks **both** current settings and
the immutable active deployed credential types using the existing read-only
`inspectActiveAssetCredentialTypes` verifier **before compilation and again
immediately before Wrangler upload**. Both checks fail closed. This
prevents an unsafe source upload from being accidentally enabled simply
because the latest settings reflect the dormant v4 candidate.

The current source-only uploader also deliberately requires v2 at 100%.
If a future **separately authorized** staging credential transition
changes the active version, this v2 baseline condition will need explicit
review and an independently approved update; do not weaken it to make the
write run pass. The existing `CREATE_ISOLATED_ASSETS_SOURCE_VERSION`
authorization is **not** invoked or renewed by this code-only fix.

The new immutable check does **not** execute the workflow, change Worker
settings, roll or access secret values, or authorize deployment.

## Exact steps in the protected job

1. Verify protected GitHub policy and exact live current main SHA; inspect existing historical v3 and full account-wide zone/Worker private exposure inventory via GET.
2. List all Worker versions and deployments, requiring complete metadata, the known rollback v2 version at 100%, no existing public access, **both latest-settings `secret_text` types and independently verified immutable active-version `secret_text` types**, plus isolated D1. The active-version requirement currently fails by design.
3. Run two independent offline pinned Wrangler dry-run compilations. The executable JavaScript must match; generated sourcemaps/README may vary and that is not accepted as full artifact identity.
4. Recheck GitHub protected policy and exact main **and recheck the active immutable credentials** immediately before mutation. Run `wrangler versions upload --strict` using a temp JSON config that has no routes, no workers.dev, no preview URLs, disabled writes and isolated D1. This creates an undeployed version, not a deployment.
5. Read the Worker version list and require precisely **one new version**. Read its bindings: secrets must remain `secret_text`, isolated D1 retained, source marker exact, dangerous features/payment/registration disabled. Recheck deployment history and account-wide public route exposure.
6. Emit a receipt with a new version ID, local executable SHA-256, and *explicitly false* uploaded-bytes-cryptographically-verified and deployment-authorized fields.

## Critical evidence limitation

Wrangler and Cloudflare return authenticated version metadata, but this path does **not** establish byte-for-byte equivalence of the exact compiled version served by Cloudflare. The source SHA marker and opaque Cloudflare ETag are not such proof. Future deployment still needs independently verified source-to-upload evidence, secret-value continuity or suitable controls, and separate owner and reviewer approval.

**If the upload succeeds but subsequent verification fails, a new undeployed candidate may remain in Cloudflare. Do not blindly rerun: inspect the version inventory and reconcile the candidate first.**

Cloudflare Workers docs indicate Wrangler secrets are not removed by deployment, yet this flow still independently requires credential binding types before and after. No secret values are read, logged, invented or rotated.

References: https://developers.cloudflare.com/workers/wrangler/commands/workers/ ; https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/ .

## Non-goals

No production change, no D1 mutation, no Workers.dev/preview enablement, no traffic shift, no Worker deployment and no activation of Corporate Assets functionality. The historical v3 is not promoted or falsely certified.