# Agent runtime and cost-accounting gap audit — 2026-10-10

Tracking: #1246, #1270. Scope: evidence and test plan only; no activation, migrations, or production mutations.

## Existing controls verified by source inventory
- `cloudflare/src/agent-runtime-guard.js`: deterministic action authorization, tenant checks, kill switch and budget gates (see `docs/AGENT_RUNTIME_GOVERNANCE.md`).
- `cloudflare/src/jit-capability-governance-entry.js` and `agent-capability-security.js`: bounded task capability issuance and execution boundary.
- `cloudflare/src/agent-cost-execution-boundary.js`: guard-before-reservation, tenant/actor/agent identity binding; explicitly experimental.
- `cloudflare/src/agent-cost-{admission,reservations,outcome-telemetry}.js`: cost controls and accounting components.
- Existing security and regression workflows: `agent-capability-security-ci.yml`, `agent-runtime-guard-regression.yml`, `agent-cost-accounting.yml`.
- Production Release 463 runs the reviewed `platform_admin_canary` only. The legacy global compatibility flag `AGENT_BOUNDED_TASK_EXECUTION_ENABLED` is explicitly pinned to `0`, so the canary cannot be widened by a retained production variable.

## Unverified / blocked until evidence
1. Production D1 cost-accounting migration and transactional semantics, including concurrent reservations and append-only ledger permissions, remain blocked pending explicit promotion evidence.
2. General customer or autonomous execution remains blocked. The Release 463 platform-admin canary does not authorize broader execution.
3. End-to-end retry, fallback, expiry, revocation, cross-tenant, policy-outage and kill-switch races at the actual execution boundary still require broader evidence beyond the reviewed canary path.
4. Cost accounting: BWP minor-unit arithmetic, unknown usage handling, stale reservation reconciliation, provider fallback accounting, per-tenant budgets and operator alerting.
5. Audit integrity, retention and correlation IDs across proposal -> approval -> execution -> outcome.
6. UI evidence for owner-visible authorization and verified/unverified ROI, with mobile and CSP regressions, before any broader activation.

## Safe implementation sequence
1. Record a control matrix linking each #1246 acceptance criterion to source, existing test and missing adversarial test.
2. Preserve the Release 463 canary boundary while adding failing regression tests for uncovered paths; patch the canonical guard/entrypoint only, never introduce parallel approval logic.
3. Validate cost-accounting migration in disposable Cloudflare D1 with actual runtime, concurrent reservation/retry and rollback evidence.
4. Run agent, finance, tenancy, UI and supply-chain CI; obtain security review.
5. Keep broader execution and cost-accounting feature flags disabled by default. Require separate approved production promotion; do not modify `release/production.json` in this workstream.

## No-go rules
Never treat cost reservation as execution authority. No unrestricted credentials, uncontrolled messaging, transfers, payroll changes, filings, signatures, employment termination, financing acceptance, journal posting, or other production side effects outside separately governed allowlists. Policy unavailability must fail closed. Production Release 463 remains unchanged by this PR; the reviewed platform-admin canary is the only permitted bounded-task execution posture and the legacy global compatibility flag remains disabled.

## Security acceptance evidence matrix (review checkpoint)

| Acceptance case | Current evidence | Required before broader activation |
| --- | --- | --- |
| Cross-tenant actor/target/agent/cost reservation | `tests/agent-runtime-cost-adversarial-20261010.mjs` exercises denied-path identity mismatches before D1 | End-to-end tenant boundary and capability enforcement on every tool call |
| Missing policy, disabled agent, kill switch | Adversarial denied-path tests assert no database access | Live execution boundary test when policy provider is unavailable or changes mid-run |
| Expired/revoked grants, tool/operation/resource scope | Canonical capability governance modules inventoried; Release 463 retains reviewed JIT/canary constraints | Execute/retry/fallback race tests with expiry and revocation between authorization and side effect |
| Concurrent reservations, retries and budget exhaustion | D1 schema has `UNIQUE(tenant_id,agent_id,run_id)`, reservation budget trigger, and transactional batch API | Disposable D1 simultaneous-request test showing one winner, no overrun, no orphan event and deterministic reconciliation |
| Settlement and unknown provider usage | Cost admission rejects unknown usage; settlement requires explicit provider/model/tokens | Provider failure, missing usage, partial usage, retry and fallback accounting scenarios |
| Tamper-evident and tenant-scoped audit | D1 append-only triggers and ledger-gap view in experimental schema | Review write permissions, purge exception governance, retention, correlation and alerting |
| Owner approval and outcome ROI | Guard checks approval payload; Release 463 limits execution to authenticated platform-admin owners under separate delegation, grant, exact-payload approval, Runtime Guard, budget and kill-switch controls | Proposal-to-approval-to-execution-to-outcome E2E tests for any broader audience; unverified benefit clearly labeled |
| Production safety | Release 463 is production sequence 463 and explicitly pins legacy global execution off while retaining `platform_admin_canary`; this PR changes docs/tests/CI only | Independent security sign-off, approved cost migration, and staged promotion with explicit rollback before any broader execution or cost-accounting activation |

