# Manager private staging — protected no-ingress deployment design

**Code-only review. No deployment, environment configuration, dispatch,
route, DNS or production change has been authorized by this PR.**
Tracking: issue #2599.

## Immutable candidate and isolated account
- Candidate: `b4c61970-0a0b-4c63-bc37-1b067e215a6d`, uploaded undeployed.
- Upload evidence: GitHub Actions #44932073483 (attempt 2, success).
- Source provenance at upload: `96645f46d670c46e05dbad3af1ae846172d32cc1`.
- Cloudflare account: `f585813fa376f7c71c7d4a79254168fa`.
- Worker: `bw-manager-invitations-functional-private-staging`;
  ID `a83242df903d4fb7b4ad5ea9e5a1a509`.
- Test zone: `thebedesk-test.win`; zone `5cf26ad83f8d5a5fb6ef97ce516b932b`.
- Test host: `manager-staging.thebedesk-test.win`. No ingress authorized.
- Synthetic D1 `1a2fc702-2592-491c-9f55-80e032a56dd8`, not production.
- Asset manifest SHA256 `2b06f615812022db4a5d2ace49bce433cb1929d25ebde37228dc88d5325f3f6e`.
- Worker SHA256 `9a9496e2481a03db0c9f1dcaccc89a450d5048f1bad3523ab6454b240a0bc75e`.

## Required conditions BEFORE any dispatch
1. Create and independently verify GitHub protected environment
   `manager-private-deploy-no-ingress-protected`, configured with required
   `thusico` review, prevention of self-review, administrator bypass disabled
   and `main`-only restrictions. GitHub may create unprotected environments
   automatically: do not dispatch until the environment is actually reviewed.
2. Provision distinct short-lived, least-privilege Cloudflare token as GitHub
   environment secret `MANAGER_NO_INGRESS_DEPLOY_CLOUDFLARE_TOKEN`;
   restrict to the exact **isolated account** and only the Worker write/read
   plus zone/Access/D1 read operations. Never reuse production credentials.
3. Capture independent owner and `thusico` **new** issue #2599 comments,
   each containing `APPROVE_MANAGER_PRIVATE_DEPLOY_NO_INGRESS`,
   `NO_DNS_OR_ROUTE_CHANGES`, `NO_PUBLIC_INGRESS_OR_PRODUCTION_CHANGES`,
   the exact **current main SHA at time of dispatch**, candidate version,
   Worker and manifest hashes, isolated account, zone, D1, host and the
   successful upload run ID `44932073483`.
4. Require dedicated review of D1 synthetic-only schema, recovery bookmark,
   Access app exact-host policy, remote token scopes, current route/DNS
   inventory and absence of any other Worker deployments.
5. The owner, never the reviewer, may manually dispatch only this exact
   workflow with the two distinct comment IDs and explicit no-ingress ACK.

## Fail-closed runner behavior
- No execution from pull requests, CLI outside GitHub Actions, other branches,
  another actor or stale SHA; GitHub checks exact current `main` itself.
- Verify successful original artifact-upload run and independent comment
  authors and exact account, zone, candidate version, hashes, D1, host.
- Query all current Cloudflare resources read-only, including a D1 Time Travel
  bookmark, all zone Worker routes and DNS (including wildcard), Access policy,
  complete Worker versions and bindings. Compare against exact expected
  isolated inventory before ANY Cloudflare write.
- **Only allowed POST**: deploy pinned existing candidate version to the
  existing isolated Worker at 100% without any DNS/route/preview mutation.
- Read-only postflight must prove the one intended deployment and zero ingress.
  If uncertain AFTER write, stop; no automatic retry, deletion or rollback.
  Such cases require a separately approved isolated recovery action.
- Never print tokens, cookies, encrypted values or D1 bookmark.

## Future independent phases (NOT implemented here)
- Access-protected host ingress needs a distinct owner decision and
  independent `thusico` authorization. Introduce test DNS/route only after
  proving Access intercepts before Worker responses. Test seven anonymous
  paths and non-allowlisted email denial; fail closed and retain rollback.
- Only after successful negative probes, perform synthetic invitation,
  single-use activation/replay rejection, manager login, assigned-branch
  dashboard, cross-tenant access denial, revocation, suspension and D1 recovery.
- Production release and real customer login require new exact-SHA approval,
  not any of the staging comments.

This is **not** a claim that private Manager login is already reachable.
