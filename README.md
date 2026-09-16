# Thebe Desk — v1.21.101 BF-07 Toolchain + Packaging Hardening

> **v1.21.99 hardening · 4 September 2026:** BF-07 now has a self-contained clean-registry seal path: exact Node/npm pins, isolated empty npm cache, live registry proof, fresh lockfile regeneration, `npm ci` reconstruction, deterministic CycloneDX double-generation, production-only high/critical audit gating, hash-bound evidence, and exact sealed-artifact revalidation. **Inherited v1.21.98 hardening:** Node evidence completion now range-reads at most 4096 bytes from the committed quarantine object and verifies file magic bytes against the authorized MIME type before the database trust transition. This brings the Node presigned path into parity with the Worker evidence upload path and prevents mislabeled arbitrary content from entering the scan/review workflow as PDF, PNG, JPEG or DOCX. **Inherited v1.21.97 hardening:** staging-to-commit handoff remains ETag-conditional and client PUT replay cannot modify the committed scan/download object.
>
> **v1.21.97 hardening · 4 September 2026:** Node presigned evidence uploads now terminate at a staging key; completion conditionally copies the exact verified staging ETag and re-verifies the object in a fresh server-chosen quarantine key before database rebind, so the original PUT capability cannot overwrite or race-replace the scanned/downloadable object. Clean/infected verdicts require SHA-256 scan attestation and deleted evidence is download-ineligible. **Inherited v1.21.96 hardening:** production Node deployments now require malware scanning, parse `MALWARE_SCAN_REQUIRED` strictly, and bind evidence completion to the presigned object size, MIME type, tenant metadata, and evidence-ID metadata before scan queuing. **Inherited v1.21.95 hardening:** rejects browser requests marked `Sec-Fetch-Site: cross-site` or sibling `same-site` at the pre-auth/public mutation boundary while retaining exact-Origin and CSRF controls plus service-client compatibility when Fetch Metadata is absent. v1.21.94 `__Host-` OAuth state-cookie hardening remains intact.
>
> **v1.21.94 hardening · 4 September 2026:** host-binds OAuth state cookies in production with the `__Host-` prefix in Node and Worker, forbids Domain-scoped state cookies, and clears a validated state cookie consistently when the provider returns an OAuth cancellation/error. v1.21.93 external-provider response bounds remain intact.

> **v1.21.93 hardening · 4 September 2026:** bounds external provider responses before full allocation. OAuth/Turnstile and messaging JSON are capped at 128 KiB, DPO payment XML at 256 KiB, and evidence-scanner responses at 128 KiB in both applicable runtimes. Oversized declared or streamed responses fail closed; v1.21.92 OAuth callback continuity remains intact.
>
> **v1.21.92 hardening · 4 September 2026:** aligns the Node authenticated session cookie to `SameSite=Lax` so the session can survive the cross-site top-level return from Google/Facebook during account linking. Authenticated mutations remain Origin + CSRF protected, the legacy GET link action stays disabled, and OAuth state cookie comparison is now constant-time to match the Worker.
>
> **v1.21.91 hardening · 4 September 2026:** password-reset secrets are now fragment-only in both Node and Worker recovery links, are absent from the HTTP request query, and are stripped from browser history immediately after capture. v1.21.90–v1.21.88 controls remain intact.
>
> **v1.21.90 hardening · 4 September 2026:** production evidence-scanner endpoints must be credential-free public HTTPS and reject localhost, private, link-local, carrier-grade NAT and local/ULA IPv6 targets.
>
> **v1.21.89 hardening · 4 September 2026:** social-account linking now starts only through an authenticated CSRF-protected POST; legacy authenticated GET initiation fails closed.
>
> **v1.21.88 hardening · 4 September 2026:** OAuth redirect configuration is validated against the exact public origin and provider callback path in both runtimes and deployment readiness.
>
> **Inherited request boundary:** compressed API/public mutation bodies remain rejected before parsing; JSON clients must use absent/identity `Content-Encoding`. The v1.21.83 `Expect: 100-continue` pre-body rejection and raw-header envelope also remain enforced.
>
> **v1.21.87 hardening · 4 September 2026:** closes the residual registration timing oracle by hashing before account-existence checks and applying a bounded 450 ms minimum response floor plus jitter to every generic post-Turnstile registration result in both Node and Worker runtimes. v1.21.86 payment-auth/configuration controls remain intact.
>
> **v1.21.86 hardening · 4 September 2026:** closes a production payment-webhook secret/readiness mismatch, adds edge abuse control before webhook authentication, moves internal payment verify/refund credentials onto durable attempt budgets, and completes platform-owned secret bootstrap coverage. v1.21.85 release-boundary controls remain intact.
>
> **v1.21.85 hardening · 4 September 2026:** preserves the BF-01 through BF-06 remediation and hardens the release boundary with an immutable Node container digest, lockfile-only `npm ci`, deterministic SBOM generation, production `workers.dev`/Preview URL disablement, secret/symlink artifact checks, and deterministic packaging. BF-07 remains open until the real registry-backed lockfile and dependency audit exist. The prior brute-force pass closed BF-01 through BF-06. Destructive retention maintenance now requires a production-strength secret, constant-time verification and dedicated durable IP/global attempt budgets; public registration is enumeration-resistant, protected by production Turnstile validation plus platform/account velocity budgets, and no longer auto-creates a login session; Cloudflare auth budgets use a two-bucket sliding approximation; privileged Worker secrets use centralized constant-time budgeted checks; and Node rejects more than 100 raw headers with HTTP 431 before Express can observe a truncated envelope. BF-07 remains a release blocker until a genuine npm lockfile can be generated and audited in a registry-enabled environment; no synthetic lockfile is accepted.

