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

## Internal model observation runner
- `runAgentModelObservation` orchestrates server-supplied provider adapters. It is not mounted as an HTTP route. Tests use synthetic adapters and mocked HTTP; no live calls were made.
- `AGENT_MODEL_EXECUTION_ENABLED=1` is required, as are owner/manager session context, an approved model catalog entry with `externalProcessingApproved: true`, explicit BWP-minor token pricing and a bounded input/output configuration.
- Before dispatch it snapshots identity and prompt, applies the existing read Runtime Guard, reserves cost through the existing transactional ledger and rechecks runtime controls. Duplicate tenant/agent/run IDs cannot invoke the adapter twice.
- Input-byte bounds plus catalog-configured input overhead and the output-token ceiling determine the conservative reservation. Provider-reported usage is priced using that same catalog; no exchange rate or price is hard-coded.
- Usage-priced settlement records budget consumption at configured rates, not a reconciled provider invoice. Successful results retain `providerBillVerified: false` and identify their cost basis.
- Missing usage, timeout, adapter errors or failed settlement retain the reservation for reconciliation. A runtime denial before dispatch releases it. Invalid output with valid usage is still settled. Raw adapter errors are not returned.
- Successful text remains `outputVerified: false` and `executionAllowed: false`; this is neither financial-answer verification nor tool-action authority.
- Production wiring still requires the experimental accounting schema to be qualified for deployment and authoritative-data grounding. No new credentials, production variables, migrations or provider activation are included here.

## OpenAI adapter
- `runOpenAIModelObservation` composes the cost runner with a server-only Responses API adapter using the existing `OPENAI_API_KEY` configuration. It is not mounted as a public route.
- Both `AGENT_MODEL_EXECUTION_ENABLED=1` and `AGENT_MODEL_OPENAI_ENABLED=1` are required, along with catalog approval, explicit pricing and a tenant budget. The adapter independently checks its enable flag, approved model and output-token ceiling before dispatch.
- The only endpoint is `https://api.openai.com/v1/responses`; redirects and automatic retries are disabled. Requests use `store: false`, `stream: false` and `tools: []`. Tenant and actor identifiers are not added to the provider request.
- Catalog IDs must pin the expected response model. A model mismatch or missing usage keeps the budget reserved for reconciliation. Incomplete output with valid usage is still billed through settlement but is not returned as a successful answer.
- Raw provider response bodies are bounded to 1 MiB before parsing. The runner bounds returned text and imposes an abort timeout. Raw upstream error details and credentials are not returned.
- API contract reference: [OpenAI Responses creation](https://developers.openai.com/api/reference/resources/responses/methods/create).
