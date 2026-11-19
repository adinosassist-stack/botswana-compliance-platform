# Essentials: external-customer OIDC session (source only)

**UNMOUNTED PRIVATE STAGING CANDIDATE — NOT AN OPERATIONAL CUSTOMER LOGIN OR ACCEPTANCE SERVICE.**

## Why this is separate

The earlier #2704 `__Host-thebe-consent` session authenticates a **Thebe employee/tenant actor**, not the customer who must personally review and accept a quotation. It cannot be used as proof that the outside customer has seen the quote, owns the linked account or consented to its terms.

This new candidate has a deliberately separate `__Host-thebe-customer` cookie and **no employee role/grant**, and uses a different invitation, session, CSRF and customer-ownership authority. It does **not** turn employee-held consent routes into customer routes.

## Customer proof and session issuance

Only a separately approved private host may call `issueVerifiedCustomerSession({invitationId,idToken})` using a callback result from the **real customer's** OIDC authorization-code/PKCE flow. The `loadTrustedCustomerInvitation` and `verifyTrustedCustomerCallback` host callbacks must prove the actual server-side invitation nonce, session/callback origin, unique state, proper HTTPS transport and customer invitation possession. **A browser-supplied invitation identifier or ID token is not sufficient.**

The candidate internally validates the IdP JWT's **RS256 signature** against a pinned 2048-bit-or-stronger public key and pinned `kid`, exactly matches issuer, audience and original invitation nonce, verifies `iat`, `exp`, `nbf` and fresh `auth_time` relative to the invitation, and fails closed on malformed encodings, unexpected algorithms and signatures.

A signed IdP `sub` alone is **not account ownership**. The separate #2698 `resolveCustomerAccountLink` checks a currently active, HMAC-tagged identity link and an independently verified source-of-truth customer-account mapping. `verifyCurrentCustomerOwnership` is required again at issuance and on every session read. If the identity link, customer ownership or frozen quote is revoked, SQL and host checks deny access.

The module mints two independent 256-bit random values, returns `__Host-thebe-customer=...; Secure; HttpOnly; SameSite=Lax; Path=/` with a maximum five-minute lifetime bounded by the invitation and signed IdP expiry, and delivers a CSRF secret only to the trusted server for same-origin page delivery. D1 stores **only SHA-256 session and CSRF hashes**, the linked customer/tenant/quote/invitation identifiers and metadata, never a raw token, `sub` or invitation nonce.

The unexecuted, separate customer-staging schema enforces one-use invitations. A **single D1 `db.batch()`** does three statements: a guarded invitation state transition, a guarded customer session INSERT matching current quote/identity link, and an unconditional immutable audit INSERT whose SQLite trigger raises `ABORT` unless the exact consumed invitation and customer session exist. This protects against a zero-row intermediate statement leaving a consumed invitation without a session. One-way revocation prevents reuse.

## Strict remaining prerequisites

1. **Separate customer invitation issuance and proof:** No real invitation creation or distribution, verified channel ownership, safe sharing/forwarding policy, customer invitation redemption UI, or anti-enumeration/rate limiting exists in this PR. An invitation token must be high-entropy, server-hashed and one-use; never infer authorization from its identifier alone.
2. **Real external-customer IdP + HTTPS host:** Neither a real IdP/client nor customer-specific authorization-code PKCE, callback session proof, key rotation/JWKS verification, browser cookie installation, logout or rate limiting is connected. A source-only RS256 validator does not establish a live login.
3. **Customer-only acceptance boundary:** Current #2697 consent boundary is for an **employee actor session**. A separately reviewed customer `__Host-thebe-customer` cookie parser, same-origin POST+CSRF, exact immutable quotation/terms presentation and explicit customer acceptance path must be created, without adapting the employee's authority. The later consent evidence/actor attribution and SQL require corresponding independent source review.
4. **Ownership, privacy, staging and recovery:** Independently attest customer ownership against the live system of record (not solely D1), protect reauthentication and legal identity proof, reject cross-tenant confusion, approve retention/audit/revocation and recovery/backup safety, and run full isolated staged end-to-end negative tests. No direct D1 connection or real consent activation here.

The unit tests generate **synthetic** RSA signed IdP tokens and simulate current-ownership callbacks. A separate SQLite test executes **actual exported JS SQL** against in-memory synthetic staging schema, testing same-session one-use issuance, wrong tenant/customer/nonce, revoked link/quote/invite and rollback. Synthetic passing tests are NOT real provider acceptance or legal consent.

**No D1 migration, Cloudflare Worker, real customer identity connection, Finance write, public route or production change was performed.** Protected source merge requires all required exact-head checks and formal independent `thusico` GitHub approval. Future isolated staging SQL, token/secret custody, protected Worker and routes need separately scoped owner+reviewer authorization with recovery evidence. Production customer activation is a distinct approval.
