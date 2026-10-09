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

The new real-SQLite regression applies the integrated baseline plus forward migrations 044–068, then reapplies the experimental accounting schema. It checks foreign-key integrity, disabled budgets, tenant-isolated financial figures, reservation-before-provider order, settlement, duplicate suppression and unavailable-source rejection. All provider responses are synthetic; no live API calls or production migrations are performed.

The fresh-install experimental ledger now links budgets to tenants and cascades reservations, events and purge markers with the tenant. Live-tenant ledger deletion remains forbidden. A legal hold or any reserved provider cost blocks purge. New reservations are rejected once a deletion request is approved, processing, failed or blocked; settlement remains possible for existing reservations. Unknown provider usage must be reconciled before deletion, not released merely to make purge succeed.

The existing worker writes its minimal tombstone before deleting orphan users and then the tenant in one D1 batch. Because deleting the user can cascade away the deletion request, an accounting trigger captures the valid processing claim when that tombstone is inserted, using a tenant-scoped purge authorization. This marker is removed by tenant cascade. Claim validation and the cost/hold checks occur before user deletion; an invalid claim, active hold or pending cost aborts the batch. A canceled originating request cannot authorize tenant deletion while it still exists. The raw ledger is retained while the tenant is live and removed by this existing governed purge, leaving only the existing minimal tombstone. This implements the application's current deletion policy; it does not establish a new statutory retention period.

`agent-cost-tenant-purge.mjs` runs the actual worker finalizer extracted from source against the integrated baseline and migrations 044–068. It checks stale claims, forged authorizations, hold enforcement, pending-cost reconciliation, new-reservation denial, immutable live journals, atomic rollback, full ledger cascade, another tenant's preservation, reapplication and foreign-key integrity. Model/ledger integration fixtures now use this same baseline and forward chain.

The experimental SQL is a fresh-install definition, not an upgrade for any previously created accounting tables. Reapplication preserves rows but cannot add foreign keys to an older table definition. Migration 068 now stages this same schema in the forward chain. Production application still requires existing-schema inspection, a recovery bookmark, a server-owned transport and activation review. The candidate migration tip is 068; no production migration has been applied. No live provider calls or production purge/migration operations are performed by these tests.

### Local D1 transport qualification

`npm run test:agent-cost-d1` uses the lockfile-pinned Wrangler 4.135.0 CLI with an isolated, synthetic D1 binding, a temporary configuration and explicit `--local` on every invocation. It removes Cloudflare credential variables from the child environment and runs from the temporary directory so repository environment files and production configuration are not loaded. The database and SQL files are removed after the run.

The test imports the integrated baseline, forward migrations 044–068 and experimental ledger through Wrangler's SQL-file transport, then reapplies the ledger. It verifies foreign-key integrity, orphan rejection, disabled budgets, atomic reservation triggers, duplicate rejection, tenant-mismatched events, usage accounting, pending-deletion admission, live-journal protection, legal holds and the worker's tombstone → orphan-user → tenant purge order. The minimal tombstone and the other tenant's budget survive. The dedicated accounting workflow installs exact lockfile dependencies and runs this qualification in its own job.

This establishes compatibility with Wrangler's local D1 runtime and transport, not a completed production migration or a remote D1 verification. The actual worker finalizer and transaction rollback remain covered by the separate SQLite batch regression. Production still needs approval of migration 068, inspection of any pre-existing accounting objects, a recovery bookmark, a server-owned transport and guarded activation.

### Read-only accounting schema inspection

`inspectAgentCostSchema(query)` prepares the migration decision without selecting a database or applying a change. A server-owned query transport supplies rows for fixed `SELECT` and `PRAGMA` statements. The inspector verifies the ledger source SHA-256 against `scripts/manifests/agent-cost-schema.json`, checks the required tenant/deletion columns and existing foreign-key integrity, and compares all 28 accounting object definitions against the pinned manifest. Definition comparison is deliberately strict: even formatting drift can require review. Object names alone do not establish compatibility.

An absent ledger returns `accounting_schema_absent` with `readyForReviewedFreshInstall: true`; an exact match returns `accounting_schema_compatible` with `migrationRequired: false`. Legacy tables, missing or altered objects, extra accounting objects, absent prerequisites and foreign-key violations are blocked. Every result retains `migrationAllowed: false` and `executionAllowed: false`. This is inspection evidence for a future migration runner, not migration authority, an activation decision or certification of the complete release migration chain.

