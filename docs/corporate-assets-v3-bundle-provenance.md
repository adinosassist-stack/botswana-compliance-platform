# Corporate Assets v3: Worker bundle lineage and release boundary

**Status:** read-only forensic evidence; **not** verified reviewed-source provenance or a release approval.

## Cloudflare evidence captured 9 November 2026

Cloudflare's `GET /workers/scripts/bw-corporate-assets-staging/versions/{version_id}`
exposes a server-recorded `resources.script.etag` and source marker in version bindings.
Versions 1, 2 and 3 currently report the **same** script ETag:
`cf696a00607c2b899fefda9fa0277d3ba75b6fe53e64fd40782dee5e533b0198`.

This is useful evidence that secret rotation created a new version without changing
the Worker script recorded by Cloudflare. It is **not** proof that this script
was compiled from the currently reviewed GitHub tree. All versions still carry
`ASSETS_STAGING_SOURCE_SHA=062ef3ea4c598d38a56e15dba1691c30aa4e5c72`,
which is distinct from reviewed main at qualification time.

## Read-only procedure

1. Supply `ASSETS_STAGING_CLOUDFLARE_READ_TOKEN` and an explicit 40-character
   `EXPECTED_MAIN_SHA` through a secure secrets context.
2. Run `node scripts/corporate-assets-v3-worker-bundle-lineage.mjs`.
3. It reads only the v2 and v3 Cloudflare version metadata and compares
   exact Worker IDs, version numbers, ETags and source markers.
4. The CLI deliberately exits nonzero even when continuity is proven,
   because independently verifiable source-to-bundle provenance is absent.
5. Do not treat a source marker, Worker ETag alone or synthetic test data as
   authorization to deploy or change traffic.

## Completing exact provenance safely

Produce a new reproducible, pinned build from an exact reviewed GitHub SHA,
record the artifact SHA-256 and independently authenticated upload receipt,
and verify the resulting Cloudflare version against that artifact. Obtain
separate protected `thusico` review before any deployment. If candidate
v3 cannot be linked to an authenticated build receipt, **do not retroactively
claim source provenance**: prepare a new isolated version through the protected
version-only path, qualify that new candidate, and retain v2 at 100% until
the separate deployment gate is approved.

Worker staging writes, asset activation and all production services must stay off.
