# Thebe Desk AI document exports — implementation contract

Status: SPECIFICATION ONLY. No working export endpoint or production activation is claimed.

## Product
In authenticated AI Dock, offer a single Export control after generated responses: Word (.docx), PDF (.pdf), PowerPoint (.pptx). Users request reports, letters, research, proposals, and presentations in normal conversation; do not add preset question buttons. Preserve original text and citations. Offer progress, cancel, retry and a download when ready.

## Output fidelity
Render genuine editable DOCX and PPTX, and PDF with selectable text. Include Thebe Desk or tenant branding, headings, tables, page numbers, references, and layouts suited to the document type. PPTX slides should contain editable text/shapes with 16:9 layout and overflow checks. Formal letters need recipient/date/subject/signature fields. Research must retain source links and retrieval dates, never fabricate citations. Support Botswana pula, Unicode and locale-specific formatting.

## Trusted API and worker
Proposed POST /api/ai/exports {conversationId,messageId,format,documentType,options} -> tenant-scoped job ID. GET /api/ai/exports/:id -> status. GET /api/ai/exports/:id/download -> authorized, short-lived attachment. The server, not the client, resolves identity and tenant; bind immutable message/content hash, format and options to the job. Use idempotency and bounded background rendering, not long-running synchronous HTTP. Store results privately with expiration and deletion.

## Security
Default-off flag. Authenticate every status and download request; reject cross-tenant access. Limit sizes, pages, slides, quotas and render duration. Sanitize filenames and links; escape untrusted HTML and prevent external network/template fetches. Restrict and scan embedded attachments. Audit export requests and downloads without logging document content. Correct MIME and Content-Disposition headers; never expose a public storage URL.

## Acceptance criteria
1. DOCX opens editable in Word/LibreOffice; PPTX opens editable in PowerPoint/LibreOffice; PDF text is selectable.
2. Citations survive research exports and unknown sources are disclosed.
3. Tenant isolation, expired links, malformed options, injection, remote fetch attempts, quotas and file retention are tested.
4. Keyboard/mobile accessible Export UI and reliable failed-job retry.
5. Large tables, long text, Unicode, pula currency, page breaks and slide overflow pass visual QA.
6. Exact-head CI, independent security review, deployment and rollback evidence precede activation.

No employee autonomous workflow, regulatory filing, payroll or external messaging permissions are granted by document export.
