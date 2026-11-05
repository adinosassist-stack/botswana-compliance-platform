# General AI production readiness — offline qualification gate

This gate is **review preparation only**. It cannot deploy a Worker, enable General AI, change Cloudflare secrets, create synthetic identities, approve releases, or grant public access.

## What it verifies

- The entire `tests/general-ai-*.test.mjs` suite, not merely the five focused tests in the protected private-staging deploy workflow.
- The Python staging session/authentication contract.
- Both General AI and research variables remain `false` in production and isolated staging.
- The staging profile retains its reviewed D1 ID and dedicated rate-limiter namespace and has no routes, workers.dev, or preview URLs.
- Wrangler bundles isolated staging offline with `--dry-run`; the job preserves an exact-commit offline evidence artifact with bundle checksums.

## What it does **not** prove

- Live provider API success, paid-provider costs or billing limits.
- Actual authenticated HTTP, CSRF, membership, revocation, tenant isolation or rate-limiting behavior on the deployed Worker.
- Production token least-privilege scopes, credential expiration, or Cloudflare dashboard policies.
- Deployment identity, public DNS/Workers route absence, or actual production deployment readiness.
- Human production-owner and independent `thusico` approvals on the **final production release SHA**.

## Required production NO-GO conditions

Do not enable `THEBE_GENERAL_AI_ENABLED` or `THEBE_GENERAL_AI_RESEARCH_ENABLED` while any of these remain unresolved:

1. Private access path and separately reviewed non-production auth fixtures exist for authenticated staging HTTP acceptance.
2. Staging provider model and its dedicated credentials, spend caps, global budgets, error and timeout handling pass controlled private tests.
3. Consent, privacy, tenant-bound authorization, CSRF/session expiry/revocation and rate limit tests pass.
4. For research: live Brave search, safe source handling, citation provenance, freshness and prompt-injection checks pass; otherwise keep research disabled.
5. Production-specific rate limiter, kill switch, monitoring, rollback, privacy review, cost caps and dock/mobile/voice regressions are independently qualified.
6. Fresh exact-SHA owner and `thusico` approvals, normal required CI, branch governance and protected GitHub environment approval are present.

Only GitHub CI and release evidence are touched by this change; it does not satisfy or bypass any gate above.

Reference: release tracking Issue #1950 and the successful private-only staging deployment Run #19.
