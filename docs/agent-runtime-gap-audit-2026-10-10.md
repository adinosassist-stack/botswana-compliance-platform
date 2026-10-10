# Agent runtime and cost-accounting gap audit — 2026-10-10

Tracking: #1246, #1270. Scope: evidence and test plan only; no activation, migrations, or production mutations.

## Existing controls verified by source inventory
- `cloudflare/src/agent-runtime-guard.js`: deterministic action authorization, tenant checks, kill switch and budget gates (see `docs/AGENT_RUNTIME_GOVERNANCE.md`).
- `cloudflare/src/jit-capability-governance-entry.js` and `agent-capability-security.js`: bounded task capability issuance and execution boundary.
- `cloudflare/src/agent-cost-execution-boundary.js`: guard-before-reservation, tenant/actor/agent identity binding; explicitly experimental.
- `cloudflare/src/agent-cost-{admission,reservations,outcome-telemetry}.js`: cost controls and accounting components.
- Existing security and regression workflows: `agent-capability-security-ci.yml`, `agent-runtime-guard-regression.yml`, `agent-cost-accounting.yml`.

## Unverified / blocked until evidence
1. Production D1 migration and transactional semantics, including concurrent reservations and append-only ledger permissions. Existing release-gate document says no-go.
2. End-to-end retry, fallback, expiry, revocation, cross-tenant, policy-outage and kill-switch races at the actual execution boundary, not only isolated guard tests.
3. Cost accounting: BWP minor-unit arithmetic, unknown usage handling, stale reservation reconciliation, provider fallback accounting, per-tenant budgets and operator alerting.
4. Audit integrity, retention and correlation IDs across proposal -> approval -> execution -> outcome.
5. UI evidence for owner-visible authorization and verified/unverified ROI, with mobile and CSP regressions.

## Safe implementation sequence
1. Record a control matrix linking each #1246 acceptance criterion to source, existing test and missing adversarial test.
2. Add failing regression tests for uncovered paths; patch the canonical guard/entrypoint only, never introduce parallel approval logic.
3. Validate migration in disposable Cloudflare D1 with actual runtime, concurrent reservation/retry and rollback evidence.
4. Run agent, finance, tenancy, UI and supply-chain CI; obtain security review.
5. Keep new feature flags disabled by default. Require separate approved production promotion; do not modify `release/production.json` in this workstream.

## No-go rules
Never treat cost reservation as execution authority. No unrestricted credentials, uncontrolled messaging, transfers, payroll changes, filings or production mutations. Policy unavailability must fail closed. Production Release 462 remains unchanged.
