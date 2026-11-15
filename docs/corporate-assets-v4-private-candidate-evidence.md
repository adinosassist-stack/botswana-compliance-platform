# Corporate Assets v4 — credential-only private candidate qualification (2026-11-15)

## Current verified facts

The protected [secret-candidate run #43706368659](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/43706368659),
attempt 2, was approved by independent reviewer `thusico` and completed successfully.
The Cloudflare Worker `bw-corporate-assets-staging` contains exactly four versions,
with one newly created **undeployed** version `dc708a58-4da1-4af5-a10a-17ace5ea25fa` (v4).

Version 4 has `secret_text` **binding types** for `SESSION_SECRET` and
`AUDIT_INTEGRITY_SECRET`, preserves isolated staging D1
`e19f09de-3bb9-4021-b4f8-44df04c8aaa8`, and holds
`ASSETS_STAGING_WRITES_ENABLED=false` and
`THEBE_CORPORATE_ASSETS_ENABLED=false`. Other sensitive features, uploads,
payments and registration remain disabled or held. No custom Worker Domains
or Worker Routes were attached, and `workers.dev` and preview URLs are off.

Active version **2** `5497120e-4ae6-4665-b96f-4b040d32a249` continues
to receive 100% of the existing **private** staging deployment. Its original
secret-binding **types** remain `plain_text`. This is a live, unresolved
security qualification blocker despite the safe *undeployed* v4 binding types.

The candidate's embedded `ASSETS_STAGING_SOURCE_SHA` is the historic
`062ef3ea4c598d38a56e15dba1691c30aa4e5c72`, not current
main at the time of creation `c8f8bdccbbe757145117875a4391f8e174fb46e0`.
The marker is metadata only, not independent authentication of compiled bytes.

## Protected GET-only evidence

`scripts/corporate-assets-v4-readonly-qualification.mjs` checks the exact
**four-version inventory**, immutable v4 and active v2 metadata, complete
deployment history, and independently fetched **account-wide** private exposure
against the two pinned zones. It verifies credential **types** only:
no secret values are accessed, echoed, compared or retained. The runner makes
only Cloudflare **GET** requests and is called inside the existing, independently
reviewed `corporate-assets-protected-provenance-preflight.yml` environment.
The protected workflow still rejects unsafe active v2 in the final separate
`corporate-assets-complete-readonly-evidence.mjs` step. An expected failure
in that final step does not negate v4's metadata isolation.

**Important:** A green v4 metadata check does **not** prove that the
candidate matches reviewed exact-current-main compiled source bytes, that
credential rotation has been functionally accepted, or that the currently
deployed v2 is safe. The new report deliberately always sets
`credentialValuesVerified=false`,
`uploadedSourceBytesVerified=false`,
`exactSourceProvenanceVerified=false` and
`stagingDeploymentAuthorized=false`.

## Next separated authorization boundaries

1. Obtain independently authenticated exact-main compiled artifact and upload
   provenance; a version label, source SHA variable or opaque Cloudflare ETag
   is insufficient. Do not re-label or promote v4 as a current-main build.
2. Determine a safe staging credential transition and acceptance/rollback
   plan. New random staging secrets in v4 cannot be assumed to work with
   existing sessions, audit chains or integrations merely because their
   binding types are `secret_text`.
3. Require separate owner authorization and fresh independent `thusico`
   approval before **any** future protected staging deployment. Never
   auto-deploy from a PR merge, approval of metadata-only preflight, or the
   earlier authorization to **create** the undeployed v4 candidate.
4. Keep isolated D1, production, public routes, previews, write and
   activation flags unchanged. Any synthetic write qualification requires
   its own explicit gate.

This proposal is code-only; it does **not** initiate a protected run,
create additional candidate versions, rotate secrets, deploy, read or write
D1, or change production.
