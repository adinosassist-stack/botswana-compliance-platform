# Goal-driven agent workflows — implementation contract

Status: proposed, default-off. This document does not authorize autonomous execution or production activation.

## User experience
The AI Dock accepts a business objective and displays a task card with status, scope, data sources, proposed actions, approval requirements, and an audit timeline. The Owner Command Centre aggregates pending approvals, exceptions, completion rates and cost per completed workflow.

## Initial workflows
1. Reconciliation: read authorized ledger data, match transactions deterministically, surface unmatched items.
2. Supplier payments: validate invoice duplicates, supplier identity and balances, then produce a payment proposal. Never initiate or activate payment.
3. Expense review: flag anomalous transactions with explainable rules; require human disposition.

## State machine
draft -> validated -> awaiting_approval -> approved -> executing -> completed
Any pre-execution state -> cancelled; executing -> failed or completed. Retry requires a new idempotency key or an explicitly safe, fenced retry.

## Required admission controls
- Feature flag disabled by default for every tenant and environment.
- Tenant and actor authorization checked on every read and transition.
- Server-generated workflow IDs, monotonic versions, scoped idempotency keys.
- Immutable append-only transition log with actor, timestamps, source hashes and policy version.
- Tool allowlist and read-only execution by default; deny arbitrary code, external requests and unapproved connectors.
- Payment execution, payroll changes, regulatory submissions and data export remain prohibited until separately reviewed, approved and enabled.
- Deterministic finance computations; LLM output never authoritative for balances or permissions.
- Bound execution time, steps, tokens, monetary budget and retry counts; fail closed.
- Human approvals tied to exact proposal digest and tenant-scoped permission; reject stale proposals.
- No production rollout before security review, tests, release checks and independent approval.

## Acceptance tests
- Cross-tenant and role escalation attempts fail closed.
- Duplicate request and concurrent approval cannot double-execute.
- Edited proposals invalidate previous approvals.
- Disabled flag rejects admission and execution.
- Expired leases and retries cannot bypass fencing.
- Payment proposal never sends money.
- Dashboard only exposes authorized, audit-backed workflow data.
- Prompt injection in invoices cannot modify tools, roles or policy.
- AI provider outage preserves workflow state without autonomous retries beyond limits.

## Release sequence
A: implement shared schemas, default-off flags, state machine and tests.
B: read-only reconciliation and invoice proposal tools.
C: dock task cards and Owner Command Centre telemetry.
D: independently reviewed pilot with synthetic data; production activation remains separate.
