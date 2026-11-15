# Corporate Assets — inert credential-transition offline rehearsal

**Scope: code-only synthetic tests. No release authority.** This note captures
the exact boundary between the currently deployed status-only staging Worker,
an undeployed secret candidate, and future authenticated acceptance work.

## Current observed staging state (15 November 2026)

- Worker: `bw-corporate-assets-staging`, with no public Worker domain or
  `workers.dev`/preview exposure.
- Active immutable version **2**:
  `5497120e-4ae6-4665-b96f-4b040d32a249`, 100% of the existing private
  staging deployment. Both sensitive binding **types** remain `plain_text`.
- Undeployed credential candidate **v4**:
  `dc708a58-4da1-4af5-a10a-17ace5ea25fa`. Both types are
  `secret_text` and version remains inert.
- The historical `ASSETS_STAGING_SOURCE_SHA` marker is
  `062ef3ea4c598d38a56e15dba1691c30aa4e5c72` on v2/v4.
  Matching Cloudflare script ETags are metadata continuity, **not** GitHub
  compiled-byte provenance.
- Staging D1 `e19f09de-3bb9-4021-b4f8-44df04c8aaa8`
  is isolated. Both `THEBE_CORPORATE_ASSETS_ENABLED` and
  `ASSETS_STAGING_WRITES_ENABLED` remain `false`.
- The old [source-upload run #42719464957](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/42719464957)
  is pending on a stale commit; it must **not** be approved or treated
  as current-main permission.

## Added offline assertions

`tests/corporate-assets-inert-credential-cutover.test.mjs` uses **synthetic
old and replacement secret strings** with a fake D1. It exercises the
actual repository status-only entry
`cloudflare/src/corporate-assets-staging-entry.js` (which is the entry
the staging Wrangler config declares):

1. Both sets of synthetic credential strings produce the **same** neutral
   `GET /api/corporate-assets-staging/status` response with
   `authenticatedAcceptance=false`, `assetWritesEnabled=false` and
   `productionActivation=false`.
2. The status path runs exactly **one SELECT against the isolated D1 identity
   marker**, and the fake DB throws if any mutation is attempted.
3. All asset, authentication, billing and service routes are denied before
   querying D1, with both synthetic credential generations.
4. POST, PUT, PATCH and DELETE against the only status path are denied.
5. Wrong profile, write/activation flag or source marker fail before D1.
6. Wrong, missing or unavailable D1 identity marker fails closed.
7. No synthetic secret contents appear in any returned status or error body.

**Limits:** These tests are local simulations of the code in the repository,
not live requests to version 4. Changing mock secrets does not prove that
real sessions, cookies, signatures or audit events tolerate rotation. The
status-only Worker does not delegate authentication or Assets operations.
The tests do not access Cloudflare, real credentials, D1 or production.

## Actual protected credential cutover still blocked

| Release prerequisite | Current evidence |
| --- | --- |
| Immutable v4 secret binding types | Verified `secret_text` |
| Inert routing and isolated D1 | Verified by previous Cloudflare GET reads |
| v4 compiled bytes independently tied to reviewed exact-main | **Not verified** |
| Functional login and mandatory reauthentication after secret replacement | **Not tested** |
| Audit signature/chain integrity under key rollover | **Not tested** |
| Protected post-cutover rollback and session invalidation | **Not tested** |
| Explicit separate owner staging deployment authorization | **Not granted** |
| Fresh independent `thusico` deployment review | **Not granted** |

**Go/no-go: NO GO for staging deployment.** Preparing this regression
does not grant permission to upload a new source version, rotate credentials,
deploy v4, move traffic, access or write D1, enable features/routes/previews,
or alter production. Existing release fail-closed checks must remain active.

When separate authority exists, validate sessions, audit integrity and
rollback within an approved, private **synthetic-only** environment.
Any authenticated acceptance requiring writes needs its own explicit
staging-write approval and isolation verification.
