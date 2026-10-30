# Conversation history: isolated staging acceptance gate

This is a **not deployed** staging rehearsal, not an approved migration or live customer service.

## Required preconditions before staging deployment

1. Dedicated staging Worker, staging-only exact origin, and a dedicated staging D1. Neither Worker route nor D1 binding may target production.
2. Independent database identity verification against the production D1 UUID. Never accept a same-name database or assumed isolation. Existing session verifier uses the same `env.DB` binding for `sessions`, `users`, `memberships`, `tenants` and rehearsal conversation tables: the dedicated D1 must hold **independently provisioned staging auth records** plus approved rehearsal tables.
3. Get privacy, retention, deletion, consent, and logging approvals before enabling any persistent user content. Conversation schema is intentionally design-stage only.
4. Authenticate using existing signed cookie/session-generation logic. Test session revocation, CSRF, tenant switching, viewer append rejection, duplicate idempotency keys, and 8 KB body enforcement.
5. Confirm complete staged typed and final-voice transcript append/list, duplicate retry behavior, no audio blobs, and denial of cross-tenant reads.
6. Explicit deployment profile `conversation-staging`, `APP_ENV=staging`, `DEPLOYMENT_ENV=staging`, `CONVERSATION_HISTORY_STAGING_ENABLED=true` only after the above gates. The route is currently unregistered.

## CI evidence

The Conversation staging integration acceptance workflow executes every `tests/conversation-*.test.mjs` in Node 24 and checks the production worker and entrypoint do not import the rehearsal dispatcher. CI proves code behavior against mocks only; it **does not** prove Cloudflare D1 identity, actual cookie authentication, real database persistence, or live deployment readiness.

## Stop conditions

Never run rehearsal SQL against `bw-compliance-os`, production D1 UUID `8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce`, or the billing staging D1. If staging identity is uncertain, leave the feature disabled. No customer API exposure is permitted without explicit security and privacy sign-off.

## Verified infrastructure inventory — 2026-10-30

- Cloudflare account: `ddd23cab31928a4bb3d4998df9b26d1d`.
- Dedicated `bw-conversation-staging` D1: `95c48030-0395-44cb-aa95-622beaf4efdf` (read-only identity check performed).
- Production `bw-compliance-os`: `8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce` (do not query or modify for rehearsal).
- Staging D1 schema inventory: only Cloudflare's `_cf_KV` table observed; no conversation or authentication schema initialized.
- No dedicated conversation-staging Worker script was found in the account's script listing.

**New fail-closed control:** route requires a `CONVERSATION_STAGING_D1_ID` config exactly matching the expected dedicated D1 UUID **and** an independently installed single-row marker table `thebe_conversation_staging_identity(database_uuid TEXT NOT NULL)` in its bound database with the matching value. This is an additional guard, not a substitute for checking actual binding identity and route configuration before deployment. Do not create the marker or run schema writes without approved privacy/retention and staging provisioning steps. The route remains unusable until qualification.

## Staging marker cardinality

The route now requires exactly **one** row in `thebe_conversation_staging_identity`, with `database_uuid` matching the dedicated staging UUID. Missing, duplicate, invalid and production-ID markers fail closed before session resolution. This is a defense-in-depth test, **not proof of Cloudflare binding isolation**: inspect the deployed Worker binding separately and do not treat a copied marker as identity attestation. No data-writing migration is authorized by this document.
