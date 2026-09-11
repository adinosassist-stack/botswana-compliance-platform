
## Registration enumeration timing hardening (v1.21.87)

- After Turnstile succeeds, Node and Worker registrations always perform the password hash before checking whether the email already exists.
- Existing-account, successful-account and unique-race generic responses share a 450 ms minimum response floor plus bounded jitter.
- Registration remains protected by IP, platform-wide and normalized-account abuse budgets.
- Public registration status/body remain identical for existing and newly created accounts.

## Payment authentication/configuration hardening (v1.21.86)

- Public payment webhooks use a dedicated strong `PAYMENT_WEBHOOK_SECRET`, checked in production readiness and compared constant-time.
- Payment webhook authentication consumes the native edge limiter before secret verification and body processing.
- Internal payment verification uses the durable privileged-secret attempt budget; refunds require a budgeted dual-secret gate (`BILLING_WEBHOOK_SECRET` + `OPERATIONS_SECRET`).
- Platform-owned secret generation covers all independently generated internal credentials while leaving provider-issued credentials to their issuing systems.

## Brute-force remediation (v1.21.85)
- Destructive retention secrets are strength-validated, compared in constant time, and protected by durable IP/global attempt budgets.
- Production registration requires server-side Cloudflare Turnstile validation with `action=register` and expected-hostname checks, plus IP/platform/account velocity budgets. Public responses are generic for both new and existing emails.
- Cloudflare auth throttles use a two-bucket sliding approximation to prevent predictable fixed-window boundary double-bursts.
- Worker automation, operations, and billing privileged secrets use a centralized constant-time, budgeted verifier.
- Node rejects requests containing more than 100 raw header pairs with HTTP 431 before Express/security middleware sees truncated headers.
- A real npm lockfile + generated SBOM + dependency audit are required by the release gate; BF-07 remains open until that evidence exists.
# Security Launch Gate — v78 Primary Cloudflare Profile

Production must not launch unless all of the following are true:

- HTTPS is enforced and `PUBLIC_ORIGIN` is exact.
- Worker secrets are injected through Cloudflare secret management; no real secret is committed.
- D1 is the primary relational store and R2 is private evidence storage for the Cloudflare profile.
- D1 row-read/write usage is monitored; daily Free limits are treated as availability ceilings, not capacity targets.
- D1 limit errors are bounded and do not expose provider error text.
- `MALWARE_SCAN_REQUIRED` production behavior is enabled and scanner request/response authentication is configured.
- Evidence downloads remain blocked unless clean and authorized.
- Tenant isolation, RBAC, CSRF/origin, account lifecycle and audit integrity regressions pass.
- Registration and password reset enforce the same 12-character minimum as the Node policy and UI.
- Payment provider results are server-verified before entitlements or credits change.
- AI remains tenant-scoped, minimized, schema-bound and non-autonomous; employee reports/HR narratives are not sent to the v78 copilot.
- CIPA remains manual-evidence reconciliation unless an authorized live adapter has passed production tests.
- Privacy notice, terms, retention policy, incident response and professional-review boundaries are approved.
- Independent external security testing is completed before accepting sensitive evidence at scale.

## Optional Node/PostgreSQL profile
If the alternate Node profile is deliberately deployed, PostgreSQL must be private/encrypted/backed up and S3-compatible evidence storage must be private. Those controls do not make PostgreSQL a dependency of the primary Cloudflare profile.
## Node HTTP admission boundary (v1.21.83)
The Node/Postgres profile creates the HTTP server explicitly. Mutating `/api/*` and `/public/*` requests using `Expect: 100-continue` are rejected with HTTP 417 before body upload; unsupported HTTP expectations fail closed. Request headers are capped at 16 KiB and at 100 parsed headers. The release gate checks these controls directly and the socket-level runtime test verifies protected rejection, ordinary compatibility, and oversized-header failure.


- Node evidence presigned PUT capabilities are staging-only. Completion server-copies verified bytes to a fresh quarantine key before scanning, requires scanner SHA-256 attestation for clean/infected verdicts, and blocks deleted/unattested evidence downloads.
