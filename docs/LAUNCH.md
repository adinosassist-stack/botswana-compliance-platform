# Launch Runbook — V78 1.21.101 BF-07 Toolchain + Packaging Hardened

The **primary v78 public launch path is Cloudflare Worker + D1 + R2**. The separate Node/Express + PostgreSQL profile is optional and is not required for the free-first launch.

## Required before public launch
1. Create the production D1 database and R2 evidence bucket; keep the R2 bucket private.
2. Set `PUBLIC_ORIGIN` / `PUBLIC_APP_URL` to the final HTTPS origin and replace every placeholder ID and example secret.
3. Initialize the production D1 schema correctly: **for a brand-new database**, load the current `cloudflare/schema.sql`; **for an existing database**, back it up and apply only the pending release migrations in order through `043_v78_session_inventory_hardening.sql`. Do not replay migration 001 against a fresh database—the migration chain begins from an older baseline. Do not stop an existing v78 upgrade at migration 020; later management-control migrations are required by the current Worker.
4. Configure `SESSION_SECRET` and the dedicated `AUDIT_INTEGRITY_SECRET` with `wrangler secret put`; configure only approved live provider secrets.
5. Deploy static assets + Worker and verify `/api/live` and `/api/ready`.
6. Register a test tenant, sign in, create/update a company, reload and confirm D1 persistence.
7. Verify tenant isolation, role restrictions, CSRF/origin protection and account deletion/export flows.
8. Upload a harmless approved file and confirm quarantine → malware scan → clean → authorized download against R2.
9. Verify payment settlement/reconciliation using authorized DPO test credentials before enabling paid fulfillment.
10. Configure `RESEND_API_KEY` as a Worker secret and `EMAIL_FROM` as the verified sender before enabling password reset/email; verify OAuth and optional WhatsApp with live credentials before advertising those channels as active.
11. Keep CIPA reconciliation in manual approved-evidence mode until an authorized CIPA machine interface and live reconciliation tests exist.
12. Publish privacy notice, terms, retention policy, support/incident contacts and professional-review boundaries.
13. Obtain Botswana professional review of executable legal/tax rules; unresolved authoritative-source conflicts remain fail-closed.
14. Monitor Cloudflare usage from day one. Workers Free currently permits 100,000 requests/day; D1 permits 5 million rows read/day and 100,000 rows written/day. D1 daily limits are enforced and reset at midnight UTC. Upgrade before sustained usage approaches the ceiling.
15. Complete an independent vulnerability scan / professional security test before accepting sensitive production evidence at scale.

## Release/schema coherence check
Before every production deploy, verify these four values move together:
- `package.json` version
- `RELEASE_PROFILE.json` `package_version`
- `public/sw.js` cache version
- latest schema delta in `cloudflare/migrations/`

