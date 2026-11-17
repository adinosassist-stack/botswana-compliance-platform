# Full Lovely PDF/Logo private Worker — source-only bundle qualification

This batch provides a **separate offline-buildable candidate** with pdf-lib@1.17.1, a new manifest with workers_dev/preview_urls disabled and no routes, and static security checks. The existing draft-only Worker manifest is unchanged. The owner has frozen the current two-page layout and terms; this change does **not** edit the PDF.

The adapter `server/quotation-full-pdf-worker-entry.mjs` supplies the Workers-compatible PDFDocument API to the pre-existing full PDF/logo integration without trusting a purported function from Cloudflare configuration. The CI installs pinned pdf-lib specifically for the **offline bundle rehearsal**, then runs Wrangler with `--dry-run`. This is not a production dependency lock or approved deployable artifact. Before an actual release, add it to the reproducible reviewed release lockfile, independently attest the exact bundle hash, and rerun source/lockfile security checks. Check any compatibility warnings; a green bundle build is not a live PDF render.

Mandatory gates still outstanding:
- Validate exact two-page PDF candidate bytes, SHA-256, company issuer, payment instructions and contractual protections; legally required review is not replaced by owner design freeze.
- Register a verified private tenant-scoped R2 template object (never put bank data in GitHub); confirm logo-free zone and exact template geometry.
- Review actual stage-only private invoker, credentials, session/tenant/CSRF, R2 and D1 binding identity, execution gate and tested recovery.
- Run genuine authenticated synthetic staging save/reopen/PDF/negative tests; no public routes.
- Separate exact-main production authorization from owner and independent thusico.

The historical Work Mode Create Worker Version block remains in effect for the **denied** caller and Workflow harness operation. Do not use this new manifest to bypass it or to upload/deploy any Worker without separate approved operational scope.

This PR creates **no Cloudflare resources, sessions, D1 rows, R2 objects, Worker versions, external URLs or customer quotations**.
