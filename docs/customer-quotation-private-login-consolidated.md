# C4 customer quotation login — consolidated private host source batch

**SOURCE ONLY — DEFAULT DENY — NO CUSTOMER AUTHENTICATION ACTIVATED**

This batch links the existing C4 private customer HTTP gateway to a Worker-compatible composition point and a deterministic qualification checker, reusing the already-reviewed invitation, OIDC PKCE, verified customer session, full quotation terms and explicit-acceptance modules. It does **not** create a working customer OIDC deployment, provision any Google or Cloudflare resource, or modify the existing business sign-in.

## Source additions

- \`server/essentials-private-customer-worker-candidate.mjs\` exports a default Worker fetch handler which returns **404 for every route**, plus a named offline integration factory. The factory requires explicit staging-only enablement, a valid HTTPS origin, the exact isolated \`CUSTOMER_CONSENT_DB\` D1 runtime binding, all existing journey/review/consent components, independent protected-host authorization and rate limiting, and a CSP nonce generator. It cannot be switched on by an incoming HTTP query/header or environment variable. It is **not** an IdP/client, Access policy, delivery authority or production mount.
- \`deploy/customer-quotation-private-staging/wrangler.jsonc\` is a **review-only, not deployed** manifest with no routes, no worker.dev and no preview URLs. The D1 binding references existing isolated database \`bw-essentials-customer-consent-private-staging\` UUID \`56f48000-9d89-47d5-a077-47dfe0825662\`, never production.
- \`scripts/customer-quotation-private-readiness.mjs\` checks externally collected evidence for exact SHA, reviewed source digest, correct D1 and recovery, Worker digest, zero public endpoints, actual private Access host, genuine external customer Google OIDC, independent account ownership, delivery, frozen quotations/full terms, negative synthetic E2E and separate owner/\`thusico\` authorizations. **It never authorizes upload, deployment or customer activation**, even if all evidence is supplied.
- \`tests/customer-quotation-private-worker.test.mjs\` checks default deny-all, staging-only factory, D1 bind isolation, private host authorization, no routes or preview URLs and adversarial readiness inputs.

## Actual remote state observed on 20 November 2026

Cloudflare account \`ddd23cab31928a4bb3d4998df9b26d1d\`: isolated C4 D1 exists and has the expected customer invitation, OIDC, customer session, frozen quote, review and consent tables/triggers; seven principal customer tables contain zero rows. The previously created Worker \`bw-quotation-auth-private-staging\` has one inert 404-only version and zero deployments/bindings. **It is not the new C4 customer Worker.** No customer quotation Access app or real Google external-customer IdP registration was verified. This batch makes **no** Cloudflare write.

## Next mandatory gates

1. Independently establish a current real external customer-to-quotation ownership source of truth and a trusted one-time invitation delivery channel; browser-supplied email, \`sub\`, ticket or employee session is insufficient.
2. Resolve Google staging project permission, approved OAuth consent, registered confidential client, pinned callback/issuer, real PKCE/JWKS and secret custody; no new \`cloud-platform\` authorization implied.
3. Reconcile the existing D1 schema and trigger bytes with reviewed migrations, execute backup/restore rehearsal and obtain exact-resource separate owner and independent reviewer staging approvals. **Do not replay existing CREATE TABLE migrations merely because they were not previously attested.**
4. Build and review the **actual secure private Worker host** using the named factory and independently verified Access/owner/rate-limit implementations; collect exact source/binary digest. Perform isolated synthetic E2E for legitimate invitation/login/review/accept and revoked, forwarded, cross-tenant, stale, CSRF and replay denials, on desktop and mobile.
5. Obtain separate independent staging acceptance and **owner-initiated production release** authorizations. Only then consider customer-facing activation. The production site and current business sign-in remain unchanged.

This PR alone must not be interpreted as approval to upload the candidate Worker, deploy a route, grant IAM/OAuth permissions, change D1, send invitations or enable customer login.
