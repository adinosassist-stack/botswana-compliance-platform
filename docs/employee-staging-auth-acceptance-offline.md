# Employee Self-Service — isolated synthetic authentication acceptance

## Scope of this batch

This is a **review-only**, local/in-CI staging-acceptance expansion. Tests exercise the existing Employee Self-Service handlers on a fresh `node:sqlite` in-memory database using synthetic `.invalid` identities, the actual additive D1 migration, and mock request/rate-limit boundaries. No remote Worker or production data is touched. Neither this batch nor its PR enables employee accounts or changes production flags.

The extended `tests/employee-self-service-runtime.test.mjs` now covers the following adversarial conditions together:

| Acceptance condition | Expected result |
| --- | --- |
| Forged or malformed `__Host-thebe_staff_session` cookie | HTTP 401; never resolves an employee session |
| Expired database session reused for profile, task list, or progress mutation | HTTP 401; existing task state and version unchanged |
| Incorrect CSRF on logout | HTTP 401, cookie clearing requested; server session remains until a correctly authenticated logout |
| Correct CSRF on logout | Server session deleted, `Secure; HttpOnly; SameSite=Strict` clearing cookie; replay returns 401 |
| New invitation accepted for an existing staff account | Previous sessions revoked, former password rejected, password PBKDF2 hashed and new password accepted |
| Already-used replacement invitation | HTTP 410; cannot reuse 48-hour invite |
| Manager A invites/assigns an employee belonging to tenant B | HTTP 404; zero unauthorized invite or task inserts |
| Employee A attempts to sign into tenant B, or workspace auditor accesses manager tasks | HTTP 401 / 403 respectively |
| Bad request origin or exhausted edge rate limit | HTTP 403 / 429 **before** database access |

Run from repo root:

```bash
npm run test:employee-self-service
node --test tests/employee-self-service-staging-boundary.test.mjs tests/employee-self-service-protected-bootstrap-guard.test.mjs
node scripts/employee-self-service-staging-preflight.mjs
```

The existing `employee-self-service-staging-offline.yml` PR workflow executes both the employee runtime test suite and the staging-boundary checks. It has **no deployment job**. These checks are valuable regressions but **do not** establish live Cloudflare authentication or mobile browser acceptance.

## What this does NOT qualify

- The separate `bw-employee-self-service-staging` status-only Worker has no authenticated routes, no public hostname, and has not been deployed. The isolated D1 currently has the staff tables but no synthetic users or full production-shaped workspace schema.
- No real-user invitation, login, mobile accessibility, cookie behavior across a live browser, session/rate-limit binding, request origin handling at the edge, tenant isolation on a Cloudflare-bound Worker, or private-secret wiring has been live-tested.
- The separate protected GitHub environment `employee-self-service-staging-protected` must be verified independently with `thusico` as reviewer, self-review prevention, no admin bypass, **main-only deployment policy**, and dedicated environment secrets. See issue #2271.
- Any inert Worker creation needs its own exact-current-`main` SHA, protected `workflow_dispatch` authorization, and independent environment approval. Any later authenticated staging runtime needs a different reviewed security profile and full isolated schema.
- Production `THEBE_STAFF_PORTAL_ENABLED` remains default-off. Nothing here approves a production database migration, public hostname, actual employee accounts, customer data, or employee launch.

## Evidence collection for the next protected staging milestone

Record the exact source SHA, GitHub Actions run link, independent reviewer and environment-policy evidence, expected staging D1 UUID, a marker/table/foreign-key/read-only verification, target Worker absence, and separate owner/reviewer release approvals. Never log token values, tenant identifiers from customer data, passwords, invitation tokens, session tokens, or private employee information.

**If the exact SHA, staging environment policy, credential scopes, isolated resource identity, zero-data condition, or Worker absence cannot be independently verified, do not deploy or retry blindly.**
