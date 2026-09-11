## Scheduled run observability — v1.21.68
- Durable cron claims are stored in `platform_scheduled_runs` using a unique cron + scheduled-time key.
- Completed/running events are not replayed; failed events may retry safely, and stale running claims can be recovered.
- Platform admins can inspect the latest bounded run history at `GET /api/platform/scheduled-runs`.
- `/api/ready` fails closed unless migration `043_v78_session_inventory_hardening.sql` is present.

## Tenant deletion purge — v1.21.52

Tenant deletion is resumable and fail-closed. R2 evidence object variants are removed in bounded batches before D1 tenant data is purged. Completion writes only a non-PII HMAC tenant fingerprint tombstone, deletes non-cascade tenant/partner rows explicitly, deletes the tenant to cascade owned records, and removes only users that have no membership in another tenant. `npm run check:tenant-purge` audits schema coverage so future tenant-linked tables cannot silently escape the purge plan.

# Operations Runbook

## Health and diagnostics
- `GET /api/live` — process liveness; no database dependency.
- `GET /api/health` — database connectivity.
- `GET /api/ready` — database migrations plus required production storage configuration.
- `GET /api/ops/diagnostics` — authenticated Owner/Auditor diagnostics with version, uptime, memory, counters, latest migration and object-store reachability check.

Do not expose diagnostics without authentication.

## Logging
Server logs are structured JSON. Route logs include request ID, method, path, status, duration and authenticated tenant/user IDs where available. Centralize logs in the production platform and alert on:
- elevated 5xx rate
- repeated authentication failures
- readiness failures
- abnormal evidence-upload authorization volume
- process restarts

Never add passwords, session tokens, CSRF tokens or signed storage URLs to logs.

## Deployment
1. Validate environment configuration.
2. Build immutable image.
3. Run migrations as a one-shot task.
4. Start app only after migration success.
5. Require `/api/ready` before receiving traffic.
6. Run `npm run preflight -- https://your-domain` after TLS/DNS routing.

## Database concurrency
Workspace updates use optimistic version checks. HTTP 409 means another session saved a newer workspace. The client must reload before retrying; never blindly replay a stale full-workspace write.

## Evidence lifecycle
1. API creates evidence metadata as `pending` and signs a short-lived upload.
2. Browser uploads directly to private storage.
3. Browser calls completion endpoint after successful storage upload.
4. Downloads require tenant-scoped authorization and receive a 3-minute signed URL.
5. A future malware-scanning service should quarantine new objects before changing them to a trusted/available state.

## Session operations
Sessions have fixed expiry. Revoked/expired sessions are cleaned hourly. Authentication failures are separately rate-limited.


## Evidence malware scanner
Production readiness requires `MALWARE_SCAN_REQUIRED=true`, a scanner job endpoint, and a strong callback secret. Evidence remains non-downloadable until `scan_status=clean`. Alert on `infected` and repeated `error` states.

## Subscription operations
New tenants receive a trial. Expired/past-due tenants retain read access but mutations are blocked with HTTP 402. Billing-provider webhooks must be signature-verified before modifying subscription status.

## Multi-tenant integrity
Run the API integration suite on every release. It registers two tenants and verifies their workspace states remain isolated.

## Worker correlation and scheduled-job diagnostics — v1.21.51
Unexpected Worker failures return an `X-Request-ID` and matching JSON `requestId`; when Cloudflare supplies `CF-Ray`, that value is reused so support can correlate the client error with Workers logs. Do not log bearer tokens, passwords, session cookies, CSRF tokens or signed object-store URLs.

Cron executions emit a generated `runId` on completion/failure. Alert on `scheduled_run_failed`, repeated `worker_request_failed`, D1 daily-limit errors and sustained public-endpoint 429 responses.

## Public bearer-link throttling
`PUBLIC_RATE_LIMITER` uses Cloudflare's native Rate Limiting binding. The key is an HMAC-derived token identifier, not the raw Passport/reporter token. The v1.21.51 default is 30 calls per 60 seconds per endpoint/token key, enforced at the edge before D1 lookup.
