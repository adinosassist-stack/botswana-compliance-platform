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
- Production wiring still requires the experimental accounting schema to be qualified for deployment and reviewed activation. Financial-position grounding is available through the internal pilot. No new credentials, production variables, migrations or provider activation are included here.

## OpenAI adapter
- `runOpenAIModelObservation` composes the cost runner with a server-only Responses API adapter using the existing `OPENAI_API_KEY` configuration. It is not mounted as a public route.
- Both `AGENT_MODEL_EXECUTION_ENABLED=1` and `AGENT_MODEL_OPENAI_ENABLED=1` are required, along with catalog approval, explicit pricing and a tenant budget. The adapter independently checks its enable flag, approved model and output-token ceiling before dispatch.
- The only endpoint is `https://api.openai.com/v1/responses`; redirects and automatic retries are disabled. Requests use `store: false`, `stream: false` and `tools: []`. Tenant and actor identifiers are not added to the provider request.
- Catalog IDs must pin the expected response model. A model mismatch or missing usage keeps the budget reserved for reconciliation. Incomplete output with valid usage is still billed through settlement but is not returned as a successful answer.
- Raw provider response bodies are bounded to 1 MiB before parsing. The runner bounds returned text and imposes an abort timeout. Raw upstream error details and credentials are not returned.
- API contract reference: [OpenAI Responses creation](https://developers.openai.com/api/reference/resources/responses/methods/create).

### Authoritative financial observation pilot

`runGroundedFinancialObservation` is an internal entry point with no HTTP route. It accepts only a run ID and routing budget/region constraints, snapshots the authenticated owner/manager identity, and calls the existing `financial_position.read` tool. Caller prompts, facts, tenant overrides and model catalogs are rejected. Missing source tables or a runtime denial stop before any reservation or provider call. The server constructs the prompt from the returned tenant-scoped database snapshot and supplies BWP minor-unit definitions and recorded-data limitations. Success returns that snapshot with its source reference, policy version and read timestamp separately from the advisory narrative. `outputVerified` remains false: supplying authoritative context does not validate every statement generated by a model. The read timestamp marks retrieval, not bank verification or a transactionally consistent snapshot across all source queries.

The new real-SQLite regression applies the integrated baseline plus forward migrations 044–067, then reapplies the experimental accounting schema. It checks foreign-key integrity, disabled budgets, tenant-isolated financial figures, reservation-before-provider order, settlement, duplicate suppression and unavailable-source rejection. All provider responses are synthetic; no live API calls or production migrations are performed.

The fresh-install experimental ledger now links budgets to tenants and cascades reservations, events and purge markers with the tenant. Live-tenant ledger deletion remains forbidden. A legal hold or any reserved provider cost blocks purge. New reservations are rejected once a deletion request is approved, processing, failed or blocked; settlement remains possible for existing reservations. Unknown provider usage must be reconciled before deletion, not released merely to make purge succeed.

The existing worker writes its minimal tombstone before deleting orphan users and then the tenant in one D1 batch. Because deleting the user can cascade away the deletion request, an accounting trigger captures the valid processing claim when that tombstone is inserted, using a tenant-scoped purge authorization. This marker is removed by tenant cascade. Claim validation and the cost/hold checks occur before user deletion; an invalid claim, active hold or pending cost aborts the batch. A canceled originating request cannot authorize tenant deletion while it still exists. The raw ledger is retained while the tenant is live and removed by this existing governed purge, leaving only the existing minimal tombstone. This implements the application's current deletion policy; it does not establish a new statutory retention period.

`agent-cost-tenant-purge.mjs` runs the actual worker finalizer extracted from source against the integrated baseline and migrations 044–067. It checks stale claims, forged authorizations, hold enforcement, pending-cost reconciliation, new-reservation denial, immutable live journals, atomic rollback, full ledger cascade, another tenant's preservation, reapplication and foreign-key integrity. Model/ledger integration fixtures now use this same baseline and forward chain.

The experimental SQL is a fresh-install definition, not an upgrade for any previously created accounting tables. Reapplication preserves rows but cannot add foreign keys to an older table definition. Production promotion still requires an explicit reviewed numbered migration, existing-schema inspection, D1 transport qualification and activation review. The experimental schema is not added to the deployment migration chain, and the reviewed migration tip remains 067. No live provider calls or production purge/migration operations are performed by these tests.
