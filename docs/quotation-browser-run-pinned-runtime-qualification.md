# Quotation private Browser Run — runtime dependency acceptance

**Review-only; no Cloudflare upload, Worker activation, customer document issuance or paid Browser Run session is authorized.**

- Final Lovely quotation HTML/PDF source and private preview host were merged through #2610.
- The existing source-only Wrangler manifest declares `browser.binding=QUOTATION_BROWSER`, `nodejs_compat`, compatibility date `2026-11-17`, no routes, and disabled worker/preview URLs.
- Cloudflare's April 2026 Playwright documentation names `@cloudflare/playwright` **v1.3.0** as the Browser Run Workers client and requires `nodejs_compat` plus a compatibility date no earlier than `2025-09-15`: https://developers.cloudflare.com/browser-run/playwright/
- **Do not edit the application's large root package-lock by hand.** The independent workflow `.github/workflows/quotation-browser-run-dependency.yml` generates a temporary isolated npm project, installs **exactly v1.3.0**, verifies resolved registry metadata and SHA-512 integrity, and retains a 14-day lock artifact for separate inspection/promotion. This is evidence only; it does not vendor or install the client into the production build.
- Before actual deployment, a separate reviewed PR must integrate this verified lock and Cloudflare runtime import, confirm bundle tests on the reviewed exact SHA, verify Browser Run account eligibility/quotas/cost and an internal-only invocation route, and obtain distinct owner + independent `thusico` operational approval.
- Browser Run is billed for sessions according to Cloudflare's published plan and concurrency model: https://developers.cloudflare.com/browser-run/pricing/. Never invoke a browser in these source checks.
- The logo staging R2 is currently empty; actual Lovely PNG/logo visual acceptance, D1 synthetic save/reopen, tenant/CSRF negative tests, and restore verification remain pending.

**Current boundary:** Source test passing is not proof of an active Browser Run binding or a real private staged service. No service version creation, public DNS, customer data or production permissions are included.
