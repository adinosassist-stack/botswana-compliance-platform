# Manager staging: first undeployed Worker version bootstrap (REVIEW ONLY)

Tracking: #2599. **This document and its PR do not authorize execution.**

## Verified problem

- Exact target: `bw-manager-invitations-functional-private-staging`, account `ddd23cab31928a4bb3d4998df9b26d1d`.
- Worker scripts list has **no** matching worker; GET versions, deployments, and subdomain return 404.
- [Cloudflare first-upload rule](https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/#first-upload): `wrangler versions upload` fails before first Worker creation.
- Existing upload workflow now fails closed in that case (PR #2631).
- The GitHub environment `manager-private-version-only-protected` requires independent `thusico`, blocks self-review/admin bypass, and restricts deployments to protected branches.
- Dedicated GitHub secret NAME `MANAGER_STAGING_VERSION_CLOUDFLARE_TOKEN` exists; secret **scope, validity and expiration have not been established**. The account-scoped permission `Workers Scripts Write` can potentially affect production Workers.

## Source and immutable content

- Origin commit: `d17e15dc5080d093efbd84c976f15d612d064bb0`
- Compiled Worker artifact: GitHub artifact `14407666400`; ZIP archive and Worker checksum pinned by existing `verify-manager-exact-staging-artifacts.py`.
- Exact Worker SHA256: `9a9496e2481a03db0c9f1dcaccc89a450d5048f1bad3523ab6454b240a0bc75e`.
- Static assets artifact: `14407970936`; `public.tar` SHA256: `a2a6099c465a3605227ae77858bbd9d475e9fda7bc3e751fc4f1a3b947a660dc`. 278 exact files.
- Reviewed Wrangler config blob: `7d3c5a36912df19409ab168f18c67df7b55f4755`; synthetic D1 ID `518a9e33-b2ba-4204-ac52-aae4150a7b52`; activation flags `false`; `workers_dev=false`; `preview_urls=false`; no routes.
- Access app `7934753d-0188-4796-9288-bfd99d3be791`, tester `banabothem@yahoo.com`; **no DNS or Worker ingress should be created**.

## Design: isolated, never deployed initial version, Cloudflare API

Cloudflare [infrastructure as code](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/) documents separate APIs to create a Worker record, create versions and create deployments. **A Worker record with zero deployments is not a functional manager site.** The future reviewed implementation must use these exact operations, with an explicit abort on any ambiguous response:

1. *Before any write*: run existing immutable-archive verifier and preparation, then validate config and all intended API bodies offline. Query Cloudflare Workers, DNS, routes, custom domains, Access and isolated D1. Reject if target Worker already exists or any manager ingress/deployment exists; reject unexpected token scope or expired credential.
2. *Only after independent owner + thusico approval of exact protected workflow source*: POST `/accounts/{account_id}/workers/workers` using JSON `{"name":"bw-manager-invitations-functional-private-staging","subdomain":{"enabled":false,"previews_enabled":false}}`. This creates an inert Worker record, **not** a deployment. Reject if response claims a non-null `deployed_on`, enabled workers.dev, or enabled previews.
3. Register the full 278-file manifest via POST `/accounts/{account_id}/workers/scripts/{script_name}/assets-upload-session`, encoding a 32-hex digest and size for every path; use full inspected content from the immutable static artifact, never source rebuilds or modified assets.
4. Upload only buckets listed as missing via `POST /accounts/{account_id}/workers/assets/upload?base64=true` using the short-lived upload JWT; preserve MIME and exact file bytes. Require final completion JWT, or use first session JWT when no uploads are needed. Never log JWT.
5. POST `/accounts/{account_id}/workers/workers/{worker_id}/versions` with the unmodified `worker.js` base64 content as an ES module, main module `worker.js`, exact reviewed compatibility date, isolated D1 binding, all fail-closed vars, and `assets.jwt` plus exact assets config. Do not omit the assets binding or invent a SESSION_SECRET. If the API does not accept zero deployment, fail closed. **Never** call a script `PUT` or `wrangler deploy`, which may implicitly deploy.
6. *Read-only postflight*: verify Worker record exists and `deployed_on=null`, exactly one new version, complete asset manifest with 278 expected paths, no active deployments, workers.dev disabled, preview URLs disabled, no Worker routes or custom domain, no matching DNS and original Access policy unchanged. Emit only version ID, verified digests and redacted evidence.
7. Revoke the short-lived account-scoped token **after** verifying the approved receipt in a separate owner-controlled revocation step. Do not expose token in logs, issue comments or chat.

## Required fail-closed controls in future executable workflow

- Must be a **new** PR with tests for all 3 stages and sample mocked Cloudflare responses. Never modify production Workers or D1. It must use a single allowed Worker name with no dynamic name input, strict account/zone/isolated DB IDs, a separate one-shot owner dispatch and the protected environment requiring `thusico` review.
- No public hostname, `workers.dev`, preview URL, triggered Workflow, cron or DNS route; no real customer records.
- The permission `Workers Scripts Write` is account-scoped for this account. Prefer **a separate Cloudflare staging account** if owner/reviewer do not expressly accept temporary account-wide Worker-write blast radius. GitHub secret existence does not prove Cloudflare token scope or expiry.
- Separate rollback: if the inert record is created but upload/version fails, leave record inert and log the blocker; do NOT deploy or delete unreviewed Cloudflare resources automatically.
- Exit on mismatch in any precondition. An empty/404 Worker versions response is expected *before* record creation, but NOT evidence of success.
- Explicitly independent owner + thusico acceptance required before any remote write. This document is **planning only**, no workflow dispatcher.

## Status
This plan does not claim the Worker, a version, an asset upload, private login or production activation exists.
