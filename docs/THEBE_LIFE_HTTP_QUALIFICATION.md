# Thebe Life household HTTP integration — qualification boundary

Status: review-only. `cloudflare/src/thebe-life-household-route.js` is not imported by the canonical production Worker and the flag must default OFF.

The adapter offers two future internal endpoints, both under the current Desk origin:
- GET `/api/life/households/:householdId/entries` — first verifies a current active member and returns a bounded read-only ledger.
- POST `/api/life/households/:householdId/entries` — requires same Origin, a current session CSRF proof, validated small JSON body, a dedicated rate limit binding, and an atomic active owner/adult SQL membership predicate.

### Required production integration, NOT done
1. Implement a canonical server-side Life entitlement in the existing auth/session stack. The adapter trusts `auth.session_verified` and `auth.life_entitled` only when resolved **by the canonical server**; never accept these from a client, URL or header.
2. Prove compatibility with the real Worker bundler. The adapter imports `server/thebe-life` source and **must be confirmed within supported packaging** before any route registration.
3. Apply a reviewed D1 schema migration separately, with preflight, rollback/restore proof and reviewed tenant isolation. `docs/sql/thebe-life-d1-proposal.sql` is not a deployment.
4. Bind dedicated `LIFE_DB` and `LIFE_RATE_LIMITER` with least-privilege access. Keep financial and family data segregated from corporate assets and public Market.
5. Reuse the app's existing session, Origin, CSRF, Fetch Metadata, body-size controls and error telemetry; validate these controls run **before** invoking the adapter.
6. Test authorization revocation, cross-household enumeration, unauthenticated reads, two concurrent writes with the same ID, malformed transactions, D1 failures, confidentiality, deletion/retention, mobile accessibility and runtime packaging.
7. Release through independent `thusico` approval, protected checks and a separate production activation decision.

### Non-goals
No bank transfers, group deposits, insurer quotations, policies, insurance commissions, AI access to sensitive records, public navigation or automatic production activation.

### Local test commands
`node --test tests/thebe-life-household-route.test.mjs tests/thebe-life-d1-reader.test.mjs tests/thebe-life-d1-writer.test.mjs`
