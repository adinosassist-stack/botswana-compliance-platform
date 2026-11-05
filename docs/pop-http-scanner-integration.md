# POP HTTP and scanner integration batch

This connects the existing receipt primitives through a **default-off, staging-only**
HTTP boundary. Production is refused before storage access, regardless of flags.
The billing read-only Worker is unchanged. No resource, credential, route, schema,
customer account or feature has been provisioned or enabled by this patch.

## Routes and trust

| Method | Route | Trusted caller |
| --- | --- | --- |
| POST | `/api/payments/manual-bank/pop/upload` | Authenticated tenant owner; session tenant; CSRF and exact Origin |
| GET | `/api/platform/billing/pop/receipts?orderId=…` | Server-derived platform billing owner |
| GET | `/api/platform/billing/pop/download?documentId=…&tenantId=…&orderId=…` | Platform owner; clean content-bound signed verdict; sealed audit |
| POST | `/api/platform/billing/pop/scan` | Platform owner; exact document/tenant/order scope |
| POST | `/api/platform/billing/pop/retire` | Platform owner; expected hash/ETag plus explicit reason |
| POST | `/api/platform/billing/pop/recovery` | Platform owner; inspection/audit only |

The upload ID is generated server-side, body streams are capped at 3,670,016
bytes, and retries preserve the existing tenant/order reservation. A receipt,
including a clean scan, never settles an order or activates a subscription.
Downloads remain attachments with private/no-store, sandbox and nosniff headers.
Unknown provider errors are sanitized; no automatic scanner retry occurs.

The synchronous scanner protocol sends multipart fields `metadata`, `signature`
and `file`. Metadata and signed response formats are defined by
`payment-pop-scan-verification.js`. Responses must be JSON with exactly string
`body` and `signature`; streamed response bytes are bounded at 20,000 and the
existing HMAC, scope, hash, ETag, request-window and sealed-audit checks run before
a verdict becomes durable. A failed/uncertain transport leaves pending state;
operators inspect it before retrying after the five-minute request window.

## Isolated deployment requirements — not performed

`payment-pop-http-staging-entry.js` is an staging entry with fixed intended
origin `https://pop-staging.thebedesk.com` and D1 UUID
`812f9021-890b-41e6-8fa1-6001f90a9b53`. It allowlists login/session and these
receipt routes only, strips unrelated integration secrets and forces AI and
payment providers off. It does not create a hostname or change billing staging.
Before deployment, independently verify actual D1/R2 bindings and all routes;
the runtime ID variable is a configuration assertion, not proof of provider
identity. Use reviewed synthetic tenants only. Never bind production resources.

Set `APP_ENV=staging`, `DEPLOYMENT_PROFILE=pop-http-staging`, both origin vars to
the fixed origin, `POP_HTTP_STAGING_D1_ID` to the above UUID and
`POP_HTTP_STAGING_SOURCE_SHA` to the reviewed source. All `POP_*_STAGING_ENABLED`
flags default off: enable only the independently accepted test capabilities.
The Worker needs isolated DB/EVIDENCE, SESSION_SECRET and AUDIT_INTEGRITY_SECRET.
Scanning separately requires POP_SCAN_SECRET, POP_SCANNER_ID and POP_SCAN_API_URL.
Verify provider ownership/DNS/egress, private quarantine, secret separation, cost,
privacy/retention contract and signed protocol compatibility before sending bytes.
No scanner vendor has been selected or qualified by this patch.

## Evidence and remaining work

The integration tests use real local SQLite and workerd R2; only scanner network
transport is simulated with signed bytes. They cover upload/replay, clean and
blocked/failed verdicts, audited attachment delivery, explicit retirement,
tenant/role/CSRF/origin rejection, bounded streaming, and no payment effects.
They do **not** establish a live provider, remote staging E2E, production customer UI,
production intake, migration/rollback acceptance or launch readiness.
Production promotion requires a separately reviewed production trust boundary;
changing the staging flags is explicitly insufficient.

## Staging interface and configuration

The isolated entry serves `/pop/` with a nonce-based CSP, same-origin-only
requests and no browser persistence. Customers can sign in and upload; review
controls require the server-derived platform billing capability. Receipt names
use literal text nodes. Failed upload retries retain the same idempotency key;
sign-out clears metadata and fences late responses. Retirement requires an
explicit reason and confirmation. This interface has local DOM/controller tests,
not a completed visual browser or remote provider acceptance.

Generate a non-public, default-off config with
`EXPECTED_SHA=<reviewed SHA> POP_STAGING_ADMIN_EMAILS=<designated admin> node scripts/render-pop-http-staging-config.mjs`.
It binds only the fixed POP staging D1 and dedicated proposed bucket
`bw-pop-http-staging-quarantine`; it creates neither. Public/custom routes,
previews and all receipt/AI capability flags remain absent or disabled. Verify
that the bucket exists, is private and unused by production before reviewing
any deployment. The independent staging environment, secrets, actual synthetic
accounts and scanner-provider contract remain required outside this generator.

`payment-pop-authenticated-worker.test.mjs` exercises the actual Worker session,
tenant, CSRF, revocation and platform-admin boundary using local SQLite. No
caller-supplied role/header can authorize platform receipt access.