### Release decision
**NO-GO for general customer/autonomous agent execution or production cost-accounting activation.** The existing Release 463 `platform_admin_canary` is separately governed and is not widened by this PR. Passing CI establishes only that the checked regressions pass; it does not satisfy the pending concurrency, broader runtime-race, audit, operator, migration, or UI evidence required for expansion. Keep this PR in draft until review; do not merge or deploy on the basis of this matrix alone.

## PR #1323 verification checkpoint — 2026-10-10

The draft PR modifies only `tests/v217-jit-execution-permit.mjs` and `tests/v312-jit-capability-execution-binding.mjs` (184 additions, 2 deletions). All seven GitHub checks passed at `2aaa50426de470c9803cfbe894d93bf527263b57`. These results qualify the test additions, not general execution or cost-accounting activation.

Verified JIT regression cases: single-use and cross-request replay rejection; atomic rollback of multi-request execution after grant revocation; post-approval payload tampering; two independent SQLite connections competing to consume one permit; cross-connection grant revocation; expired permit rejection; and stale preflight authorization invalidated by a later grant revocation. The signature-tampering test now mutates a significant base64url character rather than an unused trailing padding bit.

**Remaining execution gap:** the concurrent SQLite test is not a production D1 end-to-end external-tool execution race. It does not demonstrate cancellation of an already-dispatched side effect after mid-run revocation, and no such rollback guarantee should be claimed.

**Cost-accounting review:** `tests/agent-cost-d1-transport.mjs` verifies budget-trigger rollback for a two-row INSERT, retry uniqueness, suspension and disabled-budget rejection, accounting events and governed purge on disposable local D1. It does **not** launch two simultaneous independent reservation requests. `cloudflare/src/agent-cost-reservations.js` reads a budget before calling `DB.batch`, relying on database triggers to recheck atomic admission; this is a defensible design to test, not proof of the missing concurrency gate. The independent-request, no-overspend, no-orphan-ledger scenario remains **UNVERIFIED**.

**Review decision:** retain draft/no-go for general customer or autonomous execution, and keep production flags and migrations unchanged. Next qualification should exercise simultaneous independent local D1 reservation requests and verify the winning reservation, losing response, budget totals, and ledger correspondence.

## Local D1 concurrency qualification — commit `2a80ef87a3b3e0b542ac34ac11f98d8b813c172e`

GitHub Actions reports **9/9 checks passed**, including `local-d1-transport` and `capability-boundary`. `tests/agent-cost-d1-transport.mjs` now starts two independent Wrangler CLI processes against the same disposable local D1 database, each requesting 60 minor units against a 100-minor-unit budget. The regression asserts exactly one successful process, 60 units reserved, one reservation, one ledger event, no ledger gaps and no foreign-key violations.

**Evidence scope:** This establishes independent-process contention safety in the pinned local Wrangler/D1 test environment, not remote Cloudflare D1 concurrency, production execution, or provider settlement correctness. The test invokes CLI SQL directly, rather than simultaneous HTTP requests through `reserveAgentCost` and the authenticated execution boundary. A remote/staged D1 test, end-to-end authorization/retry behavior and recovery from partial provider outcomes remain outstanding. The general-execution and production cost-accounting **NO-GO** decision remains unchanged.

## PR #1327 CI and release-gate checkpoint — 2026-10-10

PR #1323 was closed without merge; the successor draft PR #1327 carries the regression changes. GitHub reported all **9/9 checks successful** at commit `80969d00927835b32abf0782f077c243307e354d`, including Node/Postgres lifecycle, local D1 transport, capability boundary, runtime identity, audit remediation, V81 recovery and the main test job. GitHub reported a clean mergeability state at this checkpoint. This is CI evidence, not independent security sign-off.

The additional `tests/agent-runtime-cost-adversarial-20261010.mjs` outage cases directly exercise `reserveAgentCost`: a failed budget read rejects and a failed reservation batch returns a denied decision. The runtime guard can deny a request before any database operation, so these direct function tests **do not** demonstrate a successful guarded execution attempt that encounters an outage downstream. The read path currently propagates a rejected promise rather than returning a normalized fail-closed decision; callers must not treat that exception as permission. Review whether a structured failure result is required by the caller contract.

**Remaining NO-GO gates:** independently review exception handling at the real execution entrypoint; verify remote/staged D1 concurrency and migration; exercise authenticated retry, provider fallback, missing/partial usage and settlement reconciliation; test revocation and kill-switch changes across the actual side-effect boundary; qualify audit retention/operator alerting and owner UI. Keep broader execution and cost accounting disabled and do not merge or deploy as part of this checkpoint.
