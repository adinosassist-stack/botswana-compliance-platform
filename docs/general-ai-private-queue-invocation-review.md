# Private General AI staging queue-triggered acceptance — NOT DEPLOYED

**Status:** review-only proposed non-public invocation channel, no authority to deploy.

Cloudflare supports HTTP publishing to a dedicated Queue using an API token with Queues Edit permissions. A separately deployed push-consumer Worker can receive the message, invoke `bw-general-ai-staging` by Service Binding, and return only bounded negative-path status evidence; there is no need to expose a hostname/route/preview on either Worker.

Cloudflare documentation:
- https://developers.cloudflare.com/changelog/post/2025-05-09-publish-to-queues-via-http/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
- https://developers.cloudflare.com/workers/wrangler/configuration/#queues

## Proposed review boundary
- Queue: `bw-general-ai-private-acceptance-queue`, created separately only after independent security and cost approval; consumer: `bw-general-ai-private-queue-acceptance`.
- Only one `verify-disabled` message per batch targeting exact staging Worker, exact approved Git SHA and synthetic one-time hex nonce. No extra keys, prompts, user identifiers, cookies or provider requests.
- `PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED` defaults OFF. Protected release must set it explicitly after approval and provision `APPROVED_SOURCE_SHA` from an authenticated exact-main release authority; the message SHA equality check alone is not that proof.
- Queue publish API token needs only necessary Queues Edit scope and should be restricted to this dedicated test queue if supported. Cloudflare may expose account-wide permission granularity: independently review actual resource scoping. Never reuse production deployment token.
- Producer identity + API token do not replace independent protected GitHub environment review. Audit queue producer principals, retention, retry/dead-letter handling, log access, replay/duplicate prevention and one-shot teardown before any use.
- No custom domain, workers.dev, preview URL or production Worker relay. Review service binding and queue/consumer binding identity via live read-only settings before *and after* tests.
- Consumer only tests disabled state (404/404/405), never authenticated AI, real D1, feature toggles, research, exports or paid providers.
- Queue delivery is at least once. The consumer now requires a `PRIVATE_AI_NONCE_LEDGER.claimOnce({namespace,sourceSha,nonce})` binding that must atomically and durably reserve a globally unique nonce **before** any private invocation. Exactly `true` is accepted; missing or uncertain confirmation fails closed. A failed invocation still consumes the nonce; retries require separate investigation rather than re-executing the Worker. Do not release a claimed nonce after partial execution.
- **No real ledger implementation or binding is provided by this proposal.** Cloudflare KV get/put and in-process Sets are not atomic, durable, or sufficient. A proposed Durable Object/transactional storage implementation, lifespan, deduplication semantics, identity, retention and replay window need independent review and isolated testing. The config remains default OFF, and provisioning or dispatch is prohibited until a proven atomic ledger exists.
- The consumer no longer logs the nonce or message payload. A test double returning `true` is only offline mocking and does **not** establish production-safe replay prevention. Do not treat this as a safe credentialed/live fixture runner.
- A failed target response must fail closed and not be acknowledged. Operational review must set retry bounds and stop repeated failures; the proposal deliberately cannot initiate deployment by itself.
- Logs include only fixed event type, random nonce and count. Ensure platform log retention and restricted readers before dispatch.
- No queue, consumer, token, GitHub environment, deployment, D1 fixture or provider is created/changed by this PR.

## Independent review gate
Run offline `node --test tests/general-ai-queue-acceptance.test.mjs`; review bundle compatibility separately. After independent review of queue and Worker source, exact identity, scope, rollback, one-shot teardown, budgets and protected authorization, explicitly approve provisioning of a dedicated private staging consumer/queue. Only *after* restricted, reproducible disabled-path tests pass can a separate change propose signed one-shot authenticated fixture acceptance with real D1, CSRF, tenant, rate limits, cleanup and paid provider budget. This document must not be interpreted as permission for production General AI activation.
