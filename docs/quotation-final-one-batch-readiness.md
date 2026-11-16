# Thebe Desk quotation — consolidated source completion and release gates

**PDF candidate correction after PR #2534 (16 Nov 2026):** Baseline SHA-256 `72891d473991dc1e0009a6bd417713ce79cce7bf05000d38c24da7d59db15c5f` has empty bank placeholders and is superseded as a business-review option. **Candidate A** `18fb41f01fa0b20f501f7de984211a6b4421d452d7fb7a45840578e704d428e1` adds the requested page-one FNB/installation terms while keeping the original page-two footer; **candidate B** `8cdb4bf76230d04b8617f01d9c868ca00c518a2f75e10ed15e8ee1bbf332b87e` proposes a five-office footer. The owner has selected B's **five-location footer wording only**, not approved the full PDF; both candidates remain private and unregistered, with final owner/legal/`thusico` approvals outstanding. Obtain owner/legal acceptance of the exact final two-page PDF (issuer, terms, bank details, office roster and logo), then obtain *separate* `thusico` approval naming the exact private R2 key and SHA before upload. No PDF bytes or account number are stored in this repo.

**Owner-approved quotation footer (16 Nov 2026):** **Mahalapye · Gaborone · Palapye · Maun · Francistown**. Candidate B (SHA-256 `8cdb4bf76230d04b8617f01d9c868ca00c518a2f75e10ed15e8ee1bbf332b87e`) is the approved **footer wording/layout option** only, replacing Serowe/Phikwe on the quotation. Owner approval of the complete PDF, legal issuer, general terms, final print layout and private R2 upload remains **outstanding**. Independent `thusico` exact-binary/key authorization, protected runtime and production permission are still separate and NOT implied. See issue #2504 comment #6929329164.

**Status as of 16 November 2026:** The two exact-blob quotation staging SQL migrations **have been executed and post-verified** in isolated `bw-quotation-staging` (issue #2504 comment #6927692011); **do not re-run them**. The template and runtime remain unapproved/inactive.

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
- [ ] **Actual private staging data acceptance:** The quotation schema is now installed and empty. Real D1/R2 integration, cross-tenant/CSRF and save/edit/download tests still require separately approved template registration, authenticated staging access, and Worker bindings.
- [ ] **Production deployment:** Protected release decision, exact-main
  preflight, recovery plan and `thusico` approval still required.

## Exact protected staging resources

- Cloudflare account: `ddd23cab31928a4bb3d4998df9b26d1d`
- Staging D1: `bw-quotation-staging` UUID
  `aec227e9-b0f2-4b00-8de0-105465c4e2d6`; post-migration read-only inventory confirmed **three empty quotation tables and one index**. No Worker is bound to this D1.
- Private R2: `bw-quotation-logo-private-staging` and
  `bw-quotation-template-private-staging`; no public domains.
- Logo SQL file: `docs/sql/quotation-logo-staging-candidate.sql`,
  Git blob `6d9527d1184603cbaafbf70c999615c8784b7708`.
- Draft SQL file: `docs/sql/quotation-drafts-staging-candidate.sql`,
  Git blob `9aa86a3282d34707b3aa056b8ec1e1f6ccef5ce1`.
- **Completed:** Owner approval #6916022563, independent `thusico` SQL execution approval #6927289181, accepted recovery plan #6927478636, and successful exact-blob DDL execution/post-verification #6927692011. The approved migration was applied **once**. Do not execute it again; schema changes would require an entirely new authorization.
- **Recovery:** Prewrite bookmark `00000016-00000000-00005125-92452344dbaf558c6a51360b2587f816` was recorded, but no restore was performed. A bookmark is not evidence of rollback qualification.

## Final PDF and business acceptance

The superseded, bank-blank logo-free/email-corrected baseline has SHA-256
`72891d473991dc1e0009a6bd417713ce79cce7bf05000d38c24da7d59db15c5f`. Newer review-only candidate hashes appear above; neither is authorized for upload.
Printed contact email is `lovelystones26@gmail.com`. Do **not** use the
earlier incorrect checksum `bd5a4b...` or the prior pre-email-correction
candidate `99e6ee...`. Page-two wording and positions were checked
privately; this does not substitute for legal sign-off.

Before registering it, the owner must approve the **final print appearance,
top-left logo placement and proportional sizing, legal issuer name, company phone/address,
current office/branch footer, company bank account/payment instructions**, and legal terms and conditions. The original terms-page footer mentions Serowe and Phikwe; owner has approved candidate B's replacement list: **Mahalapye, Gaborone, Palapye, Maun, Francistown**. This resolves only the footer list, not legal or template acceptance. The contracting company name must not be silently inferred from the brand name. The exact private file SHA-256 was reverified from actual bytes; it has **not** been approved for upload.
The original customer PDF may not be uploaded or treated as blank template.

## Guarded activation order (NO automatic execution)

1. **Completed:** Owner/`thusico` exact-blob SQL approvals, accepted staging recovery plan and isolated D1 migration with verified empty three-table/one-index schema. **Do not repeat this step.**
2. **Pending:** Obtain separate owner/legal/`thusico` exact-binary acceptance of the corrected logo-free private PDF and approval of the exact private R2 upload/registry key; confirm legal issuer, branch footer, bank/payment instructions and terms before altering the candidate (a change requires a new SHA and review).
3. **Pending:** Qualify the portable backend against actual `workerd` and the authenticated private staging host after distinct Worker/binding approval. Keep all public routes disabled.
4. **Pending:** Test the full synthetic customer journey in protected authenticated private staging, then obtain new independent approval for any production deployment.

**Hard stop:** A code-only PR, an affirmative "go", and offline PDF tests
do not authorize D1/R2 writes, staging deployment, public routes, customer
quotation issuance, payment-provider activation or production changes.
