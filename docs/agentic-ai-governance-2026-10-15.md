# Agentic AI governance implementation — 15 October 2026

Status: architecture and release contract; no autonomous production actions enabled.

## Non-negotiable execution policy
- All money movement, reconciliation posting, payroll, tax submissions, CIPA/BURS filings, deletion, access changes and external communications require an authenticated, tenant-scoped human approval before execution.
- Agents may read authorized records and prepare drafts only. Approval must bind tenant ID, actor ID, operation, canonical argument digest, expiry, and one-time nonce; execution must re-check authorization and reject replay.
- Never interpret model-generated text as authority to execute. Tool allowlists, least-privilege credentials, and tenant isolation are enforced outside the model.
- Persist append-only event evidence: task created, tool proposed, policy decision, approval, execution result, cancellation, with timestamps and correlation IDs. Redact secrets and personal data; implement retention and access policies.
- Add per-tenant quotas, model/provider spend caps, timeouts, retry limits, idempotency keys, circuit breakers and an emergency kill switch. Fail closed when governance storage or authorization is unavailable.
- Explicitly prohibit autonomous financial execution until independent security review and production release gates pass.

## Owner Command Centre
Implement an accessible compact workspace panel with:
1. Awaiting my approval — action, impact, requester, expiry, approve/reject with reauthentication for sensitive operations.
2. In progress — resumable task status, next step, stop action.
3. Completed — outcome, evidence link, time saved (measured, never fabricated).
4. Exceptions — failed tasks, permissions, cost cap and retry exhaustion.

## Pilot tasks
- Draft overdue invoice follow-ups (send only after approval).
- Suggest reconciliation matches (posting only after approval).
- Prepare compliance deadline reminders (filing only after approval).
- Summarize employee onboarding exceptions (no autonomous HR changes).

## Release acceptance tests
- Cross-tenant access rejected; stale/replayed approval rejected.
- Prompt injection cannot trigger an unapproved tool call.
- Double-submit cannot duplicate a transaction.
- Provider timeout and missing audit store fail closed.
- Kill switch stops pending execution; all changes have auditable provenance.
- Mobile owner approvals, keyboard accessibility, and agent status refresh without page reload.
- Existing voice and dock behavior preserved; no overlay obstruction.
- Validate pricing per task and per tenant against explicit budget ceilings.

## Rollout
Botswana pilot first; Namibia next. Feature flag disabled by default. Collect completion rate, correction rate, approval latency, cost per successful task and security incidents before widening access.
