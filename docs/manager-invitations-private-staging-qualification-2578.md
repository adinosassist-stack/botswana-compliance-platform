# Manager invitation functional staging qualification — issue #2578

Status: **NOT DEPLOYED / NOT APPROVED**. This is an execution/evidence checklist, not a grant to alter production.

## Pinned source and isolation

- Review the *current* PR #2579 head SHA immediately before any deployment; never substitute an old CI SHA.
- Candidate Wrangler: `cloudflare/wrangler.manager-invitations-functional-staging.toml`.
- Worker name: `bw-manager-invitations-functional-private-staging`.
- D1: `bw-manager-invitations-synthetic-staging`, UUID `518a9e33-b2ba-4204-ac52-aae4150a7b52`.
- Deny all production D1, shared customer accounts, public registration, production APIs, payments, AI, uploads, and public/preview URLs.
- Keep `MANAGER_INVITATIONS_PRIVATE_STAGING_ENABLED`, `MANAGER_INVITATIONS_SCHEMA_READY`, `MANAGER_INVITATIONS_ACCESS_READY` **false** until separately qualified.

## Gate A — dedicated protected ingress

- Obtain explicit owner authorization of the exact private hostname, test allowlist identity, account and access policy scope.
- Create a **distinct** Cloudflare Access app and deny-by-default policy; do **not** reuse the ThutoEdge Access app or policy.
- Record application ID, policy ID, team domain, ingress routing and identities (no credentials).
- Independently review route and policy *before* functional Worker exposure.
- Prove the seven paths in `scripts/manager-staging-access-preflight.mjs` redirect to the exact pinned `*.cloudflareaccess.com` domain with credentials omitted and redirects disabled; also verify non-allowlisted identity is denied. Fail closed.

## Gate B — secret, D1 and origin

- Set a fresh cryptographically random `SESSION_SECRET` as **a secret binding scoped solely to the functional staging Worker**. Never commit/log/paste its value.
- Review `PUBLIC_ORIGIN` and `PUBLIC_APP_URL` matching only the Access-protected staging origin.
- Read-only inspect the isolated D1 schema and migration history, login limiter, cookies and DB bindings.
- Capture staging D1 preflight/recovery bookmark; validate rollback and absence of production bindings.
- Verify static asset routing and canonical Worker compatibility. Deployment authorization must identify exact source/config and binding digests.

## Gate C — private functional E2E (synthetic data only)

| Step | Required receipt |
| --- | --- |
| 1. Owner invitation | Synthetic invited manager/tenant/location and one-time token securely delivered; no token exposed in logs |
| 2. Activation | One-time claim succeeds once; replay/parallel claim fails safely |
| 3. Login | Password login and new session succeed via protected ingress |
| 4. Dashboard | Assigned branch aggregate data only, no unrestricted API access |
| 5. Negative access | Foreign-tenant and unassigned branch return denial |
| 6. Revocation | Removing a location grant immediately denies prior branch views |
| 7. Suspension | Suspended membership invalidates active sessions and blocks new login |
| 8. Recovery | D1 rollback/recovery test and clean staging teardown with secrets scrubbed |

Tests must be performed against the **deployed functional Worker / real isolated Cloudflare D1 / browser**, not just local SQLite mocks. Redact cookies, passwords and invitation tokens from artifacts.

## Gate D — release

- Require green relevant CI at exact source SHA **and** independent current `thusico` approval; dismissed reviews do not count.
- Keep PR draft and production manager login OFF until private functional E2E passes.
- Production requires separate exact-SHA protected owner authorization, branch authorization coverage and independent review. No production activation from this checklist.