> **v1.21.83 hardening · 4 September 2026:** retains v1.21.82 Node production-mode integrity and restores the HTTP admission layer in executable code. Node now owns the HTTP server explicitly, rejects `Expect: 100-continue` on mutating `/api/*` and `/public/*` requests before body upload, fails unsupported expectations closed, caps request headers at 16 KiB / 100 parsed headers, and keeps normal non-protected `100-continue` traffic compatible. A socket-level runtime test proves the boundary rather than relying on release documentation.

Retained v1.21.82 production integrity: OAuth state signing uses the validated `config.SESSION_SECRET`, including `SESSION_SECRET_FILE`; OAuth state cookies derive `Secure` from `APP_ENV=production`; and the development email fallback remains disabled in production.

> **v1.21.81 hardening · 4 September 2026:** retains v1.21.80 Cloudflare login-account throttling and closes the remaining distributed password-reset flooding gap across deployment profiles. Node/Postgres now applies a durable HMAC-keyed normalized-email reset-request budget before user lookup, independent of source IP. Cloudflare keeps its existing IP-independent reset-account budget but now returns the same generic reset response when that budget is exhausted, preserving account-enumeration resistance. Raw email addresses are not stored in either limiter ledger.

Current hardening candidate: **V78 1.21.101**. BF-07 (reproducible npm lockfile + dependency audit) is intentionally still blocking final launch sealing. The primary production profile remains Cloudflare Worker + D1 + R2. Current Node/Postgres readiness requires `032_v82_workspace_version_numeric_contract.sql`; `031_v78_durable_auth_rate_limit.sql` remains the durable-auth schema prerequisite. The Cloudflare schema floor remains `043_v78_session_inventory_hardening.sql`; v1.21.94 requires no schema change and preserves v1.21.90 scanner endpoint hardening, v1.21.89 social-link CSRF hardening, v1.21.88 OAuth redirect hardening, v1.21.87 registration timing hardening, v1.21.86 payment-auth/configuration hardening and v1.21.85 release-boundary hardening and preserves v1.21.82 production-mode integrity, the v1.21.81 reset-account controls, v1.21.80 login-account protections, v1.21.79 compressed-request boundary, and prior OAuth, reset, malware-scan, public-edge and pre-body protections.

See `docs/LAUNCH.md`, `docs/LAUNCH_STATUS.md` and the current v1.21.99 adversarial report for the release gate.


