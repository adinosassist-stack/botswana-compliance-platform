# Lovely quotation template — offline technical acceptance evidence

STATUS: technical staging candidate only; not approved for customer delivery or deployment.

## Template under inspection

- Candidate: locally prepared two-page logo-free Lovely quotation PDF.
- SHA-256: 99e6ee33495f72411e4449f2689852ecf1cc69ab25927552187fb07d6673d025.
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
