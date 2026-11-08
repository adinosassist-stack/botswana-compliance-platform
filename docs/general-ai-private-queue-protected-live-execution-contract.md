# Private Queue live qualification — protected execution contract

**This is an inert plan.** It does not authorize a staging Queue message, enable a consumer, deploy a Worker, or modify Cloudflare.

## Exact-source inputs

- `expected_main_sha`: 40 lowercase hexadecimal characters; must match both workflow checkout and current `main` after environment review.
- `authorization`: a distinct, explicitly approved staging-only live test authorization, not `DEPLOY_PRIVATE_GENERAL_AI_QUEUE`.
- `reviewer`: independent `thusico` approval for this exact source and test scope.
- `nonce`: a newly generated 32-hex random nonce, not printed in logs.
- `environment`: `general-ai-private-staging` with protected reviewer and no self-review bypass.

## Execution sequence (future separately reviewed runner)

1. Inventory Queue producers/consumers and confirm no customer messages; confirm staging-only service and D1 bindings, schema and isolation.
2. Capture exact-source approval and pre-test disabled state; verify no public routes and production AI off.
3. Under a protected staging-only approval, enable the private consumer for a bounded window without altering checked-in inert defaults. Record how to revert it before publishing.
4. Publish one approved `verify-disabled` envelope using dedicated staging-only producer credentials. Record a redacted delivery receipt and invocation count.
5. Prove successful acknowledgment; independently test duplicate nonce and invalid envelope rejection without invoking the target twice.
6. Test failure/no-ack behavior and replay safety, including `max_retries=0` terminal handling. Never claim automatic recovery when none exists.
7. Restore the consumer to disabled, verify no public routes and no production resources touched. Record rollback receipt.
8. Feed six independently evidenced booleans into `scripts/general-ai-live-queue-acceptance-gate.mjs` validation. Any absent evidence is a **NO-GO**.

## Stop conditions

Stop on source drift, missing approval, unknown producers, shared production resource, excess credential scope, missing rollback plan, unexpected provider request, customer data, or unexpected public route. Fail closed on any missing evidence. Preserve independent production-release gates.
