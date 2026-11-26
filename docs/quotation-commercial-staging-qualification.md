# Private quotation/invoice/banking staging qualification

The feature batch is merged in #2886. This consolidated operational source package closes the schema/runtime composition gaps discovered by the subsequent read-only activation preflight in #2735. It does not apply SQL, deploy Workers, expose a hostname, create an Access application or issue synthetic sessions.

## Reuse and isolation

| Resource | Proposed use | Boundary |
| --- | --- | --- |
| bw-quotation-staging / aec227e9-b0f2-4b00-8de0-105465c4e2d6 | Commercial staging records and canonical Finance foundations | Preserve existing draft/logo tables; no real customer data |
| bw-quotation-auth-synthetic-staging / d7ad8e99-2ee4-446c-9358-0e186031571d | Existing synthetic session store | Staging-only HMAC secret, active owner membership, maximum 15-minute remaining session lifetime |
| bw-quotation-auth-private-staging | Proposed reuse as protected gateway | Still inert; no route or Access audience configured by this package |
| bw-quotation-commercial-private-staging | Proposed internal application service | Default HTTP returns 404; only named service-binding entrypoint |
| bw-quotation-commercial-pdf-private-staging | Proposed internal PDF service | Default HTTP returns 404; only named service-binding entrypoint; no DB or R2 |
| Existing invoice sandbox | Preserve unchanged | Its customer schema is incompatible with canonical Finance; do not modify it |

All review manifests have workers.dev and preview URLs disabled, no routes, no secrets, and activation flags false. The application assets binding runs the Worker first; its ordinary HTTP entrypoint always returns 404, so static assets cannot bypass the private session boundary.

## Exact proposed schema sequence

Execute only after separate exact-resource/schema/operator/recovery approval against the quotation database above:

1. `docs/sql/quotation-commercial-staging-foundation-CANDIDATE.sql` — SHA-256 `3bd2e10649e3d0020045c65d5d697faba48f2379f96e8d202058f4fdea6dfb82`.
2. Existing `cloudflare/migrations/049_v108_finance_receivables.sql` — SHA-256 `5a3f858bf6439483f04d74ec908c5593172182450bb5c79410f4385d41b1ad4c`.
3. Merged `docs/sql/quotation-commercial-workflow-CANDIDATE.sql` — SHA-256 `df0bc67a27ea5c4efe2b6974941eff845287da3743f6f8cd2db4f69f7c3ffa24`.

The foundation adds only tenants/users/finance_transactions; canonical migration 049 adds the actual Finance customer/invoice/allocation schema and guards. The merged four-table commercial schema is unchanged. No synthetic business, user, customer, bank or session records are seeded automatically. Schema replay and unexpectedly existing foundation tables fail closed. Tests preserve a pre-existing quotation draft and check foreign keys.

## Protected runtime composition

The Access gateway verifies the actual RS256 signature against the configured team's public JWKs, exact issuer and audience, expiry and not-before/issued-at claims. Merely supplying an Access header never grants access. Public keys alone are cached briefly; untrusted key URLs and oversized tokens/key responses are denied. See the [Cloudflare validation guidance](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

The internal application independently verifies its synthetic HMAC cookie, expiry, generation, tenant and current active owner membership. It does not accept caller-supplied actor or tenant IDs. Its browser session capability returns only that verified session's CSRF token; the original verifier methods retain their previous return shape. Mutation requests require the configured origin and fresh CSRF verification. Only four quotation JavaScript assets, the customer-ready document, own auth/me, active customer lookup and the merged commercial endpoints are mounted. There is no transaction, allocation or customer creation endpoint.

The internal renderer reuses the existing pinned @cloudflare/playwright package and merged two-page renderer. It closes the browser on every result and exposes no default HTTP actions. Both internal services and the gateway remain disabled without their separately approved staging configuration. No production Worker, database, credential or financial record is used.

## Evidence and remaining operational gates

Local tests exercise the actual Miniflare D1 schema sequence, preserved old drafts, complete bank/quote/invoice flow, HMAC sessions, revoked generations/memberships, foreign tenants, CSRF, overlong/expired sessions, actual RSA JWT signatures/tampering, wrong issuer/audience/time and JWK outages. Existing private verifier/host regressions pass. All three Workers build with the pinned Wrangler in dry-run mode. The PR workflow reruns those checks and the existing real Chromium mobile/PDF/file-share journey.

These are offline/source checks, not hosted acceptance. Before any operation: fresh exact SHA and checksums; effective backup retention and restore-capable operator; current bookmarks and a tested rollback plan; independent thusico approval; separate owner authorization naming the exact resources and scope. Then stage-only schema/fixture installation, private service upload/bindings, protected hostname/Access policy verification, authenticated hosted acceptance and physical Android WhatsApp/native zoom testing. Any public route, production change or production deployment needs separate authorization. No operational approval is implied by this document or a checked flag.
