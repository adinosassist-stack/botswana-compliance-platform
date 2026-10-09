# Agentic AI architecture audit — 2026-10-09

Tracking: #1270. Branch: `chatgpt/agentic-governance-audit-20261009`.

## Verified repository facts
- `cloudflare/src/worker.js` imports `owner-operator-api.js`, `finance-watch-durable-loop.js`, `business-goal-durable-loop.js`, `business-context.js`, and `business-memory.js`. Therefore, avoid building duplicate Owner Goals or context infrastructure.
- `server/server.js` uses Express, Zod, PostgreSQL, and an object-store evidence workflow.
- `package.json` includes `check:agent-evals`, a release gate, security tests, environment validation and multiple regression suites. Preserve these checks.

## Next implementation steps (no production behavior changed)
1. Inspect existing goal-loop, owner-operator, business-context and AI adapter modules in full, including tenant scoping and authorizations.
2. Map each consequential tool/action to its current policy enforcement and audit event.
3. Identify existing provider routing, fallback, retries, token accounting and cost caps before adding abstractions.
4. Implement a **deny-by-default policy decision function** with tests first; connect it only behind a disabled feature flag.
5. Introduce per-goal cost/outcome instrumentation without logging secrets or sensitive prompt payloads.
6. Add integration tests covering cross-tenant access, replay, approval bypass, prompt injection, provider failure, budget exhaustion and kill-switch behavior.
7. Run current release checks in CI; require staging verification and explicit approval before merge/deployment.

## Security invariants
- The model cannot authorize its own tools; enforcement occurs server-side.
- Owner approval for payments, payroll, regulatory submissions, destructive operations and consequential People changes.
- Idempotent execution, bounded retries, tenant isolation, auditability and emergency revoke.
- No hardcoded claims about model releases, API availability or prices; independently verify vendor documentation.

## Status
Repository reconnaissance completed; this is an audit plan, **not** a claim that the control plane or model router has been implemented. No production deployment authorized.
