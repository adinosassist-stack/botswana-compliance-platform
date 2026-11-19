# Essentials private confidential OIDC token exchange — source-only candidate

**UNMOUNTED, NOT A RUNNING IDENTITY PROVIDER OR CUSTOMER LOGIN. NO CLOUD/BANK/D1 CHANGES.**

This source-only addition to issue #2695 follows merged PRs #2701 (authorization code + PKCE handshake) and #2702 (encrypted one-use state persistence). It implements only a **confidential authorization-code redemption transport** candidate for an independently approved OIDC provider that supports `client_secret_basic`. No token is valid until a separate pinned cryptographic signature + nonce + fresh-auth-time check succeeds.

## Trust and transport boundaries

- Exact configured HTTPS issuer, same-origin HTTPS token endpoint, HTTPS redirect URI, fixed client ID and an injected **server-only secret accessor**. Secrets are never accepted from the request/browser, committed to GitHub, sent in authorization URLs or returned in the result.
- Intended to be injected into the existing `exchangeAuthorizationCode` callback **only after** #2701's exact session-bound state has been atomically consumed and the active quotation challenge rechecked. The module itself is not an HTTP route and cannot independently prove who invoked it.
- Builds a single form-encoded POST with `grant_type=authorization_code`, authorization code, original PKCE verifier and pinned callback URI. Uses OAuth `client_secret_basic` credentials; server-host secret storage, rotation and provider compatibility require independent review.
- Constructs a pinned `Request` with `redirect: error`, `credentials: omit`, `cache: no-store` and `referrerPolicy: no-referrer`. An injected `fetchToken` transport must enforce certificate validation, a strict token-host egress allowlist, timeout, no redirect and no request/response secret logging. This code cannot certify the behavior of an arbitrary transport callback.
- Accepts only a 200 JSON response with bounded streaming body (12 KiB limit), a Bearer token type, a nonempty JWT-shaped ID token, and no OAuth error. Refuses redirects, incorrect URL, server errors, malformed JSON and overlarge responses, returning only `{idToken}` to the confidential caller. Access tokens, refresh tokens and client secrets are not returned.

**Critical security boundary:** A JWT-shaped ID token is **UNVERIFIED**. A trusted private host must pass it immediately into #2694's pinned RS256 signature/issuer/audience/nonce/fresh-`auth_time` verification and separately prove current customer-account ownership, same frozen quote digest, BWP amount, version and explicit acceptance. No login, receipt or consent can be inferred from token-exchange success.

## Verification and remaining work

Offline Node tests exercise exact endpoint, code verifier and redirect binding; confidentiality of form and return value; spoofed URLs, weak secrets, redirect, invalid JSON, OAuth error, invalid JWT shape, incorrect token type, response-size limits and network failure. Existing Essentials offline CI runs these synthetic tests.

Still missing: real approved IdP registration, confidential client credentials stored in host-managed secrets, protected customer session issue/rotation and callback route, actual provider discovery, JWKS pin/key rollover, consent terms UI, verified customer identity-to-Finance account ownership and provisioning, staging encrypted D1/Worker resources, key custody, retention/recovery, and end-to-end customer authorization tests.

**No deployment, staging SQL execution, customer activation, production Finance access or public route.** Require all CI + independent exact-head `thusico` review before protected source merge. Any IdP/Cloudflare/SQL/protected host operation needs fresh specific owner and independent reviewer staging approvals, with distinct production approval afterward.
