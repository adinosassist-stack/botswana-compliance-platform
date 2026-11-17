# Final Lovely quotation — exact private staging bindings and logo source
**17 Nov 2026 | Source-only review. No deployment authorization.**

## Current verified boundary
- Owner-selected editable HTML: `Thebe_Desk_Lovely_Quotation_Customer_Details_Editable.html`, SHA-256 `c57be4e21c126dc318c0caafc17c04cdee50099e130db2f1796f2d93cc982449`. **Do not substitute Candidate B PDF.**
- The HTML embeds a single PNG logo showing the red italic **Lovely** wordmark, 670×370 pixels, RGBA. Extracted PNG SHA-256 `36439e3c7f3e8feaedb31347367c0bfd57f2516f8afde85fbec4c7bb3dfca610`, 98,004 bytes. PNG contains only IHDR, IDAT, IEND chunks and passes preliminary format/dimension inspection. No logo bytes have been committed to the GitHub repository or uploaded to Cloudflare.
- Cloudflare read-only preflight: `bw-quotation-final-html-private-staging` is **not yet a created Worker** (GET versions/deployments/subdomain returned 404); existing `bw-quotation-auth-private-staging` has one inert version, zero deployments, disabled worker/preview URLs; both `bw-quotation-logo-private-staging` and `bw-quotation-template-private-staging` have zero objects.
- The confirmed final HTML print renderer is not the old fixed background PDF. Render exactly two A4 pages with all nine default lines, including separate Concrete and Grout 2kg, editable customer name/phone and full terms.

## Verified-resource source-only composition
`server/quotation-final-html-staging-bindings.mjs` composes existing staging D1 HMAC-session verifier, active-membership/CSRF checker, quotation draft D1 store, private logo D1/R2 adapter and Browser Run PDF renderer into the previously reviewed `createFinalLovelyPrivatePdfPreviewHost`. The default Worker `fetch` continues to return only 404.

Before construction, the **protected operator must independently establish** all of the following:
1. Exact source SHA on the current reviewed main commit; separate owner and `thusico` authorization for **this specific staging operation**, not old Worker versions or B PDF.
2. Cloudflare account `ddd23cab31928a4bb3d4998df9b26d1d`; isolated D1 AUTH `d7ad8e99-2ee4-446c-9358-0e186031571d`, QUOTE `aec227e9-b0f2-4b00-8de0-105465c4e2d6`; private logo bucket `bw-quotation-logo-private-staging`; newly approved Worker `bw-quotation-final-html-private-staging`. No production references.
3. Real Browser Run binding and account plan eligibility/cost accepted; bound in an approved, isolated version; no billable browser launch during preflight.
4. Distinct private session HMAC and internal service-caller secrets. Never put secrets, real customers or production sessions in a GitHub issue or public Git logs.
5. Real active **synthetic tenant UUID**, approved private invocation via a trusted service-binding/RPC interface (header secret alone is insufficient on a public route), independent recovery/cleanup acceptance. **The named factory is not yet remotely callable via Cloudflare RPC or fetch; default `fetch` is intentionally 404.**
6. Approved tenant-scoped private logo registration using the verified exact embedded PNG, with actual visually inspected two-page PDF, and written go/no-go for missing or changed logo SHA.

## Mandatory staging acceptance before any customer access
- Real authenticated synthetic invitation/login/active membership, correctly scoped tenant and CSRF; prove anonymity/staff/wrong tenant/invalid CSRF denial.
- Create/save/reopen/edit 9–12 quotation items with unchanged full terms and BWP totals; require matching optimistic revision.
- Print actual two-page A4 PDF with the verified Lovely PNG wordmark on **both** pages and no clipped legal text.
- Prove private R2 and D1 access boundaries, request size limits, no unapproved public URL or preview URL, and exercised synthetic rollback/recovery with redacted evidence.
- Distinct production release review; **no** production or public activation as part of staging preparation.

This checklist is *not* itself authority for resource creation, version upload, deployment, Browser Run spending, logo upload or customer quotation issuance.
