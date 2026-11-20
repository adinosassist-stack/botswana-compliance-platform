# Essentials C4 — pinned external-customer OIDC endpoint compatibility (source-only)

**NOT DEPLOYED / DEFAULT DISABLED / GOOGLE NOT SELECTED OR REGISTERED.** This is a narrow compatibility fix under issue #2695. It does not configure Google Auth Platform, create OAuth credentials, select a Google project, enable login, mount a Worker, alter Cloudflare Access or customer D1, invite a customer, or authorize production activation.

## Problem and scope
The unmounted customer invitation journey and confidential OAuth2 code-exchange adapter previously required the configured issuer, authorization endpoint and token endpoint to all share an origin. Google's published OpenID Connect values use multiple origins, so the existing code rejected its actual token endpoint.

A single shared source-only endpoint policy now allows:

- Default `providerProfile="same-origin"`: preserve original HTTPS same-origin rule for unselected/custom providers. Arbitrary cross-origin hosts continue to fail closed.
- Explicit `providerProfile="google-oidc"` only when all relevant strings match exactly:
  - Issuer: `https://accounts.google.com`
  - Authorization endpoint: `https://accounts.google.com/o/oauth2/v2/auth`
  - Token endpoint: `https://oauth2.googleapis.com/token`
- The invitation journey verifies the full three-string tuple; the confidential exchange, which does not receive the authorization endpoint, verifies the exact issuer/token pair.
- URLs are still separately required to be canonical HTTPS without injected search, hash, userinfo or arbitrary path. Caller-provided code exchange requests cannot change the pinned token endpoint, client ID or HTTPS callback. The transport still rejects redirects and unexpected response URLs. A returned ID token is **unverified** until the separate signature, audience, nonce, `auth_time` and current customer-ownership validation succeeds.

Source modules:
`server/essentials-private-customer-oidc-provider-policy.mjs`,
`server/essentials-private-customer-invitation-oidc-journey.mjs`,
`server/essentials-private-oidc-confidential-exchange.mjs`.

Tests include preserving default same-origin behavior, a real Google URL tuple allowed only with explicit provider selection, forged/subdomain/alternate-token-host/issuer-path/query variants denied, exact PKCE authorization request preserved, unchanged confidential token exchange, and cross-provider attempts denied.

**Official reference:** https://developers.google.com/identity/openid-connect/openid-connect — the exact Google endpoint triplet is documented there. If Google changes endpoints, treat it as an explicit, independently reviewed source/config change, not an automatic trust expansion.

## Deliberately unqualified C4 requirements
- Google is **not selected** as the actual external-customer IdP. TinyFish read-only inspection identified the Google Cloud `thebe-desk-production` project with no configured Google Auth Platform and no OAuth clients. Do not set up experimental staging authentication within that production project without explicit approval. A separate staging project, provider, confidential client, consent screen, verified domains and callback would need approval.
- Real OIDC callback handling still requires a provider-side integration test, including whether Google's authorization-code redirect supplies RFC 9207 `iss` alongside `code` and `state`. The existing callback deliberately requires exactly those three parameters and fails closed if the real provider does not send them. Do not weaken this check before a separately reviewed alternative mix-up defense and provider-specific tests.
- JWKS fetch/rotation, secret custody, signed ID token validation, current customer ownership/quote authority, secure recipient-verified delivery, invitation replay/expiry, full terms and explicit consent, legal/privacy retention, backup/restore and real protected staging host remain separately qualified gates.
- Existing C3 customer schema in isolated D1 `56f48000-9d89-47d5-a077-47dfe0825662` is untouched by this source-only change. No Cloudflare changes or SQL writes.
- A source-only PR must pass protected CI and independent `thusico` review for the **exact head SHA**. Approval to merge source is **not** permission to create a Google client, enable a Worker or Access application, or activate real customer acceptance.

**Stop conditions:** any unknown OIDC profile, spoofed issuer, token endpoint/path/query mismatch, changed GitHub source, missing separate approval, or unverified customer-account authority must fail closed.
