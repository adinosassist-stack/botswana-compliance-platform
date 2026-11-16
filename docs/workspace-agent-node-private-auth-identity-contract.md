# Workspace Agent Node /api/auth/me opaque user identity — test-only contract

**Review-only code candidate. No staging/production activation or migration.**

The authenticated Workspace Agent shell checks `payload.user.id` after `GET /api/auth/me`; the existing Node response includes role, email, tenantId, tenantName and CSRF but does not include this opaque user ID. The private Node Agent task/identity API already requires server-authenticated `req.auth.user_id`/`tenant_id` and accepts only owner/manager roles. Email, DOM data, URL parameters and client-provided IDs are not substitutes.

This batch adds `privateNodeAgentAuthIdentityFields` and updates Node `/api/auth/me` to include `user.id` **only** when `APP_ENV=test` AND `WORKSPACE_AGENT_NODE_PRIVATE_TEST_ENABLED=true`, the authenticated role is owner/manager and both the session user and tenant IDs are valid UUID strings. The value comes exclusively from the existing authenticated server session `req.auth.user_id` (not another request field). Reviewers, auditors, missing sessions, malformed IDs, production and development do not gain a user ID field. The existing Node response fields remain in place; the response sets `Cache-Control: no-store`.

No browser authorizes itself: the Agent's existing same-origin identity endpoint still verifies the session and tenant before a task snapshot is accepted. The private Node identity/task routes remain themselves gated to the test environment. The Node PostgreSQL responsibilities schema and live Node transport are **not yet qualified**. The pending PostgreSQL metadata preflight and the unmounted SQL candidate are not proof of staging readiness.

**No deployment, state mutation, database migration or feature flag enablement is performed by this PR.** A later separately approved protected staging run must prove the exact source revision, isolated test database, correct current session, role revocation, tenant switching and denied-by-default behavior before any expansion beyond synthetic private tests. Preserve independent `thusico` review and separate activation approval.
