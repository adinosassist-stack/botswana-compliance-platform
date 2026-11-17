# Quotation zero-subscription bootstrap — root-cause correction (SOURCE ONLY)

## Root cause of failed previous attempt

Cloudflare returned HTTP 404/code 10007 when the reviewed first-version request
\`POST /accounts/{account_id}/workers/scripts/bw-quotation-auth-private-staging/versions\`
was made before a Worker resource existed. The protective subdomain-disable
POST also returned 404. The fail-closed stop is documented in issue #2542
comment #6935505993, and **that operation's authorization was consumed**.
No Worker, public URL or data change resulted.

## Verified Cloudflare API behavior (17 Nov 2026)

1. **Avoid** \`PUT /accounts/{account_id}/workers/scripts/{script_name}\`
   for first creation. Cloudflare documents that the **Script Upload API
   creates a version and immediately deploys it to 100% of traffic**. This
   is materially different from the earlier approved inert version.
2. **Use for a new, separately authorized scope:**
   \`POST /accounts/{account_id}/workers/workers\` creates a **Worker parent
   resource without uploading or deploying code**. Cloudflare's API body
   supports \`name\` plus \`subdomain.enabled\` and
   \`subdomain.previews_enabled\`; both must be set false **during the create**.
   The parent Worker resource has a stable ID and \`deployed_on:null\` when
   it has never been deployed.
3. **Before code upload**, GET the new Worker by ID; verify exact name,
   \`deployed_on === null\`, \`subdomain.enabled === false\`,
   \`subdomain.previews_enabled === false\`, zero versions, zero deployments,
   no routes/domains/bindings. A returned \`subdomain.url\` attribute is
   only a possible hostname and does **not mean it is enabled**.
4. For later separate approval: use the **version upload** endpoint only
   after this empty Worker resource exists, and only if Cloudflare verifies
   it remains undeployed, both URLs disabled, and no bindings or routes.
   No source upload under the empty-resource operation.
5. Existing Workers for Platforms entitlement is **not** required. This
   operates within ordinary Cloudflare Workers (existing plan usage still
   applies). The user's stated preference is no additional subscription.

## Proposed new protected operation — NOT AUTHORIZED TO EXECUTE

\`CREATE_QUOTATION_EMPTY_WORKER_RESOURCE_URLS_DISABLED_ONLY\`

- Account: \`ddd23cab31928a4bb3d4998df9b26d1d\`
- Name: \`bw-quotation-auth-private-staging\`
- Pin the **future exact merged main SHA of this PR** and quote this
  approved guard/plan Git blob after review.
- Scope: **one parent Worker identity only, no source code, versions,
  deployments, URL exposure, routes, domains, D1/R2/secret bindings, account
  subscription changes, fake user/session rows, calls, payment events or
  production changes**.
- Exact proposed request payload:
  \`{"name":"bw-quotation-auth-private-staging","subdomain":{"enabled":false,"previews_enabled":false}}\`.
  Do not include read-only fields from the API response; fail closed if
  the account rejects this contract.
- Preflight: unique absence in **both** modern GET \`/workers/workers\`
  and legacy GET \`/workers/scripts\`; exact current SHA; existing
  routes/domains contain no target; distinct D1
  \`bw-quotation-auth-synthetic-staging\` UUID
  \`d7ad8e99-2ee4-446c-9358-0e186031571d\` still has **zero** users,
  memberships and sessions, SELECT confirmed read-only. Capture receipt.
- Postflight: exact name + nonempty new ID, GET by new resource ID;
  both URL settings false and \`deployed_on:null\`, zero versions and
  deployments, zero routes/domains/bindings, and no code upload. Return
  \`STOP\` if inconsistent.
- On error, **do not retry**, delete, roll back, enable URLs, upload
  versions or migrate data. Preserve response and request new owner +
  independent \`thusico\` review for repair/retirement.
- Previous owner approval #6935324247 and reviewer approval #6935434405
  were limited to the **failed** transient-404-bootstrap attempt. They do
  not authorize this different endpoint/operation. PR source merge approval
  likewise does not authorize the Cloudflare mutation.
- Customer quotations remain disabled. Approved PDF SHA-256
  \`8cdb4bf76230d04b8617f01d9c868ca00c518a2f75e10ed15e8ee1bbf332b87e\`
  remains unuploaded. Declined legal review is not legal certification.

## Relevant Cloudflare sources

- https://developers.cloudflare.com/changelog/product-group/developer-platform/22/
  (Workers resources separate from Versions and Deployments)
- https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/methods/create/
  (Create Worker with subdomain flags)
- https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/
  (Script Upload immediately deploys a new version)
- https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/create/
  (Version Upload without deployment)