This release simplifies notifications around one rule: **interrupt owners/managers only when action is genuinely urgent; group routine follow-up into the daily operating loop**. It adds a server-backed attention brief, fixes tenant-wide in-app dedupe for NULL recipients, keeps routine 7/30-day reminders in-app, limits external performance alerts to critical signals, preserves the scheduled daily operations summary, and tightens management notification/dead-letter APIs.

# V78 1.21.23 — Business outcome-first simplification

This release simplifies the Business area around three management outcomes: Botswana business readiness, licence/registration attention, and confirmed tax facts. Company filings, business-change workflows, detailed profile fields, manufacturing requirements and corporate particulars remain available through progressive disclosure. Manager sessions do not receive owner-only tax/profile cards, and licence summary data continues to come from the role-authorized licence API.

# V78 1.21.22 — People & operations outcome-first simplification

This release simplifies the People area around daily reporting, staff records, and employment follow-up. Advanced performance learning, alert thresholds, reporting-location setup, and employee reporting-link administration remain available through progressive disclosure. Employee reporters remain isolated to their private reporting form and cannot access leadership, company-wide performance, HR, tender, billing, AI-management, or administration surfaces.

# V78 1.21.21 — Documents & proof outcome-first simplification

- Documents & proof now starts with three practical questions: what proof is needed, what proof exists, and what needs attention.
- Secure evidence counts as ready only when the malware scan is clean, evidence is approved, and any validity/review date is still current.
- Quarantined, pending, scan-error, infected, expired and due-soon evidence is surfaced as attention rather than counted as verified.
- Specialist evidence modules remain available under progressive disclosure: Evidence library, Evidence checks, Documents, Inspection preparation, Compliance Passport and Professional reviews.
- Auditor evidence UX is explicitly read-only: add-evidence entry points and the add form are removed for auditor sessions, with client guards backing the server boundary.
- Reviewer evidence upload stays available through the secure file workflow; metadata-only reviewer writes are blocked because reviewer state PUT is intentionally fail-closed.
- Full release regression, runtime, SEO, role, payment, evidence and Cloudflare launch gates remain required before packaging.

# V78 1.21.20 — container alignment + full-platform adversarial hardening

- Container alignment is selective and role-safe: KPI/stat cards, marketing feature/pricing cards, metric summaries and empty states are centered; forms, tables, audit/evidence/task rows and compliance narratives remain left-aligned.
- Manager financial mutations are now owner-only at both UI and Worker boundaries, including payment-provider selection, hosted checkout, AI-credit packs, professional-service orders and indirect remediation escalation.
- OAuth/login return paths resolve against a trusted same-origin base and reject backslash-normalized external redirects.
- Reviewer/auditor mutations are fail-closed through a central mutation allowlist while permitted evidence/regulatory/review workflows remain available.
- Account deletion uses one canonical owner-only API on Cloudflare and Node, requires `DELETE MY ACCOUNT` server-side, bounds the reason, uses tenant-scoped status, and keeps the legacy route disabled.
- SEO indexing fails closed when a valid HTTPS production origin is missing: HTML is noindex, robots disallows crawling and the sitemap is unavailable until `PUBLIC_APP_URL`/`PUBLIC_ORIGIN` is valid.
- Multi-page SEO remains: homepage plus CIPA, BURS/tax, business licences, employment compliance, tender readiness, compliance evidence and pricing, with truthful Service schema and five public plans (P149–P2,499; Partner assisted onboarding).
- Complete source regression/security suite and Cloudflare launch gate are required before packaging; the exact final ZIP is extracted and retested before handoff.

# V78 1.21.17 — Multi-page SEO effectiveness + full 3-pass adversarial hardening

- Adds seven unique crawlable Botswana landing pages: CIPA, BURS/tax, business licences, employment compliance, tender readiness, compliance evidence and pricing.
- Dynamic per-page canonicals and OpenGraph URLs are rendered from the deployed public origin on Cloudflare and Node.
- Sitemap expands from one URL to eight indexable public URLs; homepage links directly to the guides.
- Adds a Google-eligible 96x96 PNG favicon, Apple touch icon and 192/512 PWA icons; Organization structured data now uses the real brand icon instead of the hero photo.
- Guide pages are lightweight, JavaScript-free (except JSON-LD), Botswana-specific and include official-source links where appropriate.
- Full application regression/security suite remains required after the SEO changes.

