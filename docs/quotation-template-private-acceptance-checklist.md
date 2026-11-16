# Lovely quotation — private two-page template release gates

**Status: OFFLINE REVIEW ONLY.** This document is not owner, legal, reviewer,
migration, template-upload, Worker-binding or production activation approval.
It does not authorize any Cloudflare writes.

## Immutable private review artifacts

| Item | SHA-256 | Usage |
| --- | --- | --- |
| Owner-supplied original PDF | `8f4dd38265e9c1d7dc19717d746912eb639aaf99e454d90b4c03871681051823` | Comparison reference only; contains legacy quotation/customer and payment details |
| Original logo-free candidate | `99e6ee33495f72411e4449f2689852ecf1cc69ab25927552187fb07d6673d025` | Superseded; had incomplete email |
| Corrected logo-free candidate | `72891d473991dc1e0009a6bd417713ce79cce7bf05000d38c24da7d59db15c5f` | Current **private** review candidate, not approved/uploaded |

The complete owner-confirmed contact address in the corrected PDF is
`lovelystones26@gmail.com`. An earlier checksum (`bd5a4b2897...`)
published during preparation was erroneous; **never use that checksum**.

## Technical acceptance already reproduced offline

- [x] Exactly two original/candidate pages and expected Lovely page sizes
- [x] Page-two terms text and positions match (779/779 words outside the
  removed logo zone, including the heading; equivalently 775 words below
  y=180 pt, excluding the heading)
- [x] Both logo zones are fully white and free of extracted text
- [x] All 49 editable-field clearance checks passed on the corrected candidate
- [x] The only difference from the previous clean candidate is the email
  correction: at 72 dpi, 258 changed page-one pixels within the email area,
  no other page-one changes and zero changed page-two pixels
- [x] Offline synthetic regression suite checks edited terms, shifted words,
  graphic contamination, template geometry, and incomplete email rejection
- [ ] Real Workers-compatible PDF engine renders the SHA-pinned candidate and
  preserves all terms, two pages and logo positions — **NOT YET VERIFIED**
- [ ] Current authenticated private staging passes real upload/save/reload,
  CSRF-denial and cross-tenant isolation — **NOT YET VERIFIED**

To reproduce privately, on a workstation with the source and both clean
candidate PDFs, run:

```bash
python scripts/check_quotation_terms_parity.py PRIVATE_ORIGINAL.pdf PRIVATE_EMAIL_CORRECTED.pdf
python scripts/check_quotation_editable_fields.py PRIVATE_EMAIL_CORRECTED.pdf
python scripts/check_quotation_email_change_scope.py PRIVATE_PREVIOUS_CLEAN.pdf PRIVATE_EMAIL_CORRECTED.pdf
```

These scripts are offline/no-network and return only checksums, counts,
positions and boolean checks, not source text. Synthetic CI does **not** ship
customer PDFs or grant template approval.

## Required human decisions (all pending)

- [ ] Owner accepts final **two-page appearance**: red/charcoal/white layout,
  mobile-safe display, margins, print quality, customer table, total bands,
  footer, and exact Lovely typography
- [ ] Owner accepts top-left company logo on both pages, including proportional
  width/height limits and drag/resize behavior without overlaps
- [ ] Owner verifies phone **+267 74 583 606**, email and all public
  company/location information against current approved business records
- [ ] Owner verifies payment method, company bank account and branch details
  separately; legacy original PDF banking fields may **not** be assumed valid
- [ ] Legal reviewer approves all general terms, cancellation/refund clauses,
  installation obligations, timelines, customer declaration and Botswana
  commercial compliance in the complete corrected PDF
- [ ] Owner and independent `thusico` accept the **exact current corrected
  PDF hash**, naming the file/version in a new approval for **private staging
  template registration/upload**; code PR approval does not count
- [ ] Quotation-specific staging Worker runtime, private bindings, security
  authorization and recovery plan separately accepted
- [ ] Later customer-facing quotation issuance and production deployment
  authorized independently after exact-main qualification

## Database and staging separation

- Provisioned but unbound D1: `bw-quotation-staging`,
  UUID `aec227e9-b0f2-4b00-8de0-105465c4e2d6`
- R2: `bw-quotation-logo-private-staging` and
  `bw-quotation-template-private-staging`, with public `r2.dev`
  disabled and no public custom domains at last read-only check
- Latest available D1 resource metadata reported zero application tables.
  Reverify immediately before any separately approved migration; current
  metadata alone is neither an executable recovery plan nor SQL authorization.
- Logo SQL and draft SQL are **two separate** candidate migrations, requiring
  fresh exact-blob owner approval and independent `thusico` execution
  authorization for each. A source-only PR merge does not satisfy either gate.

**Hard stop:** no template upload, D1 mutation, Worker binding/deployment,
public route, customer data import, quotation issuance, payment modification,
or production activation without these separate approvals.

## Workers-runtime dependency qualification (source-only, 16 Nov 2026)

The quotation template provider now verifies private SHA-256 bytes with the
standard `crypto.subtle.digest("SHA-256", ...)`, and the private logo asset
adapter creates cryptographically random object IDs using
`crypto.randomUUID()`. These operations no longer require `node:crypto`.

The isolated Node 22 tests and the real `pdf-lib@1.17.1` acceptance workflow
are required to run again whenever these modules change. This is an initial
portability improvement; it does **not** qualify a full Cloudflare Worker
deployment. In particular:

- [x] The immutable private template integrity check is implemented using
  Web Crypto, including bounded R2 byte reads and hash mismatch denial.
- [x] Company-isolated logo asset IDs use secure Web Crypto randomness.
- [ ] The current PNG sanitizer still imports `node:zlib`. A dedicated,
  independently audited Workers-compatible image decoder/normalizer must
  enforce decompression, dimensions, image type, size and anti-malware guards.
  Do **not** import the Node sanitizer into the production Worker.
- [ ] The actual Worker build must prove its PDF engine and all transitive
  dependencies are compatible with its installed runtime.
- [ ] The real production session/CSRF/tenant pipeline must be independently
  bridged and verified against isolated synthetic tenants.
- [ ] The dedicated D1 migration and R2 template registration require separate
  explicit write authorizations; no code review grants them.
- [ ] No Worker route, preview URL, `workers.dev` exposure, or production
  quotation activation may be enabled from this source-only work.

These conditions are mandatory even if all offline PDF tests pass.
