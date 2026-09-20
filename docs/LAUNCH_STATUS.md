# Thebe Desk Launch Status — 2026-09-14

## Executive status

- **Production release: GREEN.** The exact Phase 0 release SHA `a99684e8311d4d831182118043ee328ed86bbe4f` passed Recovery CI, BF-07 sealing, the guarded Cloudflare production deployment, live readiness verification, and an independent exact-SHA post-deploy browser/runtime smoke.
- **Repository main:** `a99684e8311d4d831182118043ee328ed86bbe4f`, matching the deployed release authority. There is no known application-code/deployment drift at this checkpoint.
- **Live runtime:** Thebe Desk V78 `1.21.101` on `https://thebedesk.com` with the V81 delegated-authority wrapper active in **shadow-only** mode.
- **Schema requirement: current v1.21.101 schema** — `/api/ready` reports D1, R2, core schema and V81 delegated-authority schema ready, with `047_v81_delegated_authority.sql` as the latest schema delta.
- **Recovery qualification:** PASS. Finance, WhatsApp, agentic/V81 boundaries, historical production regressions, supply-chain checks and the production dependency audit all passed on the exact release SHA before deployment.
- **BF-07:** PASS. The exact release SHA was resolved from clean npm registry state, reconstructed from the committed lockfile, audited, SBOM/provenance bound, sealed and independently re-verified before deployment.
- **Cloudflare deployment:** PASS. Authorization diagnostic, dry-run, exact candidate deployment and live readiness verification completed successfully.
- **Post-deploy smoke:** PASS. Exact-SHA drift guard, public/security endpoints, registration proof, deferred-provider fail-closed behavior, V81 auth boundary and browser-level customer navigation all passed without creating customer records.
- **Registration abuse control:** PASS. Registration uses the signed first-party `thebe_proof` challenge with bounded difficulty/expiry and hardened server validation.
- **Production data inventory at the release audit:** 0 users, 0 tenants, 0 memberships, 0 operating locations, 0 employees and 0 daily employee reports.
- **Public go-live: CONDITIONAL** — the technical Phase 0 release is ready for controlled use under the deliberately limited feature envelope below; optional provider integrations remain deferred unless explicitly configured, and intentionally disabled paid checkout/evidence uploads must not be represented as active.

## Closed production gates

- BF-01 through BF-06 security findings are closed.
- BF-07 supply-chain and provenance controls are closed for the deployed SHA.
- Production deploys are exact-SHA bound and refuse stale or non-main release authority.
- Production deployment restores the exact BF-07 artifact, rechecks release closure, renders/preflights Cloudflare configuration, performs a dry-run and verifies live readiness after deployment.
- Core schema readiness through migration 046 and delegated-authority readiness through migration 047 both pass.
- D1, R2 evidence and Workers AI bindings are present and healthy.
- `AI_FEATURES_DEFAULT=on` is active for Phase 0.
- Security headers pass for HSTS, nosniff, frame denial, referrer policy, CSP, COOP and CORP.
- First-party registration proof is live and passes exact post-deploy verification.
- V81 delegated authority remains authenticated, role-bounded and **shadow-only**; autonomous external execution is not enabled.
- The customer-facing landing/auth navigation passes headless-browser smoke with no critical same-origin JS/asset failures.

## Optional external integrations

These are not Phase 0 blockers when **fully absent**. If any integration is partially configured, readiness must fail closed until its complete contract is present.

### Google OAuth

When enabled, production must supply:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- exact redirect URI `https://thebedesk.com/api/auth/oauth/google/callback`

When fully deferred, `/api/auth/oauth/google/start` must return HTTP 503 and must not redirect. When configured, the post-deploy smoke permits only an HTTPS redirect to the expected Google provider host.

### Facebook OAuth

When enabled, production must supply:

- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- exact redirect URI `https://thebedesk.com/api/auth/oauth/facebook/callback`

When fully deferred, `/api/auth/oauth/facebook/start` must return HTTP 503 and must not redirect. When configured, the post-deploy smoke permits only an HTTPS redirect to the expected Facebook provider host.

### Password-reset email

When enabled, production must supply:

- `RESEND_API_KEY`
- `EMAIL_FROM` using a verified sender/domain

A fully absent mail integration is an accepted Phase 0 deferred state. Partial configuration or placeholder senders fail closed.

## Deliberately disabled — not Phase 0 blockers

- **Paid checkout:** `PAYMENT_PROVIDER=none`. Payment credentials and reconciliation are required before paid checkout is enabled.
- **Evidence file uploads:** `EVIDENCE_UPLOADS_ENABLED=false`. A production malware-scanner path is mandatory before accepting evidence bytes.
- **WhatsApp provider sending:** provider execution remains disabled until Meta credentials/templates and explicit enablement are approved. Existing Phase 0 WhatsApp preparation/owner-centre behavior remains qualified.
- **CIPA live registry sync:** not claimed until an authorized endpoint, scopes and live reconciliation proof exist.
- **Orange Money:** remains outside the current Phase 0 release envelope pending its own readiness review.
- **Thebe Live Voice:** activation release migrates the voice path to the OpenAI Realtime GA WebRTC contract, requires server-side `OPENAI_API_KEY`, and keeps all business work behind the governed single-agent backend. Production enablement is guarded by exact-SHA release checks, rate limits, a failure circuit, and the Runtime Guard.

## Exact release sequence

Every future production release should follow this authority chain:

1. Qualify the exact candidate SHA with Recovery CI.
2. Seal the same SHA through BF-07 from clean npm registry state and generate the exact provenance-bound artifact.
3. Allow the production workflow to restore and verify that exact BF-07 artifact.
4. Render and preflight production configuration without committing credentials.
5. Run Cloudflare authorization and deployment dry-run checks.
6. Deploy the exact qualified SHA only after all configured integrations are internally consistent.
7. Verify `/api/live`, `/api/ready`, registration proof and release-specific production readiness.
8. Run the **Exact Post-Deploy Smoke** bound to the successful production deployment SHA, covering fail-closed external integrations and customer-facing browser navigation without customer writes.

No step may substitute evidence from a different SHA.

## V81 delegated-authority status

- Production migration `047_v81_delegated_authority.sql` is present and live readiness confirms the authority schema.
- The authority status endpoint requires authentication; unauthenticated access fails closed.
- Delegated authority remains **shadow-only**. Intent evaluation may be recorded, but autonomous external execution remains disabled for this release.

## Post-deploy production checkpoint — 2026-09-14

- Production SHA: `a99684e8311d4d831182118043ee328ed86bbe4f`.
- Recovery CI: PASS on exact release SHA.
- BF-07 seal: PASS on exact release SHA.
- Production deploy: PASS.
- Live readiness: PASS.
- Exact post-deploy HTTP/fail-closed smoke: PASS.
- Exact post-deploy browser smoke: PASS for landing runtime, Start Free, Sign in, Explore workspace, See plans and direct registration page.
- No customer/tenant data was created by the verification flow.

## Remaining governance item

Application and deployment gates are green, but repository-level protection for `main` is not currently enforced by GitHub branch protection/required-status-check settings. This is a repository administration control, separate from the application release gates, and should be enabled when the repository plan/admin surface permits it.

## Next-release hardening

Node/Postgres lineage corrections identified by the final red-team branch should be qualified separately before any future Node/Postgres production use. They are not blockers for the current Cloudflare/D1 production release and must not be merged blindly because the older red-team branch contains stale external-integration assumptions.