Regression tests verify absent/current/legacy/partial/altered schemas, unexpected objects, missing dependency columns, storage failure and foreign-key violations, including that inspection does not change database rows. The local D1 transport regression also runs this same inspector before and after installing the ledger. Both dedicated accounting jobs and the release regression entry point include these checks. No production connection or schema inspection was performed in this increment.


### Migration 068 candidate and guarded runner

`068_agent_cost_accounting.sql` is the byte-identical numbered form of the qualified accounting definition. The manifest pins this numbered file. The release profile, agentic readiness delta, deployment guidance and migration-tip regressions advance to 068 while preserving migration 067 in the forward chain. `ledgerSchemaReady` checks the presence of all 28 required accounting objects and probes its tables; a missing ledger or required database guard fails readiness. This check grants no provider or mutation authority. The full definition hashes remain enforced by the migration inspector.

`runAgentCostMigration` is server-owned orchestration with injected query, recovery-bookmark and reviewed-SQL transports. It defaults to a read-only plan. Apply mode requires an exact source SHA-256, an absent compatible starting point and a nonempty recovery bookmark. It reinspects after bookmark capture, verifies the source again, passes the pinned SQL snapshot to the trusted transport, and requires exact post-apply schema verification. Existing compatible schemas are a no-op; old, partial or changed schemas are rejected. Apply or verification failure returns the bookmark for operator reconciliation, without automatic retry or destructive rollback. No budget is provisioned or enabled and no activation flag is changed.

The migration regression covers planning, source pinning, missing bookmarks, schema races, generic transport errors, post-apply verification, repeat application, disabled budgets and readiness failure when a guard is missing. Local D1 qualification now installs the numbered file. This increment does not select a production database or add a production workflow trigger; the trusted transport and existing release-governance checks must be connected before production use.

### Production workflow and transport

`migrate-production-agent-cost-accounting.yml` is manual-only and defaults to `plan`. It is not triggered by pushes, pull requests or merging this PR. The job shares the existing `thebe-desk-production` concurrency group, uses the production environment, requires owner dispatch on main and checks a clean immutable checkout against the supplied full SHA. Dependency installation occurs before credentials are introduced. Credentials are confined to the gated operation step.

The production authority checker requires current-main two-parent merged-PR provenance, exact-head Audit and accounting qualification, successful current-main Recovery and Mobile qualification, and an exact-main Legacy Orphan workflow dispatch. It requires documented three-pass review evidence in the merged PR body, bound to the PR head, with no unresolved findings and activation HOLD. It selects the latest matching CI run, so an older green run cannot override a newer failure. Before applying SQL it checks authority again. The review marker below is a machine-readable summary of actual documented review; it must not be added until those passes are complete:

```json
{"headSha":"<reviewed PR head SHA>","sourceScope":"pass","runtimeSecurity":"pass","evidenceIntegrity":"pass","unresolvedFindings":0,"activation":"HOLD"}
```

Place that summary inside `<!-- THEBE_AGENT_COST_REVIEW ... -->` alongside the three-pass review notes. This is owner-authorized evidence under `docs/RELEASE_GOVERNANCE.md`, not an assertion of independent human approval.

The fixed Cloudflare transport verifies the configured account/database UUID against database name `bw-compliance-os`. Inspection permits only the three fixed metadata-query strings used by the inspector. Apply requires the pinned SQL snapshot, a recovery bookmark written to the workflow step summary, a fresh authority check and another target verification. Pinned Wrangler 4.135.0 executes the snapshot from a temporary, generated D1-only configuration. It does not load repository environment files or build commands. The Wrangler child receives the required Cloudflare token; GitHub, model and application secrets are removed from its environment. Temporary SQL/configuration files are deleted after execution. No retries, destructive rollback, Worker deployment or model activation are performed.

After apply, including an already-applied no-op, the wrapper checks the currently deployed application's readiness without forwarding credentials. Unhealthy readiness returns a failure for reconciliation. The supported metadata and recovery endpoints were checked against Cloudflare's official [database metadata API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/) and [bookmark API](https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/get_bookmark/).

The integrated regression uses synthetic tokens, mocked GitHub/Cloudflare/application HTTP and a mocked Wrangler process backed by real SQLite. It covers read-only planning, invalid dispatch context, stale authority, missing review, a newer failed qualification run, wrong database identity, forbidden SQL, authority drift after bookmark capture, persisted bookmark-before-write order, credential separation, successful application, repeat application, and unhealthy readiness. No live production inspection or workflow dispatch was performed. Remote operation remains blocked until the candidate is merged through the mandatory review gates and exact-main qualification evidence exists.
