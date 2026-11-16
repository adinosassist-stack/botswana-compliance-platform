# Thebe Desk quotation — consolidated source completion and release gates

**Scope:** The Lovely-style, two-page quotation editor with configurable
top-left logo, BWP line items, discounts, saved drafts, and private PDF
previews. This describes **source completion**, not a deployed quotation
service or authority to issue legally binding customer documents.

## One-batch implementation status

- [x] Editable customer information, 8 line items, pricing/discount totals
  with integer BWP cents, draft save/open UX and explicit conflict handling.
- [x] Server-side validation, company-scoped D1 draft CAS, authenticated
  HTTP boundaries and CSRF-denial contracts, synthetic cross-tenant tests.
- [x] Private R2 logo assets, company-scoped D1 metadata, size/aspect and
  positioning controls, metadata-write acknowledgement and recovery on
  uncertain commits; no public file URLs.
- [x] Web Streams-based PNG-only image sanitizer that decodes PNG pixels,
  recompresses from scratch, drops metadata/animation and enforces byte,
  image-size and expansion bounds. Node-only decoder stays available for
  comparison, **not** as a dependency of the portable composition.
- [x] Isolated, opt-in portable composition for logo upload/settings, draft
  save/reload and two-page PDF previews using an injected PDF engine,
  immutable SHA-256-checked private R2 template and trusted host auth.
- [x] Synthetic full private pipeline with actual pdf-lib, PNG upload,
  D1/R2 round trip, logo placement and branded two-page PDF output.
  Explicit non-issuance, tenant isolation, CSRF denial and no preview writes.
- [x] A source-only GitHub approval watcher on `main` monitors the
  independent D1 execution gate without performing SQL.
- [x] **Local Workers runtime portability:** The PNG sanitizer passed
  synthetic decode, metadata-denial and malformed-image tests inside the
  repository's pinned Miniflare/workerd binary (supported compatibility
  date `2026-09-25`) and Node 22. The test creates no live resources.
- [ ] **Final deployed Workers-runtime qualification:** Re-test the exact
  production/staging Worker bundle, compatibility date, authentication and
  all transitive PDF dependencies in a protected private environment. Local
  sanitizer tests alone do not authorize a Worker deployment.
- [ ] **Authenticated host integration:** The composition must remain
  unmounted until the actual Thebe Desk verified-session/tenant/CSRF
  services are audited and independent reviewers approve the protected
  staging Worker/bindings.
- [ ] **Image type contract:** Only PNG uploads are supported by the
  portable sanitizer. Reject JPEG at HTTP boundary. Do not claim JPEG
  compatibility until a separately reviewed decoder is implemented.
- [ ] **Real template parity:** Corrected Lovely logo-free private PDF binary
  has offline terms/layout checks, but has **not** been uploaded, registered,
  legally accepted or rendered against a live Workers runtime.
- [ ] **Actual private staging data acceptance:** Real D1/R2 integration,
  cross-tenant/CSRF and save/edit/download tests require separately
  approved schema migrations, template registration, and staging access.
- [ ] **Production deployment:** Protected release decision, exact-main
  preflight, recovery plan and `thusico` approval still required.

## Exact protected staging resources

- Cloudflare account: `ddd23cab31928a4bb3d4998df9b26d1d`
- Staging D1: `bw-quotation-staging` UUID
  `aec227e9-b0f2-4b00-8de0-105465c4e2d6`; most recent
  read-only inventory found **no quotation application tables**.
- Private R2: `bw-quotation-logo-private-staging` and
  `bw-quotation-template-private-staging`; no public domains.
- Logo SQL file: `docs/sql/quotation-logo-staging-candidate.sql`,
  Git blob `6d9527d1184603cbaafbf70c999615c8784b7708`.
- Draft SQL file: `docs/sql/quotation-drafts-staging-candidate.sql`,
  Git blob `9aa86a3282d34707b3aa056b8ec1e1f6ccef5ce1`.
- Owner's conditional authorization for both scopes is recorded in issue
  #2504, comment #6916022563. **Independent reviewer `thusico` SQL
  execution approval is still missing** as of this checkpoint.
- These two SQL scripts require separate exact-scope execution acceptance
  after a fresh source, target, empty-schema and recovery/restore preflight.
  Source-code PR review or issue comments about resource provisioning do not
  authorize SQL writes.

## Final PDF and business acceptance

The verified private, logo-free, email-corrected Lovely template has
SHA-256 `72891d473991dc1e0009a6bd417713ce79cce7bf05000d38c24da7d59db15c5f`.
Printed contact email is `lovelystones26@gmail.com`. Do **not** use the
earlier incorrect checksum `bd5a4b...` or the prior pre-email-correction
candidate `99e6ee...`. Page-two wording and positions were checked
privately; this does not substitute for legal sign-off.

Before registering it, the owner must approve the **final print appearance,
top-left logo placement and proportional sizing, company phone/address,
company bank account/payment instructions**, and legal terms and conditions.
The original customer PDF may not be uploaded or treated as blank template.

## Guarded activation order (NO automatic execution)

1. Independent `thusico` approval of both immutable, staging-only SQL
   operations on the exact D1. Recheck current `main`, blobs, read-only
   schema, recovery bookmark and independently accepted restore plan.
2. Carry out only the separately approved D1 schema changes. Verify
   resultant schema, tenant isolation and no production bindings.
3. Obtain separate owner/legal/`thusico` exact-binary template acceptance
   before a private R2 upload or registry entry.
4. Qualify the portable backend against actual `workerd` and the
   authenticated private staging host. Keep all public routes disabled.
5. Test full synthetic customer journey in authenticated private staging,
   then obtain new independent approval for any production deployment.

**Hard stop:** A code-only PR, an affirmative "go", and offline PDF tests
do not authorize D1/R2 writes, staging deployment, public routes, customer
quotation issuance, payment-provider activation or production changes.
