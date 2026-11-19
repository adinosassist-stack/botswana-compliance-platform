# Company-logo upload: protected, default-off integration (#2672)

**Intent:** Let a signed-in business owner or qualified manager upload, save, reload, resize and replace their company logo across sessions. Existing private quotation logo code is reused; no company content or files enter GitHub.

## Source-only design

- New page: `/app/settings/company-logo/` (feature-gated). It authenticates via the already-deployed first-party `/__thebe_api/auth/me` session endpoint. The page contains no user data, credentials or embedded CSRF tokens.
- Existing `public/js/quotation-logo-editor.mjs` and `quotation-logo-api-client.mjs` provide image selection, layout, bounded transport and private reload. PNG/JPEG/WebP are browser-rasterized to safe PNG before upload; the Worker independently decodes/sanitizes image bytes.
- Production wrapper `cloudflare/src/production-entry.js` calls the new `company-logo-settings.js` gateway only for the three allowlisted logo API paths and page path. The gateway revalidates identity using an internal authenticated core request. It **derives company ID from verified session**, not from URL, request body or browser-supplied role.
- Owners and ordinary managers may edit; separate branch-scoped manager landing paths, unauthenticated sessions, auditors and staff are denied. Mutation requires exact request origin, active CSRF token, production rate-limiter binding, and existing user role/membership.
- Private object key prefix: `quotation-logos/{tenantId}/{opaqueId}`. The existing D1/R2 store checks tenant and asset IDs on every retrieval/update. No public R2 URL and no open upload endpoint.
- `THEBE_COMPANY_LOGO_ENABLED = "false"` in production config, no `COMPANY_LOGOS` binding added. A source merge will not activate the feature; the gateway returns 404 until separately qualified.
- The previously discussed customer-facing Lovely HTML preview remains unchanged. The new page is an optional authenticated company settings route, not a replacement for its PDF contract or red design. PDF-preview action in the logo editor is disabled until independently qualified.
- Reuse `quotation_logo_assets` and `quotation_logo_settings` for persisted company logos. The additive candidate SQL is `cloudflare/migrations/20261119_company_logo_private_storage.sql`. It has tenant foreign keys, composite tenant+asset reference and strict object key. **Do not execute from a PR or without separate staging SQL authority.**

## Required independent gates before users can upload on the live site

1. **Code:** independent `thusico` approval on exact PR head, all required checks and synthetic multi-tenant D1/R2/client tests, source/bundle inspection and protected merge.
2. **Staging storage:** explicitly approved isolated staging D1 and dedicated private R2 bucket; add/rehearse schema *only there* with a known Time Travel bookmark and actual rollback proof. Verify no public routes, no production DB references and no customer data. Existing quotation synthetic private harness is not automatic authorization.
3. **Authenticated staging:** bind dedicated R2 `COMPANY_LOGOS` with read/write only as needed, app origin and session verification, rate limiting, CSRF, owner/manager roles, replacement/readback and tenant-B negative tests. Exercise actual Browser PNG/JPEG/WebP and mobile access, test invalid/oversized/palette/animated files, missing bucket/keys, service failures, logout/revocation and rotation.
4. **Production migration:** **separate** owner and independent `thusico` approval bound to fresh exact SHA, SQL blob checksum, production D1 UUID `8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce`, recoverable bookmark and reviewed rollback/retention plan. Never apply migration blindly; first inspect existing schema objects.
5. **Production R2:** provision a dedicated private bucket after explicit approval, no public access, CORS or workers.dev routes, and separately review the binding addition. Do not reuse evidence buckets or a synthetic staging bucket.
6. **Release and activation:** protected BF-07 exact-source release, post-deploy verification default-off, separate owner+independent feature-activation approval, then authenticated live test with a consented test company and immediate rollback gate.
7. **User access:** add the logo settings link to the Business / Settings navigation after protected UX review. The direct feature-gated URL alone is not a discoverable product rollout. Finalize replace/remove retention and user data deletion behavior.

## Present limitations

This PR supplies the working, testable **source integration only**. There is no R2 storage binding in production and no logo tables in production D1. It is **not yet live**, does not migrate D1, provision R2, deploy code or switch flags. Do not claim customers can persist company logos until live authentication and reload prove it.
