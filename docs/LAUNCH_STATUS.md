# Launch Status — V78 1.21.94 External provider response bounding hardening candidate
- **HTTP admission boundary:** v1.21.83 makes Node own the HTTP server explicitly, rejects protected mutation `Expect: 100-continue` requests before body upload, rejects unsupported expectations, and caps headers at 16 KiB / 100 parsed headers.
- **Brute-force remediation:** BF-01 through BF-06 are closed in v1.21.85: privileged destructive secrets are strength-checked/constant-time/budgeted, registration is enumeration-resistant and Turnstile-protected in production, Worker auth throttles use sliding accounting, and Node raw header counts fail closed with HTTP 431 before Express.
- **Registration enumeration timing hardening:** v1.21.87 removes the residual fast-path account timing signal by hashing before account lookup and applying a bounded minimum response floor plus jitter to all generic post-Turnstile registration outcomes.
- **OAuth redirect configuration hardening:** v1.21.88 requires HTTPS, exact `PUBLIC_ORIGIN`, exact provider callback path, and no query/fragment drift in both Node and Worker readiness/runtime paths.
- **Social account-link CSRF hardening:** v1.21.89 disables legacy authenticated GET link initiation; account linking starts only through an authenticated CSRF-protected POST.
- **OAuth state cookie host binding:** v1.21.98 preserves `__Host-` state cookies for production OAuth flows and clears validated cancellation state consistently.
- **Outbound scanner endpoint hardening:** v1.21.90 restricts evidence scanning to credential-free public HTTPS endpoints and rejects localhost, private, link-local, carrier-grade NAT and local/ULA IPv6 targets.
- **Password-reset fragment hardening:** v1.21.91 keeps reset secrets out of the HTTP request query, uses fragment-only delivery, and strips the fragment from browser history immediately after capture.
- **External provider response bounding:** v1.21.93 caps streamed OAuth/Turnstile/provider JSON, DPO XML and evidence-scanner responses before full allocation, including both declared-length and streaming-overrun rejection.
- **Node OAuth callback continuity hardening:** v1.21.92 uses `SameSite=Lax` for the authenticated Node session so Google/Facebook account-link callbacks can revalidate the initiating session; mutations remain Origin + CSRF protected and OAuth state equality is constant-time.
- **Payment authentication/configuration hardening:** v1.21.86 requires separate strong `PAYMENT_WEBHOOK_SECRET` and `BILLING_WEBHOOK_SECRET` values, edge-throttles payment webhook authentication before body processing, durably budgets internal payment verification/refund secret attempts, and expands the platform-owned secret generator.
- **Release-boundary hardening:** v1.21.85 pins the Node container image by immutable multi-platform digest, requires `npm ci` from the real lockfile with lifecycle scripts disabled, makes SBOM output deterministic, rejects non-registry/unintegrity-locked packages, disables `workers.dev` and public Preview URLs in the production Worker profile, and adds a deterministic release packager. BF-07 remains open until registry-backed lock/audit evidence exists.
- **Production-mode integrity boundary:** v1.21.82 remains retained and makes `APP_ENV` the single Node production authority. OAuth state HMAC uses validated `config.SESSION_SECRET` even when supplied through `SESSION_SECRET_FILE`; OAuth state cookies are `Secure` in `APP_ENV=production`; development console email cannot receive password-reset links in production.

## Software release status
- **Supply-chain blocker:** BF-07 remains open. A genuine npm `package-lock.json`, generated CycloneDX `sbom.cdx.json`, and passing high-severity dependency audit are mandatory before final release sealing. This build deliberately refuses a synthetic lockfile.
- **Code/security remediation: BF-01 through BF-06 CLOSED; final package gate: HOLD (BF-07)** — current source and deployable artifact are aligned at v1.21.98 with credential-snapshot-bound password login, compare-and-set PBKDF2 rehash, generation-safe session revocation, opaque session inventory, per-device sign-out, database-owned webhook/purge claims, authorization freshness, atomic reporting revisions, restore verification and bounded-body hardening.
- **Schema requirement: current v1.21.101 schema** — a fresh D1 database loads `cloudflare/schema.sql`; an existing D1 database must be upgraded through delta `043_v78_session_inventory_hardening.sql`. `/api/ready` verifies the current schema probe before reporting ready.
- **Public go-live: CONDITIONAL** — the external production gates below still require real credentials/resources/approvals and must not be inferred from a green source test.

