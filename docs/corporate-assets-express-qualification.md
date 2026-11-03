# Corporate Assets Express integration — qualification checklist

The Express adapter is **not mounted** in `server/server.js`. It remains disabled until staging qualification and independent approval. This document describes the exact integration contract without changing production behavior.

## Existing server integration points

- The host server is `server/server.js`, using Express and PostgreSQL `pg.Pool`.
- Existing `auth` middleware loads `req.auth` from a validated server session. It provides `tenant_id`, `user_id`, and `role`.
- Existing `requireEntitlement` middleware verifies the subscription.
- Use `registerCorporateAssetsExpress` only with `enabled: true` in an explicitly qualified staging environment, passing existing `auth` and `requireEntitlement`.
- The adapter's `rateLimit` must be backed by the host's actual abuse-control implementation; a stub that always returns true is **not acceptable** for activation.
- `getDatabase` must provide a tenant-authorized PostgreSQL query interface. The caller cannot supply tenant IDs, roles or authorization flags.
- The proposed SQL schema uses forced RLS with no policies. **Do not deploy or enable reads until database role, RLS policy, tenant transaction scope, and permission grants are independently qualified.**
- No browser-provided tenant, company or user identity is trusted.
- The adapter is read-only. All write endpoints remain disabled.
- This adapter must not be mounted on Cloudflare D1; its SQL is PostgreSQL-specific.

## Staging verification

1. Confirm valid owner and manager sessions can list their own tenant's register, maintenance and insurance data.
2. Confirm unauthorized, expired-session, disabled-entitlement and disallowed-role requests cannot query the database.
3. Confirm tenant A cannot access tenant B rows, including through direct SQL under the application's runtime role.
4. Confirm requests are rate limited and the JSON responses remain non-cacheable.
5. Confirm no route is registered when the feature flag is disabled.
6. Run `node --test tests/corporate-assets-*.test.mjs` and the existing launch checks.
7. Preserve all independent review, release, and recovery gates.

This is implementation guidance only, not evidence that staging qualification or production registration has occurred.
