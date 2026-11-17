# Manager staging Cloudflare Access review packet — PR #2579

**STATUS: PREPARED FOR INDEPENDENT REVIEW; NOT PROVISIONED OR DEPLOYED**

## Owner-approved scope (2026-11-17)

The owner explicitly authorized the following for **private staging preparation only**, subject to independent `thusico` approval. **No production activation**.

| Setting | Reviewed intended value |
| --- | --- |
| Cloudflare account | `ddd23cab31928a4bb3d4998df9b26d1d` |
| DNS zone | `thebedesk.com`; zone `33e363d52b69c4a64dbb8a0891dbb3a9` |
| Exact hostname | `manager-staging.thebedesk.com` |
| Access application | New, distinct **self-hosted** application for the exact hostname (no wildcard) |
| Allowed tester | `banabothem@yahoo.com` **only** |
| Access decision | Deny by default; include a single explicitly scoped email identity |
| Zero Trust team domain | `patient-night-bd34.cloudflareaccess.com` (verify before use) |
| Functional staging Worker | `bw-manager-invitations-functional-private-staging` |
| Isolated D1 | `bw-manager-invitations-synthetic-staging` / `518a9e33-b2ba-4204-ac52-aae4150a7b52` |
| Public Workers URLs | `workers_dev=false`; `preview_urls=false` |
| Production | No change; no release or customer onboarding |

The allowed tester email is an **Access ingress allowlist**, not proof of a Thebe tenant membership, owner role, or manager account. Synthetic application identities are still needed to test owner invitation and manager activation.

## Pre-provision review checklist

1. Obtain fresh independent `thusico` review of this exact packet and the current PR head/config digest. Prior dismissed reviews do not count.
2. Re-read exact hostname DNS records, zone Worker routes, Worker custom domains and account Access apps to detect newly created conflicts. Existing ThutoEdge Access app MUST NOT be reused.
3. Verify that the planned Access application path/hostname matches **only** `manager-staging.thebedesk.com`, with no bypass, service-token wildcard, Everyone or broad organization-wide allowance.
4. Configure one allow policy with an exact email match to `banabothem@yahoo.com`, a deny-by-default application and no broader policies. Review IdP/MFA requirements for that email.
5. Create and inspect Access protection **before** DNS or Worker custom-domain routing becomes reachable. Treat Access app creation alone as insufficient protection until actual unauthenticated and unapproved-identity negative probes are confirmed.
6. Maintain an inert, unreachable Worker and disabled feature flags until Access is proven. Avoid implicit Worker deployments and public/preview URLs.
7. Generate a new staging-only cryptographic `SESSION_SECRET` as a Cloudflare secret binding; never put it in GitHub code, comments, logs, or an Access policy.
8. Bind only the isolated staging D1, not production D1 or R2. Capture recovery bookmark and inspect D1 schema before synthetic mutations.
9. Independently qualify seven uncredentialed paths via `scripts/manager-staging-access-preflight.mjs` with explicitly pinned `MANAGER_STAGING_ORIGIN=https://manager-staging.thebedesk.com` and `MANAGER_STAGING_ACCESS_TEAM_DOMAIN=patient-night-bd34.cloudflareaccess.com`. Confirm a non-allowlisted identity is denied; reject redirects to any unapproved origin.
10. Only after authorized protected activation, run the owner invitation → one-time claim → login → assigned-location dashboard → cross-tenant denial → revocation/suspension → recovery browser E2E. Record redacted receipts.
11. Require independent `thusico` sign-off of staged results and separate protected **production** owner authorization before any eventual production activation.

## Stop conditions

Stop before DNS, routes, Worker activation or account creation if the exact Access application and one-email policy have not passed independent review, if the entrypoint redirects to production, if a staging session secret is not isolated, if workers.dev/preview URLs can serve the app, or if a real tenant account or production D1 is referenced. Preserve `MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED=false`, `MANAGER_INVITATIONS_SCHEMA_READY=false`, `MANAGER_INVITATIONS_ACCESS_READY=false` until qualification.

## Read-only discovery receipt

On 2026-11-17, Cloudflare account/zone inventory found no DNS record or Worker route for the proposed hostname; the only existing Worker custom domains were `thebedesk.com` and `billing-staging.thebedesk.com`; the only Access application was the unrelated `ThutoEdge Staging`. **No DNS, Access policy/application, Worker, secret, or route was written in this review preparation.**

## Reviewer decision

`thusico` must separately approve the exact origin, one-email Access policy, identity provider configuration, fail-closed order, source/config SHA, isolated D1 binding and cleanup/rollback plan. Reviewer approval is not implied by CI passing or this document.
