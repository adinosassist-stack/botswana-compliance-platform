# General AI private Queue — protected live qualification plan

Status: **review only**. This document authorizes no deployments, Queue sends, feature activation, production writes, or environment changes.

## Verified baseline
- The isolated staging nonce D1 live replay workflow completed successfully at main `41f00d44eb08e44fc5c174a3bc91960949886c79` (runs 42475715635 and 42475512838). Its evidence is limited to isolated D1 duplicate-claim rejection.
- Queue consumer configuration `cloudflare/wrangler.general-ai-private-consumer.toml` has `workers_dev=false`, `preview_urls=false`, and all three acceptance/ledger qualification flags set to `false`.
- The review-only consumer entry `cloudflare/src/general-ai-private-queue-d1-entry.review.js` rejects unqualified ledger schema, isolation, and missing D1 bindings.

## Required independent gates before a live Queue test
1. Verify current main SHA, protected environment `general-ai-private-staging`, and independent `thusico` approval against the exact source commit.
2. Verify Queue and D1 are dedicated staging resources; prove neither points to production D1, production Worker, customer Queue, or customer data.
3. Produce a staging-only test consumer or protected temporary configuration with **no public routes**, no provider credentials, and a test-only envelope. Keep existing production and default inert consumer configuration unchanged.
4. Define a unique test nonce and trace ID; capture Queue delivery ID, attempt count, acknowledgment outcome, and D1 claim hash without storing prompts, secrets, or personal data.
5. Prove exactly one eligible test delivery is acknowledged; prove a duplicate nonce is rejected with no second downstream invocation. Verify negative paths (missing binding, bad envelope, missing source approval) fail closed.
6. Verify retry and dead-letter behavior in a **separately approved** staging-only configuration. The existing consumer sets `max_retries=0`; do not claim retry coverage without a distinct explicit test and policy review.
7. Verify failure recovery, timeout behavior, audit evidence integrity, and immutable source-SHA linkage; upload redacted evidence artifacts.
8. Restore all staging acceptance switches to `false`, verify consumer inertness, and require independent security sign-off before any production-release proposal.

## Explicit release exclusions
- Passing the D1 nonce test does **not** prove live Queue delivery, ledger isolation across all operations, retry handling, production recovery, or customer safety.
- No payment/POP activation, General AI production release, customer traffic, or automatic production writes are authorized by this plan.
- A protected deployment approval is distinct from independent source review and production-write authorization.

## Exit criteria
A subsequent PR must implement the isolated, fail-closed live Queue qualification runner and its offline tests. Only after its CI passes, `thusico` approves, the staging resource and credential boundaries are independently checked, and a protected test run uploads evidence can this gate be marked qualified.
