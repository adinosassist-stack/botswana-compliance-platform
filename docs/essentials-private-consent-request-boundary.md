# Essentials private consent HTTP/session boundary — source-only candidate

**SOURCE ONLY · NOT DEPLOYED · NO IDENTITY PROVIDER OR CUSTOMER CONSENT SERVICE ACTIVATED**

This is a security composition building block for issue #2695. PRs #2694 and #2696 provided a pinned-OIDC consent verifier candidate and a guarded one-time challenge/consent D1 candidate. Neither provides a genuine trusted HTTP customer session or a hosted authentication system. This module must remain unmounted unless separately reviewed and approved.

## Server-authoritative contract

The function `createEssentialsPrivateConsentRequestBoundary` is disabled by default and restricted to `essentials-private-staging`. A trusted, separately approved host injects:

- `expectedOrigin`: an exact HTTPS origin, not a hostname substring or a browser-configured origin.
- `loadActiveSession({sessionKeyHash})`: server-side authoritative active-session lookup keyed only by SHA-256 of an opaque, securely issued `__Host-thebe-consent` cookie. The host must securely issue and rotate opaque cookie values and store their digest rather than plaintext. Require Secure, HttpOnly, SameSite, Path=/, no Domain and controlled expiry. The callback must independently enforce revocation and the current account's state.
- `loadSessionChallenge({sessionKeyHash,tenantId,actorUserId,quotationId,challengeId})`: current protected session-bound one-time challenge lookup, from an isolated trusted store. Never accept the browser's tenant, actor, customer or nonce values. The returned nonce must remain server-side and bound to exactly this session.
- `oneTimeConsentStore.loadOneTimeChallenge`: private candidate from #2696. It independently re-reads the matching D1 challenge and frozen quote using the server principal and session nonce.
- `cryptoSubtle`, `now`: trusted cryptographic digest and monotonic-enough server UTC clock dependencies. Do not substitute browser-supplied values.

The unmounted boundary requires an HTTPS POST to the expected origin, exactly matching Origin, Fetch Metadata `Sec-Fetch-Site: same-origin`, JSON content type, one well-formed session cookie and a separate high-entropy CSRF header. It verifies the SHA-256 of the CSRF header against the server session, requires unexpired active session and session-bound challenge with identical tenant, actor, customer and quotation identity, and returns only a trusted tenant actor principal plus closure-scoped callbacks usable by the #2694 capture candidate.

**Important:** The tenant actor principal is *not* the authenticated customer. Real customer identity must still be proven by independent OIDC reauthentication, and `resolveCustomerAccountLink` must independently map the signed IdP subject to the intended tenant and customer. No customer identity is inferred from an actor session or accepted D1 record.

## Integrator safety rules

1. Call `validateCaptureRequest` only from a trusted HTTPS host route (which this PR does NOT create). Enforce a small JSON body size, rate limits, content security policy, strict redaction of Cookie/CSRF/ID tokens, and disabled caching in that host.
2. Re-authenticate the real customer at the chosen IdP; use a supported confidential client/OIDC flow with independently qualified state, PKCE, callback, nonce and key-rotation security. The existing pinned RS256 verifier is an offline source candidate, **not** a complete OIDC protocol implementation.
3. Build a fresh boundary per request, never persist returned callbacks between requests. The secure session and challenge stores must use current revocation state and at least the same expiration on each read.
4. Feed its `verifyHostRequest` and `loadOneTimeChallenge` callbacks into the isolated #2694 capture candidate. The atomic commit must separately recheck current authorization, quote state, actual customer mapping and challenge state, and preserve the #2696 one-statement rollback guarantee.
5. Obtain fresh exact-SHA `thusico` independent review before protected source merge. Any staging D1 SQL, session/IdP configuration, private Worker/route/binding, customer-facing action and production change requires its own independently approved operational gates.

## Tests and limitations

Node synthetic tests cover origin spoofing, Fetch Metadata denial, CSRF proof, cookie duplication, session revocation/expiry, actor/tenant switching, session-bound nonce, mismatched customer, D1 outage and re-read behavior. They run in Essentials offline CI.

**Not implemented:** real customer invitation, session issuance/persistence, actual IdP integration, mapping, rendered frozen terms, transaction execution, revocation API, recovery, deployment, legal consent assessment or production activation. Merging these files must not be represented as completion of real authenticated customer consent.
