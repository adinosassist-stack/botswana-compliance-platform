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

`payment-pop-http-staging-entry.js` is an API-only entry with fixed intended
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
They do **not** establish a live provider, remote staging E2E, customer UI,
production intake, migration/rollback acceptance or launch readiness.
Production promotion requires a separately reviewed production trust boundary;
changing the staging flags is explicitly insufficient.