For **V78 1.21.101**, the package/cache version is `1.21.101`. BF-07 sealing now requires the exact Node 22.23.2 / bundled npm 10.9.8 toolchain pair, an isolated initially-empty npm cache, a live canonical-registry probe, fresh lockfile resolution, `npm ci` reconstruction, byte-stable CycloneDX generation, production-only high-severity audit evidence, and a hash-bound `bf07-evidence.json` manifest before launch/package gates can pass. The GitHub workflow uses read-only repository permissions and version-agnostic artifact paths. v1.21.98 evidence-signature hardening remains enforced. Node completion range-reads at most 4096 bytes from the committed quarantine object and verifies file magic bytes against the authorized MIME type before the evidence row can become uploaded. v1.21.97 staging-to-commit ETag isolation remains enforced. Node presigned evidence uploads are staging-only: completion conditionally copies the exact verified staging ETag to a fresh quarantine key, re-verifies metadata, atomically rebinds the evidence row, and only then queues scanning. Configure the private object-store lifecycle to expire abandoned objects under `staging/` within 24 hours. Clean/infected scanner verdicts require SHA-256 and downloads require scan timestamp + digest; deleted evidence is never downloadable. v1.21.96 mandatory Node malware-scan readiness remains enforced. Node production startup and readiness now require `MALWARE_SCAN_REQUIRED=true` plus a valid scanner URL/secret; evidence completion verifies object size, MIME type, tenant metadata and evidence-ID metadata before scan queuing. v1.21.95 Fetch Metadata CSRF hardening remains enforced. Browser-bound mutation requests now reject `Sec-Fetch-Site: cross-site` and sibling `same-site` before Origin/CSRF processing; requests without Fetch Metadata remain compatible with service clients and still use the inherited Origin/CSRF policy. OAuth state cookies use the `__Host-` prefix in production/Worker flows and validated provider cancellation clears the state cookie before redirect. External provider responses are now read through bounded streaming parsers before JSON/XML processing; oversized declared or streamed responses fail closed. v1.21.92 OAuth callback continuity remains enforced. Node account-link callbacks now use `SameSite=Lax` session continuity while authenticated mutations remain protected by exact Origin + CSRF validation; the legacy GET link action remains disabled and OAuth state cookie equality is constant-time. v1.21.91 password-reset fragment hardening remains enforced. Password-reset secrets are delivered in the URL fragment rather than the request query and are removed from browser history immediately after capture, reducing exposure through HTTP request logs, CDN/proxy logs, analytics and browser history. v1.21.90 requires evidence-scanner endpoints to be public, credential-free HTTPS targets and rejects localhost, private, link-local and local/ULA IPv6 destinations. v1.21.89 requires social-account linking to start through an authenticated CSRF-protected POST; the legacy GET initiation fails closed with 405. v1.21.88 validates Google/Facebook redirect URIs against the exact configured public origin and provider callback path in both Node and Worker readiness/runtime paths. v1.21.87 registration timing-enumeration defenses and v1.21.86 payment-auth/configuration controls remain enforced. BF-01 through BF-06 remain remediated; BF-07 remains a fail-closed release blocker until a real registry-backed `package-lock.json` is generated, a deterministic SBOM is generated from it, and the dependency audit passes. No new schema migration is required. The primary Cloudflare schema remains current through `043_v78_session_inventory_hardening.sql`; the Node/Postgres fallback remains current through `031_v78_durable_auth_rate_limit.sql`. The inherited authentication controls remain explicit: Cloudflare login has an account budget independent of source IP, so rotating IPs cannot multiply guesses against one account; raw email addresses are not stored in limiter ledgers. Password-reset requests retain an account budget/account-throttle in addition to IP controls. The v1.21.82 Node production-mode fix remains active: `APP_ENV` controls production behavior and `SESSION_SECRET_FILE` is consumed through validated secret-file configuration. The v1.21.83 HTTP expectation boundary also remains active: protected mutating API/public requests with `Expect: 100-continue` are rejected before body upload, unsupported expectations fail closed, and the raw-header envelope remains fail-closed.

## Fail-closed launch rules
- D1 daily limit reached => API returns bounded 503 + `Retry-After`; no provider error is exposed. Capacity must be optimized/upgraded rather than bypassed.
- Worker code is newer than the production D1 schema => `/api/ready` fails closed with `schema_outdated`; apply the required migration before serving production traffic.
- No R2 evidence storage or malware scanner => evidence cannot become trusted/downloadable.
- Source conflict => executable rule remains blocked.
- High-risk employment action => professional-review gate remains active.
- Expired session or invalid membership => access denied.
- Unverified payment return => no entitlement/credit fulfillment.
- CIPA API not formally authorized/tested => no live-sync claim.

## Optional Node/PostgreSQL profile
The repository retains a separate Node/Express + PostgreSQL/S3-compatible profile for development or a future deployment migration. If deliberately chosen, use its environment validation, migrations, backup/restore scripts and private object-storage requirements. Do not provision PostgreSQL merely to launch the Cloudflare profile.

- **Node proxy trust:** keep `TRUST_PROXY_HOPS=0` for direct exposure. If a controlled reverse proxy is used, set the exact hop count (1-3) and verify the application server cannot be reached around that proxy.

### Node malware scanner callback contract

When `MALWARE_SCAN_REQUIRED=true`, the scanner job request includes `evidenceId` and a unique `scanJobId`. The scanner callback must echo both values and send `x-scan-signature` as lowercase/uppercase hexadecimal HMAC-SHA256 over `evidenceId:scanJobId:status:sha256` using `MALWARE_SCAN_WEBHOOK_SECRET` (empty string when `sha256` is omitted). A scan job is single-use: replayed, stale, duplicate, or superseded callbacks receive a conflict response and must not be retried as a fresh verdict.
