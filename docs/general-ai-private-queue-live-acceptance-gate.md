# General AI private Queue — live staging acceptance gate

This is a **review-only acceptance specification**, not permission to deploy, enable a consumer, publish a message, or expose an endpoint. The existing protected workflow only proves offline readiness and optionally deploys a **disabled** consumer.

## Isolation prerequisites

1. Independent `thusico` approval of an exact current `main` SHA and the staging-only execution plan.
2. Protected `general-ai-private-staging` environment, independent reviewer and no self-review bypass.
3. Confirm Queue `bw-general-ai-private-acceptance-queue` has no customer producers and no unexpected consumers; identify a dedicated test-only producer with narrowly scoped credentials.
4. Confirm D1 `71e2d394-7dec-4878-bdc8-afe8f73cf541` is the staging nonce database, schema qualified, isolated from production and backed up. Verify live nonce claim atomicity.
5. Confirm `STAGING_AI` resolves only to `bw-general-ai-staging`; verify the three disabled-state endpoints without provider calls.
6. Separate staging-only consumer enablement plan must have a bounded activation window, a verified rollback and exact-source approval. Never flip the checked-in default `false` flags to `true` in a normal PR.

## Evidence matrix (all required before a live-qualification claim)

| Case | Expected observation | Proof |
| --- | --- | --- |
| One approved `verify-disabled` envelope | Exactly one staging delivery and successful private disabled-state verification | Queue delivery receipt and redacted consumer event |
| Acknowledgment | Message acked once; no unexpected retry | Queue delivery/ack telemetry |
| Duplicate nonce | Durable D1 claim rejects replay; no second service invocation | Staging D1 claim and redacted invocation counts |
| Wrong Queue, SHA, malformed envelope | Fail closed; no staging service invocation | Negative-path logs and claim counts |
| Service failure | No ack; claimed nonce stays claimed | Redacted failure trace and D1 state |
| Acknowledgment failure | Re-delivery cannot re-invoke service | Replay trace and D1 state |
| Recovery/rollback | Consumer returns to inert disabled state, no public route | Deployment metadata and post-test configuration |

**Important:** Cloudflare Queue delivery is at-least-once. Do not infer exactly-once delivery from an application-level nonce lock. With `max_retries = 0`, any failed message must be explicitly accounted for; do not claim automated recovery.

## Abort conditions

Abort before any publish if the exact SHA changes, the independent approval is missing/expired, credentials exceed staging scope, the D1 schema or isolation is unverified, the Queue has customer producers, the staging service target is ambiguous, or rollback cannot be verified.

Abort immediately on any unexpected public route, provider call, production D1 access, second service invocation for one nonce, or unaccounted failed delivery.

## Acceptance result

Record separate booleans for `liveDeliveryVerified`, `liveAckVerified`, `liveReplayVerified`, `recoveryVerified`, `d1IsolationVerified`, and `consumerRestoredDisabled`. Every field defaults to **false** until backed by a timestamped run URL, exact SHA, and redacted evidence artifact. Offline CI cannot set these booleans true. Customer AI remains disabled until its own independent production release gates pass.
