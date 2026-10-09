# Agentic platform implementation gate — 2026-10-09

## Goal
Implement a model-independent, governed agent execution layer for Thebe Desk without weakening existing tenant isolation, approvals, or audit evidence.

## P0: Control plane and MCP
- Inventory existing agent task persistence, permission checks, audit receipts and MCP endpoints; reuse rather than duplicate.
- Expose read-only, tenant-scoped Finance, Compliance, People and Property tools behind authenticated, explicit per-tool scopes.
- Deny write actions by default. Require actor identity, tenant context, approval token, idempotency key and durable audit receipt for writes.
- Validate MCP input schemas; reject cross-tenant resource IDs and prompt-injected tool requests.
- Add adversarial tests for unauthorized calls, duplicate execution, expired approvals and connector failures.

## P1: Cost-aware model routing
- Introduce provider-neutral model capability configuration, with task-class routing and per-tenant budgets.
- Keep provider pricing configurable, not hard-coded from announcements.
- Benchmark candidate low-cost models using existing Thebe evaluation cases before enabling production routing.
- Track token spend, task completion, failure, latency and human intervention.

## P1: Grounded conversational analytics
- Build read-only natural-language analytics from authoritative tenant-filtered metrics.
- Return provenance, date ranges and calculation definitions with every financial answer.
- For actions suggested by analytics, create approval-required proposals rather than executing writes.

## Release gates
- Run existing agent, finance, tenancy, security, regression and release checks.
- Keep all new integrations feature-flagged and disabled by default.
- No production deploy or merge until CI and security review pass.

## Read-only model preflight configuration
- `AGENT_MODEL_PREFLIGHT_ENABLED=1` explicitly enables the authenticated preflight endpoint. Missing or other values keep it disabled; this change does not set production variables.
- `AGENT_APPROVED_MODELS_JSON` is the operator-owned model catalog. Requests cannot replace it or supply tenant/actor authority.
- The endpoint applies the existing read-tool Runtime Guard using the authenticated session and server-owned runtime enable, kill-switch and budget-status controls.
- A successful response reports the guard version and always retains `executionAllowed: false`. It is an advisory model selection, not a tool-execution grant or a cost reservation.
- `budgetUsd` is a selection ceiling, not proof of available tenant funds. Actual model calls still require authoritative usage accounting, budget reservation and a fresh runtime decision before execution.
