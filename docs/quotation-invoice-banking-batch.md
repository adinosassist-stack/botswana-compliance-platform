# Consolidated quotation, invoice and company banking source batch

Tracks #2735 and #2670. Extends existing PR #2886 rather than opening fragmented feature PRs. Based on protected main `25de56831807069952f453b6f32fdab2302dc45a`.

## Observable behavior

- The existing owner-only customer-ready editor can mount the commercial workspace when `QUOTATION_COMMERCIAL_ENABLED=true`. The existing tenant/session/onboarding boundary and preview remain intact. Flag defaults OFF.
- Company Settings saves bank name, account holder, account number (leading zeros preserved), branch, optional code and payment reference in tenant-scoped D1. Account number is masked until explicitly revealed. New quotations fetch defaults from the server; editing a document never saves defaults implicitly.
- Draft quotation save, list, open, revision-as-new-draft and revision conflict handling. Drafts use `DRAFT`, with server-assigned `QT-` numbers only on explicit issuance. Issued copies, including banking and terms, are immutable at the SQL boundary.
- Quote-to-invoice conversion requires an issued tenant-owned quotation and explicit active Finance customer/due date. Concurrent retries return one invoice draft. Invoice issuance allocates an `INV-` number and inserts a canonical Finance invoice in the same transaction as freezing the snapshot and audit event. Finance IDs are generated server-side; no payment allocation or funds confirmation occurs.
- Deposit and instalment commitments persist with the draft and issued snapshot. They do not represent money received. Existing canonical Finance allocations remain the authority for outstanding balances and invoice lifecycle; the prior lifecycle projection work in #2886 is preserved.
- Normal customer controls hide JSON import/export, sample reset and manual saved-file selection. Saved immutable documents can prepare, download and natively share the actual PDF. File preparation precedes a separate Share tap, retaining Android user activation. Unsupported native share falls back to downloading and attaching in WhatsApp.
- Reuses the existing Lovely red/black two-page HTML renderer, terms, locations and integer-thebe validation. The private renderer rejects clipping, non-A4 output and anything other than two pages; it aborts network requests. Preview watermark defaults remain unchanged; customer-ready snapshots can render without a watermark.

## Activation and evidence boundaries

This PR is source preparation only. `docs/sql/quotation-commercial-workflow-CANDIDATE.sql` is a proposed schema, not an applied migration. No staging/production data, secret, infrastructure, route activation, payment or deployment has been changed. The private `QUOTATION_PDF_RENDERER` service binding is required for direct PDF bytes. Its injected renderer implementation is included; no service has been provisioned or bound. Missing schema or renderer fails closed. Existing browser printing remains available.

Banking and commercial records use dedicated tenant-scoped tables because generic app-state writes can overwrite arbitrary owner/manager state and cannot enforce immutable issued snapshots. Company settings UX lives in the authenticated quotation workspace. No bank credentials or payment-provider integration is introduced.

The existing logo editor remains local-preview only; this batch does not activate private company-logo persistence. Direct PDF uses the saved textual company branding. A locally uploaded logo is not silently treated as a saved logo or embedded in the server snapshot. Qualified persistent company-logo integration remains separate under #2672.

## Verification

- Disposable real local Miniflare D1: banking save/new-session read, leading zeros, stale/concurrent edits, tenant/role/CSRF/Origin denial, audit cardinality, draft reload, concurrent numbering and issuance replay, database-level immutability, idempotent conversion, Finance insertion once, transaction rollback/retry against the existing Finance migration and its tenant/customer triggers, concurrent distinct-document numbering, account-erasure cascades, forged payment schedule and malformed/oversized payload rejection, PDF boundary denial.
- Existing quotation model, HTTP/storage/bridge, renderer, payment schedule, invoice transaction, file-share and Finance lifecycle regressions.
- Real Chromium journey passed on source `2df95e7f4ef91fff18ddc233bdb046d39711d182` ([run 45902726739](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/45902726739)): 375px/320px, separate contexts sharing only authenticated server state, banking autofill, quote save/open/issue, actual two-page A4 renderer, download, direct-gesture file-only sharing, invoice conversion/issue and overflow check. Browser share is intercepted to prove payload/gesture; it does not prove WhatsApp delivery.
- Local Chromium execution was blocked by a missing browser binary; attempted browser download returned network 403/400. The dedicated PR workflow runs the browser journey in a pinned Playwright container and supplied the passing evidence above. The final revision also reruns a 320/375/414/430/768px, landscape and 200%-equivalent reflow matrix; native device zoom remains unverified. The legacy print fixture now serves the file-share module imported by the editor, so its existing print assertions can execute instead of failing at module loading.

Independent `thusico` review, exact-head CI, BF-07 qualification, separately approved schema/service activation, authenticated hosted acceptance and physical Android WhatsApp attachment acceptance remain required. Production deployment needs separate owner approval.

## Approved notification design and movable pill

The shared workspace notification centre follows the owner's approved compact
design: attention/upcoming groups, readable job and branch details, separate date
and urgency labels, Unread/All filters, and individual/bulk read actions. Read
actions never complete delivery or installation jobs. The notification pill can
be dragged on desktop, tablet and mobile; saved device coordinates survive
reload, stay within the viewport, avoid the visible AI pill and reserve the
mobile navigation lane. Taps open the panel; dragging does not. Alt+arrows move
the pill and Alt+Home resets it.

Read acknowledgements persist on the same browser, isolated by signed-in user,
tenant and selected company. Only SHA-256 acknowledgement/scope digests are
stored locally, bounded to 500 entries per scope; no job details or credentials
are cached. This is not cross-device synchronization. If browser storage is
unavailable, the read action works for that visit and reports the limitation.
Rescheduled jobs or a new source report require a new acknowledgement.

Local verification: 47 notification, Daily Reports, persistence, controls and
mobile integration tests pass; the 534-check bundle budget passes. Chromium
acceptance is included in Workspace UI batch CI, covering the real workspace
sidebar cascade, desktop pointer dragging, responsive touch targets and read
persistence. Local browser execution remains unavailable; do not classify the
new head's Chromium or physical Android checks as passed without fresh evidence.
These changes remain in the same source PR; no production deployment occurs.
