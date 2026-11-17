# Thebe Desk final Lovely quotation — Browser Run private rendering bridge

**Status:** SOURCE-ONLY / NO OPERATIONAL AUTHORIZATION. Final HTML quotation design stays frozen. This is a *candidate integration boundary*, not a staging deployment, customer PDF endpoint, or permission to copy customer records.

## Decision

Use **Cloudflare Browser Run (managed remote Chromium)** from a private Worker service binding to produce the PDF. Standard Workers cannot instantiate local Chromium; Browser Run supplies the browser instance. The bridge in `server/quotation-final-html-browser-run.mjs` injects the authorized Browser Run client launch function into the previously approved `renderLovelyFinalQuotationPrivatePdf` adapter, maintaining the two-A4-page layout and overflow guards.

Cloudflare documentation, checked 17 November 2026:
- https://developers.cloudflare.com/browser-run/playwright/
- https://developers.cloudflare.com/browser-run/reference/wrangler/
- https://developers.cloudflare.com/browser-run/how-to/pdf-generation/
- https://developers.cloudflare.com/browser-run/limits/index.md

### Proposed source wiring — not a deployable entrypoint

A separately reviewed, **internal-only** Worker adapter would:
1. Load `@cloudflare/playwright` at an independently pinned, reviewed version and declare a **private Browser Run binding** (e.g. `QUOTATION_BROWSER`), `nodejs_compat`, and compatibility date **no earlier than 2025-09-15**. Cloudflare Playwright launch pattern: `await chromium.launch(env.QUOTATION_BROWSER)`. Do **not** pass the user's browser URL, template URL, or external image URL. The generated HTML is a local, escaped document.
2. Obtain the actor, tenant, active role and CSRF evidence **only from the verified staging D1 session / trusted host**. The source functions in the bridge accept callbacks solely from the host, not from a client request.
3. Set `verifyPrivateMutation` to a *host-verified request-bound* CSRF check; do not accept a boolean directly from the browser.
4. Read the logo through isolated tenant-scoped R2/D1 only after auth, then sanitize PNG bytes.
5. Use `renderLovelyFinalHtmlWithBrowserRun({actor,companyId,draft,authority,verifyPrivateMutation,browserBinding:env.QUOTATION_BROWSER,launchBrowser:binding=>chromium.launch(binding),pdfLib,logoSource})`. The bridge always closes its remote browser session and the lower adapter closes the page.
6. Keep `workers_dev:false`, `preview_urls:false`, `routes:[]`. Test access via a separately qualified and independently reviewed **internal service binding**, never a temporary public URL or unverified header.

### Release gates still outstanding

- [x] Final HTML template identity fixed and legacy Candidate B disabled (PR #2604)
- [x] HTML two-page print renderer (PR #2605)
- [x] Real Chromium 2-page/overflow acceptance (PR #2606)
- [x] Private PDF adapter and tenant gate (PR #2607)
- [x] Private sanitized PNG logo path in source (PR #2608)
- [ ] Browser Run bridge reviewed and merged (this PR; no deployment)
- [ ] Independent reviewer acceptance of real staging Browser Run binding, package lock, compatibility date, egress/no external asset policy, service binding and cost/quota
- [ ] Real company PNG object provisioned privately and visually verified on both pages; current logo R2 is empty
- [ ] Real session/CSRF host wiring, isolated D1/R2/Browser Run acceptance and repeatable recovery proof
- [ ] Distinct stage-operation approval and later distinct customer-facing production authorization

**No Cloudflare resources are modified by this proposal.** Browser Run can incur charges; inspect account eligibility, session limits and pricing before the first operational call. Do not reuse approval for version-only Worker uploads or old Candidate B template registry, and do not bypass any previously denied write operation.
