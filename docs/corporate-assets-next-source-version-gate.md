# Corporate Assets: protected next version-only source gate

This is an offline-only security qualification. No Worker version is created or deployed.

The existing v3 has a historical source marker, so it is not eligible for release. Protected read-only preflight run 42699598207 confirmed missing independently authenticated source-to-upload provenance.

Cloudflare documents that Wrangler `versions upload` creates a new version without shifting traffic, unlike regular `wrangler deploy` or the ordinary Script Upload API. Reference: https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/

The new pure plan checks the reviewed SHA and SHA-256 input manifest; protected environment; existing `secret_text` credential binding types; isolated D1; staging write and feature holds; and deployed rollback v2 at 100%. It returns versionCreationAuthorized=false and deploymentAuthorized=false, always.

## Separate future write-phase prerequisites

1. Review an exact-commit reproducible bundle and record the actual compiled artifact SHA-256; offline source-input hashes alone are insufficient.
2. Prove existing secret_text bindings survive upload without leaking, blanking or silently replacing credentials.
3. Independently approve a new protected version-only upload workflow and its explicit owner authorization. The previous read-only approval is not reusable.
4. Perform only `wrangler versions upload` after safeguards are proven; verify new version id, script content, bindings and no deployment change. Verify no new public or preview access.
5. Retain staging v2 at 100% pending separate protected deployment approval. Never promote old v3 by relabeling its historical source SHA.

No secrets, Worker versions, staging traffic, database records or production resources are changed in this PR.