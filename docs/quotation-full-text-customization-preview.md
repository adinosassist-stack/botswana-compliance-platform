# Lovely quotation — source-only full-text customization preview

Status: **review-only source module; NOT DEPLOYED, NOT AN APPROVED CONTRACT**.

Available as a named export from public/js/quotation-draft-workspace.mjs:
mountQuotationCustomizablePage(root, {capability, initial}).

The host must supply an authenticated quotation editor capability with
all of enabled, authenticated, canEditQuotations, and
canCustomizeQuotationPreview explicitly true. Nothing mounts it
automatically. No routes, Workers, D1 schema, R2 storage, payments,
customer notifications or production release are changed.

## User-requested behaviour

- Both **Customer name** and **Customer number** are separate, editable
  required fields, displayed on page one directly below the heading.
- Company phone and email are **omitted from page headers**. They occur
  **once, together at the foot of page one**; page two shows only the
  approved five-office location footer.
- The sample item list keeps **Concrete**, **Grout 2kg**, and
  **Labour / Transport** as three distinct entries (nine rows total).
  The editor permits up to twelve rows; quantities, prices and
  discount recalculate in integer Pula cents.
- Every document heading, section label, customer/location field,
  invoice-table heading, banking label/value, footer text, freeform
  note and full page-two terms content can be edited. The
  company logo can be uploaded locally and sized/positioned.
- Preview output is two pages. **Print / Save PDF** uses the local
  browser print dialog; JSON export is a deliberate local action.
  No customer data is sent to any service by this module.

## Approval and privacy contract

The current SHA-pinned Lovely two-page PDF candidate B:
8cdb4bf76230d04b8617f01d9c868ca00c518a2f75e10ed15e8ee1bbf332b87e

This private PDF has **not** been modified or silently replaced. The
existing server PDF path (server/quotation-draft-lovely-pdf.mjs) remains
separately gated and uses the previous eight-row reviewed background.
This new browser-only module does **not** claim its own print layout is
pixel-identical to that approved background.

**No bank-account number or disputed contractual language is
hardcoded into this source.** The operator must supply the exact
existing terms for the full-text editor; the default is conspicuously
marked as a non-customer demo. The user's established terms must not
be silently changed. A business/legal review of any edited terms,
exact-output visual acceptance and a new SHA are needed before issuance.

Do not mount this editor in production, migrate an existing D1 table,
upload the private PDF, or enable quotation issuance from this PR.
Actual stage qualification still requires an authorized private
Worker, session/tenant/CSRF boundary, isolated synthetic data and
independent thusico review of the exact revision.

## Checks

Run: node --test tests/quotation-customizable-page-model.test.mjs

In the isolated Playwright workflow, also run:
node --test tests/quotation-customizable-page-browser.test.mjs

The dedicated Quotation Real Browser Acceptance workflow executes both
and retains the existing original draft-form Chromium checks.
