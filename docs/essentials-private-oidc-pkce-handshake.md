# Essentials: isolated OIDC authorization code + PKCE handshake — source only

**STATUS: UNMOUNTED CANDIDATE, NO CUSTOMER AUTHENTICATION OR CONSENT ACTIVATED.**

This follows #2694 (pinned signed ID token and exact frozen quote consent), #2696 (one-time atomic D1 consent), #2697 (private host session boundary), #2698 (customer identity mapping), #2699 (current identity link on consent write), and #2700 (receipt revalidation after link revocation). All are still private offline components until independent provider, host, storage and deployment qualification.

## Protocol scope

The module `server/essentials-private-oidc-pkce-handshake.mjs` builds a **source-only**, disabled-by-default OIDC Authorization Code flow for an independently approved, pinned HTTPS identity provider.

1. A trusted host calls `begin` only after verifying the **current** private session, tenant actor and server-held quotation challenge; the code refuses browser-provided customer identity.
2. The module requests two independent secure 256-bit random values: an opaque one-use state and a PKCE code verifier. It stores SHA-256 of state, never the raw state; stores the code verifier ONLY through a trusted, confidential server-side persistence callback and binds the record to the hashed session key, tenant, actor, quote, challenge, original nonce hash, exact IdP issuer/endpoints and client/redirect configuration. State lifetime is at most five minutes and no longer than the parent consent challenge.
3. The authorization redirect includes `response_type=code`, `scope=openid`, `code_challenge_method=S256`, a computed code challenge, state, **the session's original challenge nonce**, `prompt=login` and `max_age=0`. These request a fresh authentication; they do not prove it happened.
4. The separate OIDC redirect handler must accept a cross-site GET after verified TLS and same-site session-cookie handling. The callback validates exact HTTPS redirect origin/path, one code, one opaque state, and one `iss` equal to the configured issuer. We intentionally require the OAuth 2.0 authorization-response issuer parameter to reduce provider mix-up. **A provider without this response must not be selected without a separate exact-source review.**
5. The injected `consumeAuthorizationAttempt` authority MUST atomically consume a pending state only if its SHA-256, session hash and expiry match. The flow then independently requires the *currently active* session and same server-held customer/quote/nonce challenge before calling a confidential server-only authorization-code exchange callback with the original PKCE verifier.
6. The returned ID token is **NOT a validated identity**. The trusted private server must immediately pass it internally to the existing pinned RS256 ID-token verifier and explicit frozen-quotation capture in #2694, which checks actual signature, exact issuer/audience, original nonce, fresh `auth_time`, accepted document bytes and customer mapping. Never return an ID token or access token to the browser or logs.

The code does **not** open an HTTP listener, call a real token endpoint, configure client credentials, register an IdP redirect URI, issue cookies, store sessions or state, or bind a Worker. The host-supplied `exchangeAuthorizationCode` MUST use the approved confidential OAuth client, validate HTTP response type and size, TLS, timeouts, and token endpoint errors; never accept arbitrary web URLs. The host must also prove approved provider-specific discovery, supported keys and rotation, code redemption concurrency, logout and revocation. State/PKCE storage must be encrypted/restricted at rest and never accessible from the browser.

## Security requirements not provided by an offline flow

- Select a real provider and approve tenant, exact HTTPS issuer/authorization/token endpoints, client registration, callback URI, pinned public keys and rotation policy.
- Implement isolated server-side session issuance (`__Host-` cookie: Secure, HttpOnly, Path=/, no Domain, appropriate SameSite policy), strict CSRF protection for action POSTs, tenant actor access, rate limits, token and cookie redaction, return URL validation.
- Implement atomic one-use state and PKCE verifier persistence with cleanup/expiration and a replay-safe, session-bound challenge link. No JavaScript/browser storage of secrets.
- Establish a real, independent customer account ownership proof, invitation mechanism, and link provisioning/revocation authority. An IdP login is not proof of tenant/customer ownership.
- Show and affirm exact frozen quote, BWP total, terms and version; only the existing guarded consent transaction may record acceptance after successful independent verification.
- Perform isolated staging D1/Worker/IdP end-to-end negative tests and recovery checks. Obtain separate exact-SQL, exact-resource owner and independent `thusico` approvals before ANY operational change, then distinct production authorization.

**No live site changes. No customer activation. No Cloudflare/D1 operation.** Passing synthetic PKCE tests does not qualify real customer identity.
