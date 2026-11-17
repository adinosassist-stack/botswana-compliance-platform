# No-additional-subscription quotation Worker bootstrap (PROPOSED ONLY)

## Decision

The existing standard Worker version-only approval in issue #2542 comments
#6934917510 (owner) and #6934950075 (independent thusico) explicitly
prohibits any workers.dev or Version URL, even temporarily. The Cloudflare
first-version upload API does **not** atomically accept both URL-disable flags
when creating a new script. Hence that approved operation is **still blocked**.

The account lacks Workers for Platforms (Cloudflare GET dispatch namespaces
returned 403, error 10121); the owner declined the $25/month add-on.

**Proposed free-of-extra-subscription alternative: an expressly permitted
transient deny-all bootstrap** using an ordinary Cloudflare Worker, then
disable both URLs, verify, and only afterwards seek a *new* separate approval
for uploading the real quotation-auth candidate. Existing Workers billing
and normal usage limits may still apply. This is a plan, NOT permission to
execute; no deployment or Cloudflare mutation is part of this PR.

## Safety and change of boundary requiring new approvals

A newly uploaded deny-all Worker version MAY have a publicly addressable
workers.dev or version URL before disabling. The code must return the same
static 404 for every request, with no routes, bindings, data, sessions,
tenant IDs, logs, external connections, feature flags or redirects. This
means any temporary URL reveals only a generic 404, BUT **does not meet**
the old no-URL-ever restriction.

Do not start without an explicit NEW owner GitHub comment and a separately
authored independent thusico GitHub comment naming the **exact new merged
source SHA**, Worker, Cloudflare account, the transient URL exception,
abort/rollback plan and strict limit of the approval to the 404 bootstrap
and URL-disable operation. Do not infer consent from 'go', old approvals, a
source PR review or the owner's decision to decline subscription fees.

### Proposed execution in a distinct later authorization

1. Read-only verify exact approved main SHA; account
   ddd23cab31928a4bb3d4998df9b26d1d; Worker name
   bw-quotation-auth-private-staging is ABSENT; synthetic D1
   d7ad8e99-2ee4-446c-9358-0e186031571d has no identity/session rows;
   no existing Worker, routes, secrets or R2 will be touched.
2. Upload only server/quotation-private-bootstrap-deny-all.mjs using the
   standard Worker version endpoint. Confirm the exact Git blob/source
   identity and receive version receipt. This code has no quotation logic.
   Do not create deployments, bindings, routes, secrets, custom domains,
   preview aliases or scheduled triggers.
3. Immediately call
   POST /accounts/{account_id}/workers/scripts/{script_name}/subdomain
   with JSON {"enabled":false,"previews_enabled":false}. Verify both
   response values via a separate read-only GET. On an error, STOP; do not
   upload/authenticate the real quotation module.
4. Independent GET inventory must show zero deployments, zero custom routes
   and domains, zero D1/R2/secret bindings, one exact expected script, no
   reachable Version URLs. Test unauthorized/anonymous access to both
   possible public hostnames (not to any existing production site).
   The pure snapshot guard in this PR refuses incomplete evidence.
5. If step 3 or 4 fails, STOP and preserve receipts. Any teardown/delete,
   rollback, redeployment or recovery needs separate owner and reviewer
   authorization based on observed state; do not silently replay.
6. After ALL checks, prepare a separate exact-source *real* auth Worker
   candidate version and additional approvals. Bind only the isolated
   synthetic D1, provision dedicated synthetic credentials, qualify a
   protected private service caller and seed synthetic-only identities
   under their own separate approvals. Reverify the no-public-URL settings
   after **each** subsequent change; fail closed if they reenable.
7. Do not upload the original Lovely PDF, activate quotes, touch payment
   providers, issue customer quotations, modify production or claim legal
   compliance under any bootstrap-only approval. The approved two-page
   PDF SHA-256 remains
   8cdb4bf76230d04b8617f01d9c868ca00c518a2f75e10ed15e8ee1bbf332b87e.

## References

- Cloudflare standard Worker Upload Version API; separate Worker Subdomain
  update API with 'enabled' and 'previews_enabled' flags.
- https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- Issue #2542 comment #6934988615 and #6935078712 (why first direct auth
  upload is forbidden).
