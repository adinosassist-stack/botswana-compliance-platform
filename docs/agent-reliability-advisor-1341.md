# Agent Reliability Engine — advisor-first implementation plan

Tracking: #1341. This document is a development specification, not a production release authorization.

## Existing components to reuse
- `cloudflare/src/agent-evaluation.js`: deterministic guard scenarios and regression evaluation.
- `cloudflare/src/agentic-learning.js`: evidence-weighted proposal ranking; association is not causation.
- `cloudflare/src/agent-runtime-guard.js`: canonical execution authorization, tenant boundaries, budget and kill-switch checks.
- `cloudflare/src/agent-cost-*.js`: experimental cost reservation/accounting. Do not treat reservation as authorization.
- `docs/agent-runtime-gap-audit-2026-10-10.md`: unresolved launch blockers and no-go criteria.

## First implementation slice
1. Create an append-only, tenant-scoped run summary schema in a disposable test environment, with trace ID, workflow key, actor/agent IDs, authorization decision, redacted tool identifier, outcome category, model identifier, token counts, BWP minor-unit cost, and timestamp. Never record prompts, raw tool arguments, secrets or sensitive financial payloads by default.
2. Add a pure evaluator mapping sanitized run summaries to success, denied-action, regression, timeout and cost-limit outcomes. Unknown or missing evidence must be marked unverified.
3. Add an advisor-only recommendation generator consuming aggregate evaluations; it must not call execution tools or write to runtime policy/configuration.
4. Add adversarial tests for cross-tenant correlation, secret redaction, missing cost usage, revoked approval, prompt injection and fail-closed policy outages.
5. Expose owner-only summaries behind a default-off feature flag only after tests pass.

## Explicit release constraints
No automatic self-editing, merging, deployments, autonomous external submissions or expansion of existing execution permissions. Preserve Release 463 canary boundary and disabled legacy global execution flag. Keep changes isolated until CI and security review, and do not activate production D1 migrations.

## Exit criteria
Evidence-backed metrics, tests passing, rollback plan, human-reviewed PR, and independent promotion decision. Botswana-first launch with Namibia-ready tenant/currency abstractions.

## Refresh status — 2026-10-14

Draft PR #1510 ports the pure advisor, read-only telemetry adapter and owner-only API to current main. The worker routes GET `/api/ai/operator/reliability` only after the existing authenticated API security gates. The API requires an authenticated owner, tenant-scoped DB query and `THEBE_AGENT_RELIABILITY_ADVISOR_ENABLED=true` (default off). CI verifies API tenant isolation, default-off behavior, and worker route ordering. No owner UI has been ported and no production flag is enabled. Do not merge or deploy without independent review, runtime smoke testing and rollback signoff.
