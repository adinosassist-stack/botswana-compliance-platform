# Essentials: customer-only quotation review and explicit acceptance boundary

**UNMOUNTED SOURCE ONLY. NOT A WORKING CUSTOMER PORTAL, SIGNED ACCEPTANCE, LIVE CUSTOMER LOGIN, OR DEPLOYMENT.**

## Security objective

The earlier `__Host-thebe-consent` employee/tenant-actor boundary is **not evidence of an outside customer's agreement**. PR #2709 created a separate customer-authenticated session candidate. This change introduces a separate unmounted review and explicit acceptance **request boundary** that uses **only** `__Host-thebe-customer`, not employee roles or cookies.

### Customer review (authenticated GET)

A trusted, separately authorized, customer-only host calls `prepareCustomerReview({request,quotationId})` for the exact HTTPS URL `/private/customer/quotations/{quotationId}/review`, without query strings or fragments.

The service hashes the opaque customer cookie, requires a current, ownership-checked session with `role:customer` scoped to that exact quotation, and independently loads the **server-authoritative frozen quote bytes AND full contractual terms bytes**. It recomputes SHA-256 for both and verifies quotation/customer/tenant, version, total minor units and state. It invokes a host-owned `recordCustomerReviewOffered` to create a short-lived, customer-session-bound **presentation offer** for that exact quote digest, terms digest, total and version; then returns the exact bytes to **trusted server code only** for private no-store rendering. A GET or a presentation-offer record is **not proof the customer read anything** and must never count as consent.

**Important data dependency:** The current frozen-quote SQL authority contains immutable quotation bytes and hash, but **does not separately contain an immutable full-terms snapshot and digest**. The injected `loadFrozenCustomerQuote` must supply a separately approved immutable terms source, pinned to this quotation/version. Until this source and its SQL authority are qualified, do **not** mount the host or assert that full contract terms are available. The presentation offer persistence/lookup callbacks also remain unimplemented here, and cannot be mocked for operational staging.

### Explicit customer acceptance (separate POST)

Only after that customer review has been offered may the trusted host call `validateExplicitCustomerAcceptance({request,quotationId})` for `/private/customer/quotations/{quotationId}/accept`. This requires:

- The **customer-only** secure cookie, a still-current customer/session/account/quotation and independently checked exact current quote and terms.
- HTTPS, exactly same Origin and `Sec-Fetch-Site: same-origin`, JSON content type and a separate CSRF token whose digest matches the current customer session, with no URL query/hash or oversized payload.
- Strict JSON body with **exactly** `presentationId`, `decision:accept`, `explicitlyAccepted:true`, quote SHA-256, full-terms SHA-256, exact BWP minor-unit total and acceptance version. Omission, extra employee/user claims, wrong terms/price/version, or `reject` are all denied (rejection handling is separate and cannot create a consent).
- A host-owned authoritative read that the **same customer session** had a short-lived presentation offer for the unchanged exact frozen quote and terms. An independent `authorizeCustomerAcceptancePost` must confirm the actual customer-origin action, offer and current account authority, and must never be a universal-true callback.

The result is immutable **server-side request context**, not a stored acceptance. A separately reviewed integration must bind it to the real customer's signed OIDC proof, one-use nonce/identity link, full-term evidence and exact SQL consent transaction. The existing #2694 source assumes an employee `actorUserId`; it must **not** be used unmodified to attribute customer consent. Customer identity, consent-subject and actor attribution require a distinct independently reviewed end-to-end contract.

## Operational and privacy gates

A real customer-specific invitation/PKCE host, terms snapshot authority, presentation-offer store, customer-visible accessible quote/terms UI, explicit checkbox/button, HTTP request-size/rate/abuse controls, origin protection, current ownership verification, consent ledger, privacy/retention and synthetic negative staging test **are still missing**. The host must set `Cache-Control: private, no-store`, redact cookies/CSRF/tokens, apply safe Content Security Policy and never permit an employee session to masquerade as a customer.

The Node tests only use synthetic customer sessions and authoritative-terms mock callbacks. They verify fail-closed cookies, missing prior review, CSRF/origin, body schema, wrong quote digest/terms/amount/version, current-session revocation and explicit intent. They **do not prove display, real human reading or legal consent**.

**No Cloudflare Worker, D1 execution, identity provider, actual customer quotation, Finance write or live site change authorized.** Source merge requires passing exact-head CI and formal independent `thusico` approval. Actual protected resource, terms source and production consent activation need separate exact-resource owner+independent reviewer approvals and recovery/privacy qualification.