## Implemented in the primary Cloudflare profile
- Worker-native registration/login, 12-character minimum password policy, secure sessions and CSRF/origin checks
- Server-derived tenant isolation and RBAC
- D1 migrations and tenant-scoped persistence
- R2 evidence quarantine, SHA-256 integrity, scan gate and authorized downloads
- Append-only authoritative audit/control lineage protections
- Trial/subscription/entitlement and payment-verification controls
- Daily Operations and bounded AI performance summaries
- Read-only Business Protection Copilot with tenant-scoped, minimized context
- CIPA evidence reconciliation without an unverified live-sync claim
- D1 free-tier quota failure boundary: bounded 503 + Retry-After
- Free-first deployment metadata aligned across `wrangler.toml`, release profile and runbooks
- Full historical release-regression chain

## External go-live gates
- Production D1/R2 resources created and all migrations applied
- Malware scanner service connected and tested with benign + recognized test-signature files
- Production secret manager / Worker secrets configured
- Domain/DNS/TLS active and `PUBLIC_ORIGIN` exact
- DPO merchant credentials and real sandbox/production reconciliation verified before paid launch
- Live Resend email (`RESEND_API_KEY` + verified `EMAIL_FROM`) and OAuth credentials validated
- Meta WhatsApp business credentials/templates + real-device test before enabling that channel
- CIPA-authorized endpoint/auth/scopes/schema + live reconciliation test before claiming registry sync
- D1/Workers usage monitoring with an upgrade trigger before Free ceilings threaten availability
- Independent vulnerability scan / professional security test before sensitive evidence scale-up
- Privacy notice, terms, retention policy and Botswana professional rule review approved
- Support/incident contacts and operational ownership assigned

## Optional alternate profile
Node/Express + PostgreSQL/S3-compatible storage remains an alternate deployment path only. It is not a dependency of the primary Cloudflare launch.

- **Node/Postgres malware scan callbacks:** scan jobs are uniquely identified, HMAC-bound, one-time consumable, and guarded against stale replay, duplicate completion and queue-failure races. Node readiness requires `031_v78_durable_auth_rate_limit.sql`, which includes and succeeds the malware-scan migration floor.

- v1.21.77 Public edge abuse hardening: WhatsApp webhook POST throttling occurs before bounded body/HMAC work; passport receipt codes are exact-format validated and edge-throttled before D1 lookup.
- v1.21.79 Request-encoding abuse hardening: Node JSON parsers disable automatic compression inflation, and Cloudflare mutating API/public JSON entry points reject non-identity `Content-Encoding` before body reads/parsing.
- v1.21.80 Cloudflare account-throttle hardening: password login combines a source-IP D1 budget with a separate HMAC-keyed normalized-email budget that is independent of source IP; raw email addresses are not stored in the limiter ledger.
- v1.21.81 Password-reset account-throttle hardening: Node/Postgres and Cloudflare both enforce source-IP-independent normalized-email reset-request budgets before account lookup. Node returns the existing generic reset response when the account budget is exhausted, and Cloudflare now uses the same generic body for its account-throttle path; raw email addresses remain absent from limiter storage.

- v1.21.82 Node production-mode integrity hardening: removed the OAuth state literal development-key fallback, bound OAuth signing to the validated secret-file-aware session secret, made the OAuth state cookie Secure flag follow `APP_ENV`, disabled development email fallback in `APP_ENV=production`, and bounded malformed OAuth state before timing-safe signature verification.
