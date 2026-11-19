# Essentials private customer identity and consent capture — source-only candidate

**Status: UNMOUNTED SOURCE ONLY. NO CUSTOMER AUTHENTICATION SERVICE, D1 WRITES OR DEPLOYMENT AUTHORIZED.**

This change follows merged PR #2693. A D1 row and correct SHA-256 digest did not prove actual customer identity or consent. The new server/essentials-private-customer-consent-capture.mjs candidate adds cryptographic signature verification of a supplied identity token against a pinned IdP RSA public key, plus exact frozen-quotation and explicit-acceptance guards. This is an offline building block, not a working public identity/consent service.

## Boundaries and behavior

1. The host must establish a secure server-side customer session, same-origin POST, effective CSRF protection, and an authenticated, session-bound, high-entropy, **single-use** 5-minute challenge. The verifyHostRequest callback MUST check those requirements; an untrusted boolean/HTTP input is forbidden.
2. A trusted store must return the actual pending challenge with tenant, actor, customer, reference, frozen quotation version, BWP integer total, SHA-256 digest, cryptographically random OIDC nonce and issuance/expiry. The client cannot decide these fields or pick a different quote.
3. The customer's OIDC provider must force **fresh reauthentication** with the exact challenge nonce. The private service verifies an ID token's RS256 signature against a **pinned, host-configured RSA-2048+ public key**, strict kid and header fields, exact HTTPS issuer, exact audience, subject, nonce, expiry, issuance time and authentication time. No dynamic jku/jwk/algorithm selection or browser-supplied verification keys.
4. The trusted, independently governed account-link authority must prove the signed external provider subject is the intended tenant customer. The resolveCustomerAccountLink callback is a dependency, not an implementation. The tenant actor recorded in existing acceptance tables is **not** a substitute for authenticated customer identity.
5. The trusted frozen quotation store must return the exact immutable quotation bytes and money fields for that tenant/quotation/actor. SHA-256 is independently computed over those bytes and must match the challenge and the customer's explicit version/total/digest confirmation.
6. Consent evidence is serialized from trusted server-side facts, includes the identity issuer, pseudonymized identity subject digest, hash of the challenge nonce, quotation digest, exact money/version, linked identity subject ID, and server acceptance time. **Raw ID tokens and cleartext nonces are not recorded.** It is rejected on decline or missing explicit acceptance.
7. The commitVerifiedConsent callback MUST atomically revalidate the challenge nonce, unused state, expiry, current immutable quotation and approved account link, write the exact immutable consent bytes and digest to isolated staging authority storage, and consume the challenge. This host-owned transaction **is not implemented in this PR**; merely returning true from a callback does not constitute evidence of a working capture service.

All callback exceptions and malformed or stale states fail closed. The module returns a minimal success receipt only after a strict commit response. This source is never wired into a Worker, route, existing live quotation editor, Finance D1, or payment system.

## Tests

The tests/essentials-private-customer-consent-capture.test.mjs file uses ephemeral RSA test keys, synthetic identity tokens and quote bytes, and a synthetic mock commit. It checks signature verification, exact audience/issuer/kid/nonce, fresh authentication, expiry, forged/tampered JWTs, wrong quote total/version/hash, revoked and altered frozen quote, missing customer link, CSRF/host denial, failed atomic callback and replay rejection in the mock. It runs through the existing wildcard **Essentials offline qualification** workflow.

**Test limitation:** mocked sessions, challenge persistence, account mapping and atomic D1 writes do **not** qualify a real customer-facing acceptance flow or legal consent.

## Remaining prerequisites before private staging execution

- Select and approve a real identity provider and configured customer reauthentication method; establish secure server-session, invitation/link delivery, nonce, cookie, Origin and CSRF handling.
- Independently verify current finance-customer mapping and the exact authoritative quote freeze; require the actual customer to view and affirm the correct immutable revision with clear price and terms.
- Implement real isolated challenge persistence and an **atomic, single-use** guarded D1 consent INSERT/consume transaction, with replay/revocation/supersession handling, retention/deletion/privacy impact review and recovery evidence.
- Test from the rendered customer consent UI to the actual IdP session, provider-side proofs, D1 provenance and protected issuer, including concurrency, expired link, changed total, changed document, stolen token, revoked consent, cross-customer and cross-tenant scenarios.
- Review issuer private-key custody and isolation, private staging routes/Worker/bindings and outbound communication security. Obtain fresh owner and independent thusico exact-source approvals **before any isolated staging deployment/SQL execution**, and distinct production approval later.

**Merge scope: offline source + synthetic tests + documentation only.** No public routes, no Cloudflare changes, no customer activation, no live website changes. Maintainers must not infer that the real customer-identity and consent-capture requirement is satisfied merely because CI passes.
