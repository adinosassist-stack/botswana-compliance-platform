# Workspace Agent staging readiness — offline-only qualification

**Status:** code review candidate, not staging deployment approval. The independent reviewer is `thusico`. This batch adds no Cloudflare token, Worker, route, D1 binding, customer session, feature activation or production write.

## Evidence that can be qualified now

The offline script `scripts/workspace-agent-offline-staging-qualification.mjs` checks that production Wrangler does not explicitly set `WORKSPACE_AGENT_ADVISORY_SHELL_ENABLED=true`; the /app injection requires the exact server-side flag and a server-probed owner/manager role; the Cloudflare task endpoints reject non-GET requests and enforce authenticated tenant binding; and the browser fixture continues to cover company/tenant switching, expired sessions, and no write requests.

It outputs a structured JSON receipt with a SHA-256 source fingerprint and explicitly declares `readyForStagingDeployment=false` and `productionActivationAuthorized=false`. **Passing its static checks cannot establish live configuration, deployed binary identity, remote secrets or staging resource isolation.** Production configuration may contain remote Worker overrides not represented in the checked-in file; a later independent live read-only check must verify actual bindings/vars.

The workflow `.github/workflows/workspace-agent-offline-staging-qualification.yml` runs automatically on relevant PRs. The optional manual audit can run only on `main`, with a 40-character expected main SHA and a repeat check that current remote main equals that exact SHA before and after qualification. It has read-only GitHub permissions, uses no Cloudflare credentials, and cannot deploy. The JSON evidence artifact is retained for 7 days.

## Verified blocker: missing Node transport parity

The current `server/server.js` exposes `GET /api/auth/me`, but its returned user fields do not include the opaque user ID required by the Agent controller. It also has **no** `/api/agentic/workspace-identity` or `/api/agentic/workspace-tasks` route equivalent to the Cloudflare Worker implementations. Node support is therefore **not** qualified. Do not replace opaque identity with email, page data, query parameters or a client-supplied ID. Any Node implementation requires tenant-constrained database access, matching authorization, privacy review, and independent tests.

## Remaining staging release requirements

1. Select and independently verify a **dedicated isolated** staging Worker, D1/auth fixture, secret permissions and network access policy. Do not reuse the production D1, POP/billing/General AI databases, customer sessions or an existing Worker without separately documented isolation approval.
2. Review the exact current main SHA; require an independently configured GitHub protected staging environment with `thusico` approval, self-review prevention, main-only execution and no admin bypass.
3. Verify the staging Worker has no public routes, workers.dev or preview endpoints, and the feature flag is initially off. Enabling it for a synthetic authenticated staging owner/manager must be a separate explicitly approved action.
4. Test live session and opaque identity, one synthetic owner, one manager, denied reviewer/auditor, two isolated synthetic tenants, expired/revoked sessions, tenant switch with pending responses, tab/page resume and dock remount. Confirm the advisory UI remains read-only and accessible.
5. Verify Node and Cloudflare API parity before claiming full transport readiness, or formally and explicitly scope the staging acceptance to Cloudflare only with Node blocked.
6. Collect redacted evidence and rollback plan, then obtain separate owner and independent reviewer approval for each protected deployment or activation. Never auto-activate production.

**No workflow in this batch dispatches a remote mutation.** Passing offline CI is an input to review, not staging or production release authority.
