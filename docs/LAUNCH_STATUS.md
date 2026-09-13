# Thebe Desk Launch Status — 2026-09-14

## Executive status

- **Repository main:** V81 delegated-authority foundation is merged and production migration `047_v81_delegated_authority.sql` has now been applied through the guarded exact-SHA production migration workflow. A fresh post-migration `[deploy]` promotion is the remaining release-closure step.
- **Last fully closed production deployment record:** `f97d8fa01a8363da82bdd1d26f78090eafa0d9ce`; the V81 Worker candidate was subsequently uploaded successfully, but its first release attempt correctly failed closed until migration 047 was present.
- **Live runtime:** Thebe Desk V78 `1.21.101` on `https://thebedesk.com`; the V81 wrapper is deployed and its post-migration readiness proof now passes.
- **Schema requirement: current v1.21.101 schema** — the base Worker validates the consolidated core through `046_v80_agentic_outcomes.sql`; the V81 production wrapper independently requires `047_v81_delegated_authority.sql`, and `/api/ready` must report both `coreSchemaReady=true` and `agenticAuthoritySchemaReady=true` before the combined `schemaReady=true` state is accepted.
- **Core production readiness:** **PASS in qualification**. Recovery CI validates the production hardening, finance/WhatsApp/agentic boundaries, historical regressions, supply-chain controls and production dependency audit before promotion.
- **Registration abuse control:** **PASS**. Registration uses the signed first-party `thebe_proof` challenge with same-origin issuance, IP binding, proof-of-work, honeypot and replay rejection. Turnstile remains as legacy compatibility configuration but is not the active registration gate.
- **V81 delegated authority:** **SHADOW ONLY**. The production entry is `agentic-entry.js`, which wraps the hardened `production-entry.js`; migration 047 records tenant-scoped grants/intents/events but autonomous execution remains disabled.
- **Production data inventory at the latest live audit:** 0 users, 0 tenants, 0 memberships, 0 operating locations, 0 employees and 0 daily employee reports.
- **Public go-live: CONDITIONAL** — code/core infrastructure are ready, but any external provider configuration still required by the production environment must pass the deployment preflight and post-deploy verification before public launch is declared complete.
- **Current release action:** seal and deploy the exact post-migration main SHA through Recovery CI + BF-07 + production workflow. No gate is bypassed.

## Closed production gates

- BF-01 through BF-06 security findings are closed.
- BF-07 supply-chain controls are implemented: genuine lockfile/SBOM/dependency evidence, exact-SHA qualification and sealed provenance are enforced by the release path. The last deployed production SHA passed Recovery CI and BF-07 before deployment.
- Production deploys are exact-SHA bound, refuse stale/non-main targets, restore the exact BF-07 evidence and re-run the launch gate before Cloudflare promotion.
- The V81 release chain is explicit: core schema readiness through migration 046 plus delegated-authority readiness through migration 047.
- D1 inventory audit queries are split into bounded per-table queries and complete successfully.
- Cloudflare DB, R2 evidence and Workers AI bindings are present and healthy based on the last live audit.
- `AI_FEATURES_DEFAULT=on` is active for Phase 0.
- Security headers pass for HSTS, nosniff, frame denial, referrer policy, CSP, COOP and CORP.
- First-party registration proof is live with hardened difficulty and bounded expiry.
- Payments remain fail-closed with `PAYMENT_PROVIDER=none` unless an approved provider is explicitly configured.
- Evidence uploads remain fail-closed with `EVIDENCE_UPLOADS_ENABLED=false` for this production release path.

## Remaining external launch integrations

### Google OAuth

If Google sign-in is enabled, the GitHub `production` environment and provider configuration must supply:

- Variable: `GOOGLE_OAUTH_CLIENT_ID`
- Secret: `GOOGLE_OAUTH_CLIENT_SECRET`
- Exact authorized redirect URI: `https://thebedesk.com/api/auth/oauth/google/callback`

The post-deploy gate verifies the configured provider path and fails closed on partial configuration.

### Facebook OAuth

If Facebook sign-in is enabled, the GitHub `production` environment and Meta/Facebook provider configuration must supply:

- Variable: `FACEBOOK_APP_ID`
- Secret: `FACEBOOK_APP_SECRET`
- Exact authorized redirect URI: `https://thebedesk.com/api/auth/oauth/facebook/callback`

The post-deploy gate verifies the configured provider path and fails closed on partial configuration.

### Password-reset email

If transactional email/password reset is enabled, the GitHub `production` environment and email provider must supply:

- Secret: `RESEND_API_KEY`
- Variable: `EMAIL_FROM` using a verified sender/domain

Placeholder senders such as `example.com` or `example.invalid` fail the production renderer/preflight.

## Deliberately disabled — not Phase 0 blockers

- **Paid checkout:** `PAYMENT_PROVIDER=none`. DPO credentials and reconciliation are required only before paid checkout is enabled.
- **Evidence file uploads:** disabled. No malware-scanner provider is required while uploads remain disabled; upload/mutation routes must continue to fail closed. A scanner becomes mandatory before accepting evidence bytes.
- **WhatsApp notifications:** optional until Meta credentials/templates are approved and the channel is explicitly enabled.
- **CIPA live registry sync:** not claimed. Existing CIPA evidence/reconciliation behavior must remain truthful until an authorized endpoint, scopes and live reconciliation test exist.
- **Orange Money:** remains blocked pending its separate readiness review.

## Exact release sequence

1. Qualify the exact release SHA with Recovery CI.
2. Seal that same SHA through BF-07 from a clean npm registry state.
3. Allow production automation to restore the exact BF-07 evidence and re-run the launch gate.
4. Render and preflight the production configuration without committing credentials.
5. Deploy the exact qualified SHA to Cloudflare only if all configured integrations are internally consistent.
6. Verify `/api/live`, `/api/ready`, registration proof and configured OAuth starts after deploy.
7. Run a fresh launch audit before declaring Phase 0 commercially open.

## V81 release promotion

PR #58 was merged only after its V81 boundary tests, finance/WhatsApp/agentic qualification, full historical production regressions and genuine production dependency audit all passed. The release remains shadow-only and does not enable autonomous execution.

## Post-migration production checkpoint — 2026-09-14

- Main migration authority SHA `fdfae1390bc487a5cad9db777fbf50ea2c611835` passed the guarded production migration workflow for `047_v81_delegated_authority.sql`.
- The migration workflow passed its exact-current-main check, reviewed SQL pin, prerequisite and partial-state checks, post-migration object verification, foreign-key verification, and live V81 readiness proof.
- Live readiness after migration reports the core and delegated-authority schema layers ready and accepts `047_v81_delegated_authority.sql` as the latest schema delta.
- Exact-main Recovery CI also passes Finance, WhatsApp, V81 agentic qualification, historical production regression and the production dependency audit.
- The next and only release-closure action is a fresh exact-SHA `[deploy]` promotion so BF-07 can seal the post-migration repository state and production automation can record a fully successful deployment.

## 9/10 SaaS hardening after the launch blockers
