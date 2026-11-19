# Essentials private frozen full-contract terms + customer review evidence

**SOURCE ONLY — UNMOUNTED — UNEXECUTED ISOLATED STAGING D1 CANDIDATE — NO CUSTOMER ACTIVATION.**

This work follows merged customer-only acceptance boundary PR #2710. That boundary correctly rejected employee sessions, but its injected `loadFrozenCustomerQuote`, `recordCustomerReviewOffered` and `loadCustomerReviewOffered` dependencies were not implemented. The earlier frozen quotation authority held the immutable quote but **no full contract terms snapshot or digest**.

## 1. Atomic authoritative quotation + full-terms freeze

`createEssentialsPrivateFrozenTermsReviewStore(...).freezeQuotationWithTerms({source})` accepts source-of-truth quote bytes and the complete contractual terms bytes **only from an independently authorized protected host**. The mandatory `authorizeAuthoritativeFreeze` callback must establish the actual business-approved source of the exact quote, customer, BWP minor-unit total, contract terms and acceptance version. Arbitrary employee/browser input is **not** authoritative.

The source computes SHA-256 over separately bounded immutable quote bytes (<=131072 bytes) and full contract terms bytes (<=65536 bytes), then calls `db.batch()` with:

1. INSERT the original frozen quotation row (tenant, quote, customer, version, amount, quote SHA-256, quote bytes, source actor, UTC frozen timestamp).
2. Guarded INSERT SELECT of immutable terms, joining the same just-inserted frozen quote and binding exact quote digest, customer, reference, version, amount and frozen timestamp.
3. **Mandatory** INSERT into immutable freeze audit whose BEFORE INSERT trigger `RAISE(ABORT)`s if the matching quote **and** frozen full terms are absent or mismatched, including a silent zero-row terms insert.

Cloudflare D1 `batch()` provides a transaction and rolls back the entire sequence when the third SQL statement raises an error. Immutable/no-delete triggers protect full terms and freeze audit. A direct orphan quote without paired terms + audit, including any older source-only quote, **cannot be displayed by the new customer-only frozen-terms reader**. The module does not pretend that existing bare quotes have approved terms, nor backfill anything.

`loadFrozenCustomerQuote({tenantId,customerId,quotationId})` joins exact accepted quote, complete immutable terms and freeze audit; verifies customer/reference/version/total/frozen time and independently recomputes SHA-256 of both stored BLOBs. It returns the exact shape required by the merged PR #2710 customer-only review boundary. The host must never expose this reader as an unauthenticated HTTP route.

## 2. Customer-session-bound review-offered evidence

`recordCustomerReviewOffered` takes the exact authoritative scope and digests from the verified quote review boundary, then **rechecks current customer session and customer account authority**, loads the frozen quote/terms again, checks the correct expiry, requires an independent `authorizeCustomerReviewOffer` host callback, creates a high-entropy presentation ID and inserts a guarded record via `INSERT ... SELECT`:

- Exact **outside customer** `__Host-thebe-customer` session digest, tenant/customer/quotation, active current identity link and consent-subject HMAC; never a Thebe employee cookie
- Exact source quote SHA-256 and **full terms SHA-256**, BWP total and acceptance version; both immutable rows and audit still required
- Short-lived offer (maximum five minutes and never longer than current customer session), stored without raw cookie, CSRF, OIDC JWT or invitation nonce

`loadCustomerReviewOffered` rechecks the current customer session and immutable quote/terms, active identity link, original customer/session binding, hashes, BWP amount/version, expiry and offer state. An offer is **only** evidence that a protected server prepared to display full terms, **not** proof that the customer saw, read, understood, or accepted them.

The review-offer table supports irreversible `offered → consumed/revoked` states, but this PR intentionally **does not implement a legal consent commit or consume the review record**. A future independently reviewed **customer-specific** final consent transaction must atomically consume the exact offer while recording signed customer identity/terms/digest/explicit intent, without reusing the old employee-actor consent schema unchanged.

## 3. Verified offline scope and remaining launch blockers

Node tests cover default-disabled isolation, exact immutable byte/digest behavior, authorized atomic freeze, duplicate/unauthorized quote denial, customer-owned offers and direct integration with #2710 HTTP boundary using the **actual same cookie digest**. A separate in-memory SQLite test runs the **actual exported JavaScript SQL** and proves three-row freeze or total rollback, orphan quote suppression, immutable terms/audit, cross-tenant/customer/hash/version/amount offer denial, reuse prevention and current identity/quote/session revocation denial. Synthetic tests are **not production proof**.

**Still missing:** actual authoritative quote-and-terms provenance, reviewed contract wording and version control, approved isolated D1/schema migration and backups, real customer IdP/PKCE and invitation distribution, customer-visible accessible HTML rendering with actual no-store/CSP headers, host rate limits, the separate customer-specific one-use signed consent/evidence transaction, external customer-account ownership proof, privacy/retention/deletion and complete E2E security tests.

**No real D1 mutation, Cloudflare Worker/route or secret, Finance write, public customer login, production quotation, consent or website change.** Exact-head CI and formal independent `thusico` review are mandatory before protected source merge. A future exact-resource owner + independent reviewer staging approval with recovery/retention acceptance and a distinct production approval are required for runtime activation.