# V78 1.21.16 — SEO effectiveness + 3-pass adversarial hardening

- Added deployment-origin canonical rendering, OpenGraph/Twitter metadata, en-BW locale signals and WebSite/Organization/WebApplication JSON-LD without fabricated reviews or ratings.
- Added crawlable Botswana SME compliance content for CIPA, BURS, employment, licences, tenders and evidence, plus FAQ and internal anchor links.
- Added dynamic `/robots.txt` and `/sitemap.xml`; JSON APIs emit `X-Robots-Tag: noindex, nofollow`.
- Replaced SPA soft-404 behavior with a real noindex 404 page and canonical redirect from `/index.html` to `/`.
- PWA starts at `/` and no longer caches `/index.html` as a duplicate homepage.
- Hidden workspace/auth/reporting surfaces use `data-nosnippet` so marketing search snippets are not polluted by app-shell text.
- Standalone preview is intentionally noindex to prevent accidental preview indexing.
- Dedicated SEO gates: static/adversarial 35/35 PASS + runtime canonical/robots/sitemap PASS. Full historical release suite remains required before packaging.

# Thebe Desk — V78

Package **1.21.15** continues the simplified V78 release line. This adversarial hardening enforces forward-only licence chronology, tenant-valid licence location references, read-only Compliance Passport projection for reviewer/auditor roles, and owner/manager-only Business Event APIs. See `V78_1_21_14_3_PASS_ADVERSARIAL_REPORT.md`.

## v15 UI/UX refresh
Benchmark direction: Linear (calm, consistent navigation), Vanta (priority tasks and progress), Stripe (dense predictable operational summaries), Deel (status clarity / less admin).

Changes:
- calmer dim sidebar with grouped navigation
- sticky compact command header
- quick section jump
- clearer dashboard hierarchy around today's actions
- denser professional cards/tables
- improved inputs, focus states, mobile navigation, spacing and typography
- source conflict banner demoted from alarm state to controlled review state
- no change to legal safety / tenant boundaries / launch security controls


## v15 UX additions
- Command palette and keyboard navigation
- Mobile bottom navigation
- Next Best Action prioritization
- Workspace setup progress
- Better empty states and accessibility navigation
- Reduced mobile action density


## v16 acquisition & monetization UX
- Public landing page before authentication
- Benefit-led product preview and trust messaging
- Botswana Pula pricing: Starter P99, Business P249, Business Pro P499
- 14-day free-trial CTA
- In-app Plan & Billing workspace
- Server-persisted plan preference
- No raw card data enters the application; hosted billing provider integration remains the production path


## V78 1.21.26 — first-value onboarding
- Quick start is reduced to two factual steps before the first protection check.
- VAT, PAYE and trade/licence registration facts support an explicit `unknown` state; unknown never becomes a silent “not applicable” conclusion.
- Initial workspace state is persisted before onboarding is marked complete, removing the stale-state race before rule evaluation.
- The first protection check evaluates current published server rules, recalculates statutory schedules and surfaces the first server-backed actions on Home.
- A failed first check remains visibly pending and can be retried; an empty action queue is never described as legal all-clear.
- Cloudflare and Node onboarding-completion routes are owner-only.

## V78 1.21.28 — First-action completion
- Adds a named action owner and lifecycle timestamps to regulatory obligations.
- Preserves authoritative due dates; the completion workflow does not rewrite statutory deadlines.
- Allows work to start before proof is complete, but blocks review/completion until mandatory proof is approved, scan-clean and current.
- Final completion requires an explicit attestation, is audit-recorded, resolves open obligation escalations and surfaces the next server-backed action.

### Node reverse-proxy trust
The Node/Postgres runtime defaults `TRUST_PROXY_HOPS=0`, so client-supplied `X-Forwarded-*` headers are ignored. Set a value from 1 to 3 only when the Node service is reachable through exactly that many controlled reverse proxies; mismatched hop counts can weaken IP-based abuse controls.
