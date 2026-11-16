# Lovely quotation template — offline technical acceptance evidence

STATUS: technical staging candidate only; not approved for customer delivery or deployment.

## Template under inspection

- Candidate: locally prepared two-page logo-free Lovely quotation PDF.
- SHA-256 (current email-corrected private candidate): 72891d473991dc1e0009a6bd417713ce79cce7bf05000d38c24da7d59db15c5f.
- Page sizes: 612.24 x 858.96 pt and 841.92 x 1190.64 pt.
- Page 1 has blank quotation rows and logo area; page 2 preserves terms below the legacy logo header.
- Terms verification: 775 extracted source words from y >= 180 pt on page 2 retained text and positions during preparation.
- Logo area page 1 (top-left PDF points): x=15..325, y=15..160.
- Logo area page 2 (top-left PDF points): x=10..285, y=10..160.
- Both logo areas had zero extracted text overlaps and zero nonwhite raster fraction in the offline inspection.

## Editable quotation-field inspection

Run on the separately retained PRIVATE candidate PDF:

    python scripts/check_quotation_editable_fields.py /private/path/Lovely_Quotation_Logo_Free_Staging_Template.pdf report.json

Never commit the underlying original/customer PDF, personal information, quotation values or private file bytes to the repository.

This candidate SHA passed 49 of 49 field-clearance checks locally. Checks included blank customer name and contact fields, all eight table rows (including second description lines), unit prices, quantities, line totals, subtotal, discount, optional payment method, and the colored grand-total band.

The renderer covers old quote-number and date placeholders with colored rectangles. The checker refuses any unexpected source words underneath those overlays or any source words extending outside the cover rectangles.

The second description baseline was adjusted to 10pt below the first (rather than 11pt) to clear the horizontal row separator. The PDF renderer fails rather than truncating customer-facing values, and the server independently recomputes totals from integer BWP cents. Bank account/name fields are rejected because they are not yet printed.

## Limitations and blocking gates

1. This candidate is not registered in private R2, approved in the operator template registry, or enabled for customers.
2. Real pdf-lib CI exercises a synthetic background and not this specific private candidate. A real rendering with this candidate is still required after operator and independent reviewer approval.
3. Font parity, red-band contrast, exact customer-facing branding, print quality, phone/email accuracy and the legal wording of all terms require human review. Structural extraction alone is not sufficient.
4. Dedicated quotation D1/R2 resources and authenticated production-compatible runtime remain unavailable. Independent thusico review of the final PR head remains mandatory.
5. No database migration, private upload, public route, payment activation, customer issuance or production deployment was performed.

This is a technical review record, not a release or legal approval.


## Reproduced private source-to-template terms parity (16 Nov 2026 UTC)

A private copy of the original two-page reference was compared with the
retained clean template candidate offline. Neither source nor candidate bytes
were committed to GitHub.

- Source reference SHA-256: `8f4dd38265e9c1d7dc19717d746912eb639aaf99e454d90b4c03871681051823`
- Clean candidate SHA-256: `99e6ee33495f72411e4449f2689852ecf1cc69ab25927552187fb07d6673d025`
- Both files have exactly 2 pages and page dimensions match the expected
  Lovely portrait geometry.
- On both candidate pages, the reserved top-left logo zones contained **zero
  extracted words** and **zero nonwhite raster pixels** during the private
  local inspection.
- Excluding the legacy logo within page 2's reserved header zone, **all 779
  source words matched all 779 candidate words**, including their extracted
  positions (rounded to 0.1 PDF point) below the logo zone. This is structural
  evidence that the terms body was retained, not a legal or visual approval.
- The reference itself is **not** a reusable customer template: its printed
  old logo, prior quotation prices, account details and quote fields must not
  be copied into an issued quote.
- The existing logo-free candidate remains an **operator-controlled, private
  review-only artifact**; it must not be uploaded or served to customers merely
  because these tests pass.

The new `scripts/check_quotation_terms_parity.py` independently reproduces
the comparison on operator-provided local files. Its CI tests use entirely
synthetic PDFs so no original or customer content is committed.

**Additional human approval blockers:** the owner-confirmed contact email is
now corrected in the private candidate to `lovelystones26@gmail.com`;
confirm actual printed/readable placement, verify current bank details rather than
reusing legacy instructions, approve the full terms wording and the final
print-quality logo render on both pages. Keep customer issuing disabled until
explicit authorization; no staging R2 upload or migration is authorized.


## Email-corrected private candidate — checksum and regression evidence

The owner confirmed the complete contact email
`lovelystones26@gmail.com`; the private two-page candidate was updated
on page 1 only, **without editing the original source file**.

- **Current private candidate SHA-256:** `72891d473991dc1e0009a6bd417713ce79cce7bf05000d38c24da7d59db15c5f`.
- Prior clean **pre-email-correction** candidate SHA-256:
  `99e6ee33495f72411e4449f2689852ecf1cc69ab25927552187fb07d6673d025`. This earlier binary must not be uploaded or promoted
  as the corrected template.
- Current candidate page 1 contains the exact verified email string;
  the original truncated token is absent.
- Raster diff between the two clean candidates: page 1 has 258 changed
  pixels, all within x=457..566, y=81..89 PDF-point raster at 72 dpi.
  **Page 2 has zero changed pixels.**
- Source-versus-current-candidate comparison: **779 out of 779 non-logo
  page-two extracted words and their coordinates match** (0.2-point
  tolerance). Both reserved top-left logo regions remain 100% white
  and have no extracted text intersections.
- The current candidate passed **49/49 static quotation editable-field
  checks** with no overlaps or missing total band.
- This checksum supersedes any previously entered unverified checksum
  for the `.com`-corrected private review PDF.

These results do **not** constitute legal terms approval, an approved
production template, private R2 upload authorization or PDF service
deployment authorization. The original client document is not suitable
for reuse. Confirm the final bank instructions, approved branding,
print quality and authenticated synthetic runtime separately.
