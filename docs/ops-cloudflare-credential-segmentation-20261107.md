# Thebe Desk — Cloudflare recovery credential segmentation review (7 Nov 2026)

**Status: HIGH-PRIORITY ACCESS REVIEW / NO CREDENTIAL MUTATION / NO RESTORE AUTHORITY.**

## Direct live Cloudflare readback

- Account: `ddd23cab31928a4bb3d4998df9b26d1d`; protected main inspected `4bea712702a70d8d1c86e6107aea5e3e2c9ee2b5`.
- Account-members endpoint returned **1 accepted Super Administrator** (does not encompass all API principals).
- Account-token list returned **5 active account-scoped tokens**, total count 5. No token values were read.
- `Thebe Desk GitHub Production Deploy v2` is active; an **account-scoped allow** policy includes `D1 Write`, `Workers R2 Storage Write`, `Workers Scripts Write`, `Workers KV Storage Write`, `Workers AI Write`, `Workers Containers Write`, `Workers CI Write`, and other permissions. This is a material broad-privilege finding. The original `Thebe Desk GitHub Production Deploy` token also has write permissions in a **zone-scoped** policy; do not conflate its zone scope with the v2 account-wide policy.
- `/user/tokens` returned HTTP 403; personal API tokens were **not** enumerated. R2 S3/API access keys, operator laptops, GitHub secret-value equivalence, historical versions and alternate identities were **not** proven.
- Currently listed Worker settings for five scripts lack any D1 binding to isolated target `be15acba-ba16-4704-9498-e296a164b3a2`. Three most recent production Worker versions (of 583) and three most recent General AI staging versions were sampled; these also had no such binding. Sampling **does not** establish all historical-version or alternative access isolation.
- R2 backup candidate `candidates/42293276778/1/production-d1.sql` still matches independent byte-qualified SHA-256 `4e1674e65b7cae766ba07f1c009550b0aee60bca6fc08121ce91928d55f04a1a` by protected verifier run 42375623870. The candidate 30-day policy is enabled, but actual object-level delete-protection enforcement is **not independently accepted**.

## Source-authorized production deployment dependency

`.github/workflows/deploy-production.yml` uses `secrets.CLOUDFLARE_API_TOKEN` inside a protected deploy job. Its preflight GET probes verify account, Workers service and scripts, production D1, evidence R2 bucket, Workers AI search and custom-domain visibility; the release step executes pinned Wrangler `deploy --secrets-file`, which requires deployment capability. The workflow is not proof that the GitHub secret value corresponds to either named Cloudflare token: **do not assert a token-to-secret mapping without authenticated metadata or a controlled qualification**. Do not remove a permission simply because it is not used by the preflight GET endpoints; establish the actual deploy permission set with a dedicated *staging/test-only* dry-run first.

## Controlled remediation plan (separate owner-approved operations)

1. Inventory Cloudflare account and user principals, active account tokens, S3/R2 keys, GitHub environment/repository secret *names*, Cloudflare Worker settings/routes, all currently deployable and historical Worker versions, and unknown external integrations. Gather metadata only; never paste secret values to issues or source.
2. Separate **production Workers deployment**, **read-only backup integrity**, **backup candidate creation/export**, and **isolated D1 restore** credentials. Each role should have only permissions that its actual API operations demonstrably require. Determine whether Cloudflare token scope supports per-resource restrictions for the exact service and data operations; do not promise unsupported D1/R2 resource-level restriction.
3. Prepare dedicated replacement credentials with explicit expiry, clear operator custody and required independent approval. Store only through designated protected GitHub secret stores. Do not duplicate production deploy credentials into recovery environment. Ensure token create-time metadata and approval records are maintained privately.
4. Test a new production-deploy credential in a **separate non-production Worker/D1/R2 environment**, using the exact reviewed deploy operations where safely reproducible. Test read-only and failure cases. Keep live production deployment and backup functioning.
5. Perform a reviewed, reversible **cutover with dual controls** for GitHub secret routing. Verify protected release and backup paths, audit metadata, and rollback controls. Revoke old broad tokens only after verified replacement, monitoring, and independent sign-off. Token rotation has not been authorized by this PR.
6. Recheck isolated restore target emptiness, all relevant current/historical identity paths and exclusive-writer assurance. Independently accept retention and access. Then obtain separate owner and `thusico` authenticated exact-main `THEBE_VERSIONED_RESTORE_APPROVAL` issue #1950 records. PR approval alone **does not** authorize a restore.

## Offline risk assessor scope

`scripts/assess-cloudflare-credential-segmentation-offline.mjs` takes *sanitized* token names, `active/disabled/expired` status, allow/deny permission names and resource keys, current SHA, and inventory-completeness booleans. It does **not** call Cloudflare or GitHub, inspect secrets, or authenticate provided records. It identifies dangerous **account-wide** capabilities only; a passing reduced-token example **never** establishes least privilege or exclusive restore access, and the tool always returns `restoreAuthorized=false`, `retentionAndAccessAccepted=false`, and `credentialRotationAuthorized=false`. The pull-request-only CI uses fully synthetic fixtures.

No R2/D1 mutation, token creation/revocation, production deployment, SQL import, secret access, payment enablement, POP migration, or AI activation occurs in this review change. Track #1950 and #2187.
