# Thebe Desk Launch Status

## Canonical release authority

The mutable production release identity is **not maintained manually in this document**.

The canonical repository authority is [`release/production.json`](../release/production.json). It carries the production sequence and the exact qualified source SHA selected for promotion. The protected release chain then binds that manifest to the exact release merge, BF-07 seal, Cloudflare deployment, live-readiness verification and post-deploy evidence.

For the current deployed release, use these sources in this order:

1. `release/production.json` — intended production sequence and qualified source SHA.
2. Successful **BF-07** workflow for the exact release merge SHA — sealed artifact and provenance evidence.
3. Successful **Production deploy** workflow for that same SHA — Cloudflare deployment authority and recorded deployed SHA.
4. Exact-SHA post-deploy workflows — client runtime, mobile smoke, customer UI/fail-closed smoke and Phase 0 launch audit.

Do not copy a production SHA, sequence number, main SHA or deployment timestamp into this file as mutable status. Those values become stale and can contradict the protected release chain.

## Current technical status

Schema requirement: current v1.21.101 schema. Existing production databases must reach the current packaged Cloudflare migration tip using only pending release migrations; code/schema drift fails closed.

Public go-live: CONDITIONAL. Code readiness and successful production qualification do not fabricate readiness for optional external integrations that remain deliberately deferred.

- **Production release gate:** GREEN when the exact manifest-selected source has completed Recovery CI, BF-07 sealing, guarded production deployment and exact-SHA post-deploy verification.
- **BF-07:** CLOSED as a launch blocker. Every future production release must still pass the BF-07 gate from clean registry state; any BF-07 failure fails the release closed.
- **Cloudflare production path:** Worker + D1 + R2 remains the primary production profile.
- **Node/Postgres profile:** retained as a separately qualified fallback/development profile; it is not the authority for the Cloudflare production deployment.
- **Password recovery:** production verification is part of the exact-SHA client-runtime post-deploy gate.
- **Mobile:** Android-sized startup, menu and registration behavior are covered by the exact-SHA mobile post-deploy smoke.
- **Property Calculator:** delivery is explicitly covered by the exact-SHA client-runtime post-deploy gate. Its placement is not changed by release-status maintenance.
- **Customer UI:** live HTTP, fail-closed contracts and browser navigation are verified without customer writes by post-deploy smoke.
- **Phase 0 launch audit:** authentication, roles, AI boundaries, live production, synthetic full-user lifecycle and zero-orphan closure must all pass on the deployed authority.
- **Thebe bounded execution:** production is restricted to the reviewed internal `task.create` `platform_admin_canary`. An eligible session must be an authenticated `owner` whose email is already in `PLATFORM_ADMIN_EMAILS`, and execution still requires canonical Thebe authority, same-tenant delegation, separate execution grant, exact payload-bound owner approval, same-owner single-use JIT permit, Runtime Guard success, budget/kill-switch/daily-cap clearance, receipt/read-back verification and audit. Managers, ordinary owners and non-allowlisted owner emails remain fail-closed. This is not general customer/autonomous execution.

## Release chain

Every production release follows this authority chain:

1. Qualify the exact candidate source SHA.
2. Merge only the manifest-only production release change that advances `release/production.json`.
3. Seal the exact release merge SHA through BF-07 from clean npm registry state.
4. Reconfirm exact current `main` and restore the exact BF-07 evidence.
5. Render, preflight and dry-run the Cloudflare candidate without exposing real secrets.
6. Deploy the exact qualified release SHA only after authorization and closure checks pass.
7. Verify live readiness and record the deployed SHA.
8. Run exact-SHA client runtime, password recovery, mobile, customer UI/fail-closed and Phase 0 launch-audit workflows.

No step may substitute evidence from a different SHA.

## Fail-closed rules

- A stale or non-main release authority must not deploy.
- A BF-07 failure must block deployment.
- Missing or inconsistent production environment inputs must block deployment.
- A schema/runtime mismatch must fail readiness closed.
- Partially configured external integrations must fail closed rather than silently degrade into a claimed active state.
- Deployment success is not sufficient by itself; exact-SHA post-deploy verification is required.
- Bounded `task.create` execution must remain closed unless the reviewed production mode is exactly `platform_admin_canary` and the complete canary eligibility/control chain passes at execution time.
- The legacy global compatibility path is not the reviewed production canary posture and must not be substituted for it without a separate authority-expansion release review.
- Payments, filings, signatures, employment termination, financing acceptance, journal posting and external messaging remain outside the bounded internal-task canary.

## Optional integrations

Optional integrations are not launch blockers when deliberately and fully deferred. If enabled, their complete production contract and exact-SHA verification must pass before they are represented as active. This includes Google/Facebook OAuth, password-reset email delivery, WhatsApp provider sending, paid checkout, evidence-byte uploads, registry integrations and live voice/provider features.

## Documentation policy

This file describes **release rules and current gate semantics**, not a manually maintained release number. Historical launch snapshots belong in Git history and workflow evidence. The live mutable release identity belongs in `release/production.json` and the exact-SHA deployment workflow evidence.

The repository release-status drift guard validates this policy so stale copied SHAs/sequences do not reappear here.
