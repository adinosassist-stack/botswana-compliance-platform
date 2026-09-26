# Cloudflare Free-Tier Deployment

This profile is intentionally designed for **P0/month hosting** while usage remains inside Cloudflare Free allowances.

## Architecture

- Cloudflare Pages / Worker Static Assets: frontend
- Cloudflare Worker: API
- D1: relational application data
- R2 Standard: evidence/document storage
- Dedicated `thebe-evidence-scanner` Worker on `evidence-scanner.thebedesk.com` for signed malware-scan requests
- Cloudflare secrets: OAuth/session/email/scanner credentials
- Cron Triggers: two bounded jobs in `wrangler.toml` (06:15 and 16:15 UTC); Workers Free currently permits up to five triggers per account

## Do not deploy on the free profile

- always-on Node/Express server
- Docker container
- managed PostgreSQL
- Durable Objects unless a feature genuinely requires them
- Workers AI as a mandatory request path
- large server-side PDF parsing
- OCR
- continuous background polling
- large audit/event fan-out

Those can move the product outside the P0 target or exceed the 10 ms Worker CPU budget.

## Cost controls

1. Static files never invoke the Worker unless `/api/*` is called.
2. Dashboard loads should be aggregated and cached client-side.
3. D1 queries must use tenant/time/status indexes.
4. Avoid N+1 queries.
5. Evidence bytes live in R2, never D1.
6. Default upload cap: 3.5 MB (3,500,000 bytes) for Cloudmersive free-tier scanner compatibility.
7. Do not upload duplicate files if a content hash already exists.
8. Audit reads default to latest 100–500 rows.
9. Retention cleans stale/failed files.
10. External AI calls are opt-in and usage-capped separately; they are not part of the P0 hosting promise.

## Active evidence uploads

Recovery R1 ships with `EVIDENCE_UPLOADS_ENABLED="true"`. Evidence upload readiness is fail-closed: the application requires a credential-free HTTPS `EVIDENCE_SCAN_API_URL` and a strong `EVIDENCE_SCAN_SECRET`, and the dedicated scanner Worker requires the same signing secret plus `CLOUDMERSIVE_API_KEY`. Files enter the R2 quarantine namespace, are SHA-256 and magic-byte checked, then are sent to the scanner through a signed request envelope. A signed `clean` verdict is required before an owner/manager/reviewer can approve evidence, and only scan-clean + approved evidence can be downloaded or used by downstream proof controls.

Successful uploads and manual scan retries kick a scan immediately with `waitUntil()`; the bounded scheduled scan sweep remains the durable fallback. Owner, manager and reviewer roles may upload/retry/review evidence. Auditor access is read-only and can download only already approved, scan-clean evidence. The production Worker retains `EVIDENCE_UPLOADS_ENABLED=false` as an emergency incident-response kill switch, but production preflight requires uploads to be enabled for this release.

The scanner adapter is in `cloudflare/scanner/`. Deploy it before the main Worker, configure its two secrets, confirm `/health`, then configure the main Worker with the same `EVIDENCE_SCAN_SECRET` and `https://evidence-scanner.thebedesk.com/scan`.

## Important

P0/month is a usage target, not an unlimited guarantee. Free-tier quotas are finite. As of 1 September 2026, the relevant launch ceilings include 100,000 Worker requests/day, 5 million D1 rows read/day and 100,000 D1 rows written/day. D1 now enforces its daily read/write limits: once exceeded, D1 queries fail until the limit resets at midnight UTC. Monitor D1 Row Metrics, keep tenant/time/status indexes effective, and move to Workers Paid before sustained traffic threatens the ceiling.

The Worker converts a detected D1 free-daily-limit error into a bounded `503 database_daily_limit_reached` JSON response with `Retry-After`; it never exposes the provider error string. This is a last-resort failure boundary, not a substitute for capacity monitoring.

## Business Protection Copilot (v78)

`POST /api/ai/advisor` is an authenticated, CSRF-protected, tenant-scoped and read-only management endpoint. It supports `ask`, `next_actions`, `explain_risk`, `management_brief` and `tender_readiness` modes. Tendering remains an active product workflow.

The endpoint sends only a bounded whitelist of workspace facts to the configured Workers AI binding. It does not send evidence bytes, employee names, HR case narratives, secrets or raw audit content, and it gives the model no tools. The response must match a JSON schema, reference only supplied workspace labels, and is rendered with DOM text nodes in the UI. The application stores run metadata and an output hash, never the question or answer.

