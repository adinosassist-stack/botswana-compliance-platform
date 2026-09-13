# Thebe Desk Launch Status — 2026-09-13

## Executive status

- **Repository main:** `7cb96f9b9ae8ca3202a883f2bece8b4f232179ef`.
- **Last successfully deployed production release:** `f97d8fa01a8363da82bdd1d26f78090eafa0d9ce`.
- **Live runtime:** Thebe Desk V78 `1.21.101` on `https://thebedesk.com`.
- **Schema requirement: current v1.21.101 schema** — a fresh D1 loads `cloudflare/schema.sql`; an existing production D1 must be upgraded through `043_v78_session_inventory_hardening.sql`, and `/api/ready` must report `schemaReady=true`.
- **Core production readiness:** **PASS**. The fresh Phase 0 audit proved `/api/live`, `/api/ready`, D1, R2, Workers AI, schema readiness, required core configuration and production security headers.
- **Registration abuse control:** **PASS**. Registration now uses the signed first-party `thebe_proof` challenge with same-origin issuance, IP binding, proof-of-work, honeypot and replay rejection. Turnstile remains as legacy compatibility configuration but is not the active registration gate.
- **Production data inventory at the latest live audit:** 0 users, 0 tenants, 0 memberships, 0 operating locations, 0 employees and 0 daily employee reports.
- **Public go-live: CONDITIONAL** — code/core infrastructure are ready, but Google OAuth, Facebook OAuth and password-reset email remain required external launch integrations.
- **Phase 0 launch decision:** **HOLD only on external identity/email integrations**. Google OAuth, Facebook OAuth and password-reset email are the remaining required launch integrations.
- **Current main deployment state:** the OAuth/email deployment-contract hardening is merged but intentionally **not deployed** because no `[deploy]` marker was used and the external credentials are not yet configured.

## Closed production gates

- BF-01 through BF-06 security findings are closed.
- BF-07 supply-chain controls are implemented: genuine lockfile/SBOM/dependency evidence, exact-SHA qualification and sealed provenance are enforced by the release path. The last deployed production SHA passed Recovery CI and BF-07 before deployment.
- Production deploys are exact-SHA bound, refuse stale/non-main targets, restore the exact BF-07 evidence and re-run the launch gate before Cloudflare promotion.
- Production D1 is on the current `043_v78_session_inventory_hardening.sql` schema boundary; `/api/ready` verifies schema readiness.
- D1 inventory audit queries are split into bounded per-table queries and complete successfully.
- Cloudflare DB, R2 evidence and Workers AI bindings are present and healthy.
- `AI_FEATURES_DEFAULT=on` is active for Phase 0.
- Security headers pass for HSTS, nosniff, frame denial, referrer policy, CSP, COOP and CORP.
- First-party registration proof is live with hardened difficulty and bounded expiry.
- Payments remain fail-closed with `PAYMENT_PROVIDER=none`.
- Evidence uploads remain fail-closed with `EVIDENCE_UPLOADS_ENABLED=false`.

## Remaining blocking launch integrations

### Google OAuth

The GitHub `production` environment and provider configuration must supply:

- Variable: `GOOGLE_OAUTH_CLIENT_ID`
- Secret: `GOOGLE_OAUTH_CLIENT_SECRET`
- Exact authorized redirect URI: `https://thebedesk.com/api/auth/oauth/google/callback`

The post-deploy gate requires `/api/auth/oauth/google/start` to redirect to `accounts.google.com`.

### Facebook OAuth

The GitHub `production` environment and Meta/Facebook provider configuration must supply:

- Variable: `FACEBOOK_APP_ID`
- Secret: `FACEBOOK_APP_SECRET`
- Exact authorized redirect URI: `https://thebedesk.com/api/auth/oauth/facebook/callback`

The post-deploy gate requires `/api/auth/oauth/facebook/start` to redirect to `www.facebook.com`.

### Password-reset email

The GitHub `production` environment and Resend account must supply:

- Secret: `RESEND_API_KEY`
- Variable: `EMAIL_FROM` using a verified sender/domain

Placeholder senders such as `example.com` or `example.invalid` fail the production renderer/preflight.

## Deliberately disabled — not Phase 0 blockers

- **Paid checkout:** `PAYMENT_PROVIDER=none`. DPO credentials and reconciliation are required only before paid checkout is enabled.
- **Evidence file uploads:** disabled. No malware-scanner provider is required while uploads remain disabled; upload/mutation routes must continue to fail closed. A scanner becomes mandatory before accepting evidence bytes.
- **WhatsApp notifications:** optional until Meta credentials/templates are approved and the channel is explicitly enabled.
- **CIPA live registry sync:** not claimed. Existing CIPA evidence/reconciliation behavior must remain truthful until an authorized endpoint, scopes and live reconciliation test exist.
- **Orange Money:** remains blocked pending its separate readiness review.

## Exact next release sequence

1. Create/verify the production Google OAuth client, Facebook app credentials and Resend sender/domain outside the repository.
2. Add `GOOGLE_OAUTH_CLIENT_ID`, `FACEBOOK_APP_ID` and `EMAIL_FROM` as GitHub `production` environment variables.
3. Add `GOOGLE_OAUTH_CLIENT_SECRET`, `FACEBOOK_APP_SECRET` and `RESEND_API_KEY` as GitHub `production` environment secrets. Never commit their values.
4. Seal the exact current `main` SHA through BF-07 and Recovery CI before promotion. An explicit reviewed `[deploy]` release commit may be used to start the automatic path.
5. Deploy the exact qualified SHA. The workflow will render/preflight the integration configuration, inject secrets through an ephemeral Wrangler secrets file and then verify live readiness, first-party registration proof and both OAuth provider redirects.
6. Run a fresh `[launch-audit]` against the exact current `main` SHA.
7. Complete real registration, login, Google/Facebook sign-in and password-reset delivery smoke tests before declaring Phase 0 commercially open.

## 9/10 SaaS hardening after the launch blockers

- Protect `main` with repository rules/branch protection and require reviewed PRs plus relevant CI before merge. The repository currently reports `main` as unprotected, so this remains a governance maturity gap even though the release workflow itself is strongly exact-SHA gated.
- Add production observability/SLO ownership and alerting for auth failure rate, D1 quota pressure, latency, Worker errors and external-provider failures.
- Add independent vulnerability testing before scaling sensitive evidence workflows.
- Keep privacy notice, terms, retention policy, incident contacts and Botswana professional/compliance review current before broad customer scale.
- After launch stability is proven, resume product-depth work on the Decision Engine, Simulation Engine and Benchmark Network rather than expanding into unrelated modules.

## Optional alternate profile

Node/Express + PostgreSQL/S3-compatible storage remains an alternate deployment path only. It is not a dependency of the primary Cloudflare launch.
