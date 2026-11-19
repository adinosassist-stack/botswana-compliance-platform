# Company logo upload — audited limitation and staged fix

## User-visible problem (18 Nov 2026)

The quotation preview page `/app/quotations/preview/` is an owner-only, configured-tenant HTML print editor that accepts a local image object URL. It does **not** persist logos to business settings, company D1, or R2; switching browser, reloading, importing JSON or signing out drops the attachment. Therefore a logo appearing on a printed quote is **not** proof that a company-logo upload succeeded.

The separate `public/js/quotation-logo-api-client.mjs`, `server/quotation-logo-http.mjs` and `server/quotation-logo-d1-r2-store.mjs` form an authenticated, company-scoped upload/save/reopen design, but the live `cloudflare/src/production-entry.js` does not register it. The private portable staging implementation only accepts sanitized PNG; previous client code sent JPG unchanged despite advertising JPG as a valid input. WebP conversion existed but required supported browser canvas APIs.

## Changes in this PR

- Convert JPG and WebP to PNG **in the authenticated client before transport**; the server still decodes, sanitizes, checks dimensions/MIME/byte caps, CSRF and tenant authorization.
- Reject unsupported or oversized converted logo, and preserve the existing content-size limit of 2 MiB. No SVG or data URL upload.
- Make the preview's local logo selector discoverable, support PNG/JPG/WebP, verify that images decode before replacing an existing logo, and refuse invalid dimensions.
- Accurately label that this preview-only action **does not upload or save to business account**. Preserve the quotation layout, red headings, terms and two A4 pages.
- Add synthetic client tests and real Chromium local-logo acceptance.

## Separate, required work to enable real per-user uploads

1. Authenticate the logged-in business and derive **tenant/companyId on server**; never trust a client-supplied ID or a static preview tenant. Define owner/admin/authorized manager edit permission; allow permitted staff read only.
2. Provision an isolated **private** quotation-logo R2 binding and D1 logo asset/settings schema, tenant-scoped object keys and scoped role + CSRF checks. Document retention/removal and reject cross-tenant reads/writes, spoofed roles, corrupted files and foreign logo references.
3. Mount the already-tested portable logo HTTP service behind a verified host session and existing authorization; do not expose private synthetic endpoints or internal headers as public authentication.
4. Test real PNG, JPG and WebP paths (browser normalize to PNG; server re-rasterizes), reload from a second session, use on two-page PDFs, deny oversized and decompression-bomb input, prove logout/revocation, expired sessions and cross-tenant IDOR.
5. Qualify isolated staging D1/R2, exact-source checksums, backup/recovery, CI/browser acceptance, independent `thusico` PR and protected staging approval before any private deployment. Production activation needs separate protected exact-main approval. New files and app flags must remain disabled by default until acceptance.

**This PR is a format/preview reliability fix, not real storage activation.** No production Cloudflare settings, D1/R2 migrations, Worker deploy, live route or bank/payment change is authorized or performed.
