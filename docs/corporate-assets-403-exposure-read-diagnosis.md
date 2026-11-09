# Protected Corporate Assets version upload: Cloudflare 403 diagnosis

The approved, owner-dispatched protected run [#42717309149](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/42717309149) failed before its upload operation with `cloudflare_exposure_read_failed_403`. Offline and protected regression tests passed, but the dedicated GitHub environment's Cloudflare token could not complete required private exposure GET checks.

This change preserves all read-only checks and now distinguishes errors for `worker_subdomain`, `worker_domains`, `zone_inventory` and `zone_worker_routes`. No token value, HTTP URL, response body, or secret is exposed in errors. Because the original error lacked scope, a specific missing permission is **not yet proven**.

Follow Cloudflare's least-privilege model. The token in `corporate-assets-staging-protected` must have appropriate account-level Workers Scripts access for metadata and version-only creation, plus **Zone Read** to enumerate the account's authorized zones and **Workers Routes Read** on both expected zones for GET workers/routes; avoid Workers Routes Write or unrestricted zone edit. Verify the new scope-specific read-only gate, correct only the missing permissions, and then perform a **new exact-main workflow_dispatch** with separate protected `thusico` approval. Do not rerun the failed write job blindly, bypass the inventory checks, or deploy.

This PR changes no Cloudflare credentials or resources, does not dispatch any write workflow, and does not modify release controls.