The default model remains `@cf/zai-org/glm-4.7-flash` and can be changed with `AI_ADVISOR_MODEL`. A Workers AI run costs six application credits, respects the existing monthly hard stops, is limited to ten completed/fallback tenant runs per minute, and refunds the correct wallet or partner pool on provider/output failure. If no AI binding is configured, the endpoint returns a clearly labelled deterministic workspace fallback without charging credits.

The current Cloudflare profile requires the finance, governed-agentic, delegated-authority and bounded-task schema chain. For a brand-new D1 database, load the current `schema.sql`, which represents the consolidated base schema, then apply migrations 047, 048, 049, 050, 051, 052, 053, 054 and 055 in order. For an existing database, back up first and apply only pending numbered migrations in order through 055. Do not replay migration 001 against a fresh database; the migration chain starts from an older baseline. Migration 047 remains governance/telemetry only; migration 048 adds a separate internal task-execution persistence layer but does **not** activate execution by itself. See `../docs/LAUNCH.md` and `../V81_AGENTIC_BUSINESS_OS.md`.

## V81 delegated authority — shadow only

The V81 authority layer lets an owner define tenant-scoped, action-specific limits for future bounded agent work and lets the system record whether a proposed action would pass those limits. The D1 schema hard-locks these grants and action intents to shadow mode.

The authority API does not contain an external-action execution route. Payments, government/statutory filings, signatures, employment termination, financing acceptance and journal posting remain human-only. Strong-auth integration for delegated external side effects is not live yet, so those evaluations fail closed instead of trusting a browser/client header. A future real-execution release requires a new migration, explicit release flag, compensating-action design, end-to-end provider validation and fresh adversarial review.

## WhatsApp utility notifications (v76)

The Worker includes a direct Meta WhatsApp Cloud API adapter. It is disabled unless the business number, access token, app secret, webhook verification token and all six approved utility templates are configured. The callback is `/api/webhooks/whatsapp` and must be subscribed to WhatsApp `messages` webhooks so signed delivery statuses are received.

Users must give explicit consent in Notification settings. The launch formatter accepts Botswana mobile numbers beginning with `7` and stores them in `+267XXXXXXXX` form. The UI/API expose only a masked number. Revocation disables the channel and cancels queued reminders for that user.

Provider acceptance is not displayed as delivery. Signed status events advance through accepted, sent, delivered, read or failed, and failed events enter the existing dead-letter workflow. Monthly reservations are server-capped by plan to protect unit economics.

See `../V76_WHATSAPP_SETUP.md` for the exact template parameter order and production activation gate.

## CIPA / OBRS registry reconciliation (v77)

v77 does not hard-code or claim a live CIPA API connection. An owner or manager stages normalized registry particulars from an approved, scan-clean Corporate evidence record observed within the last 31 days. The Worker stores a content-hashed snapshot and field-level comparisons against the selected company profile.

Only an owner can resolve a difference. Applying the CIPA value checks both the workspace version and the exact internal value captured at staging; concurrent edits return a conflict and require a fresh snapshot. Retaining the workspace value requires a factual reason. All staging and resolution actions write authoritative audit events.

Do not add screen scraping, browser credentials, or guessed endpoints. A future live adapter must use CIPA-authorized endpoint, authentication, scope and schema documentation and must pass provider/live reconciliation tests before the UI can display live-sync status. See `../V77_CIPA_REGISTRY_RUNBOOK.md`.

## Social OAuth (v37)
Cloudflare Worker social sign-in now supports Google and Facebook directly. Configure these Worker secrets/variables before enabling the buttons in production:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI` (must end at `/api/auth/oauth/google/callback` on the deployed origin)
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_OAUTH_REDIRECT_URI` (must end at `/api/auth/oauth/facebook/callback`)
- optional `FACEBOOK_GRAPH_VERSION`

Google may link an existing local account only when Google reports a verified email. Facebook never links to an existing account by email alone; the user must sign in first and explicitly link it under Sign-in & Accounts.

### Current upgrade delta
The current upgrade delta `migrations/055_v149_finance_watch_audit_integrity.sql` is the required existing-database release tip and must be applied after migration 054 and all earlier numbered migrations. For a brand-new D1 database, load the current `schema.sql`, then apply migrations 047, 048, 049, 050, 051, 052, 053, 054 and 055 in order. Migration 047 remains shadow-only; migration 048 does not activate execution unless the separately reviewed runtime and explicit bounded-task execution switch are enabled.

## V102 bounded internal task execution

The first executable agent surface is limited to internal `task.create`. It requires a separate tenant/action execution grant, exact owner approval binding, the Agent Runtime Guard, idempotent receipts and D1 outcome verification. The global execution switch defaults off, and no external-side-effect or human-only action is enabled by migration 048.
