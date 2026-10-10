# Thebe Desk Agent Runtime Governance

## Purpose

Thebe Desk uses one canonical Thebe agent. Models may propose work, but deterministic platform controls remain authoritative and no model can increase its own authority.

The production agent boundary has two distinct lanes:

1. governed read/prepare activity that cannot perform side effects; and
2. a tightly bounded internal `task.create` execution canary that is restricted to an eligible platform-admin owner session and remains subject to deterministic containment, delegation, approval and audit controls.

The canary is **not global autonomous execution** and grants no authority for external or permanently human-only actions.

## Runtime Guard

`cloudflare/src/agent-runtime-guard.js` composes the action catalogue, policy engine, delegated-authority engine and cost admission checks.

The guard fails closed when any of the following is true:

- the action is unknown;
- authenticated tenant scope is missing;
- actor, target and authenticated tenant do not match;
- the agent is disabled;
- the tenant/platform kill switch is active;
- the applicable AI/action budget is exceeded;
- an approval is missing its exact payload binding or is bound to a stale payload;
- the action is permanently human-only;
- the action is not enabled for the requested launch phase;
- the existing agent policy rejects the action;
- delegated authority rejects the action; or
- execution is requested without deterministic execution authority.

The generic Runtime Guard does not decide whether a browser session is a production canary participant. Canary eligibility is established by the bounded-task handler before that handler passes execution authority into the Runtime Guard.

## Production bounded-task canary

The only production bounded execution lane described here is the internal `task.create` path in `cloudflare/src/agentic-task-execution.js`.

Production mode is expected to remain exactly:

`AGENT_BOUNDED_TASK_EXECUTION_MODE="platform_admin_canary"`

The production preflight rejects drift away from the reviewed canary value. The legacy `AGENT_BOUNDED_TASK_EXECUTION_ENABLED=1` compatibility flag maps to global mode in code and therefore must not be introduced into the reviewed production canary configuration.

A session is eligible for canary execution only when all of the following remain true:

- execution mode is exactly `platform_admin_canary`;
- the authenticated session role is `owner`;
- the authenticated email is already present in `PLATFORM_ADMIN_EMAILS`;
- the canonical Thebe control-plane authority is ready and permits execution;
- the bounded-execution schema is ready;
- an active same-tenant `task.create` delegation exists;
- a separate active execution grant exists for that delegation;
- the prepared payload has exact owner approval bound to its stored payload hash;
- the required single-use JIT execution permit is valid and belongs to the same owner;
- Runtime Guard tenant, agent, kill-switch, budget, phase, delegation and daily-cap checks pass; and
- authoritative D1 write/read-back, receipt, idempotency and audit controls succeed.

Managers, ordinary customer owners, non-allowlisted owner emails, unknown/off modes and contained canonical authority remain fail-closed during the canary.

## Delegation and execution authority

`agent_delegations` remains the durable delegated-authority record. For bounded internal task execution, the handler additionally requires a separate `agent_execution_grants` record and validates an eligible active `task.create` delegation before presenting it to the Runtime Guard as executable authority.

This separation is deliberate: a delegation by itself does not activate execution, and a production mode/config value by itself does not create authority.

The bounded `task.create` action has no external side effect. The canary does not authorize WhatsApp or other messaging, payments, government/statutory filings, signatures, employment termination, financing acceptance or journal posting.

The following actions remain permanently human-only and cannot be made autonomous by a model, delegation, canary mode or global compatibility flag:

- `payment.execute`;
- `government_filing.submit`;
- `document.sign`;
- `employment.terminate`;
- `financing.accept`; and
- `journal_entry.post`.

## Evaluation harness

`cloudflare/src/agent-evaluation.js` contains a deterministic replay suite for the agent safety boundary. It covers governed reads/prepares, unknown actions, missing tenant scope, cross-tenant attempts, disabled agent state, kill-switch enforcement, budget exhaustion, stale approvals, permanent human-only actions, disabled bounded execution and prompt-injection attempts to expand authority.

`scripts/agent-evaluation-gate.mjs` fails the release gate on any scenario failure, false allow or execution escape.

## Canary regression gate

`tests/v100-platform-admin-task-canary.mjs` is the explicit production-canary eligibility regression. It proves the reviewed execution-mode parsing and the owner/email eligibility matrix, verifies that canary mode is not treated as global execution, checks production Wrangler/preflight drift controls, and confirms that browser UI cannot set the execution mode.

`.github/workflows/agent-runtime-guard-regression.yml` runs both the generic Runtime Guard regression and V100 canary regression when Runtime Guard, delegated authority, bounded-task execution, production canary configuration, preflight, owner UI, canary tests or this governance boundary change.

Any regression failure must block the affected pull request. Do not weaken the assertions to make an intended authority expansion pass; an authority expansion requires a separate reviewed release decision and new adversarial evidence.

## Model/provider qualification

When Thebe introduces or changes a model/provider, proposed tool calls must still pass the same deterministic policy and runtime controls before any production use. A model/provider may improve recommendation quality, but it cannot increase authority.

## Fail-closed operating rule

Deployment success, schema availability, a delegation, an execution grant, an approval, a JIT permit or canary membership is never sufficient alone. Bounded execution is permitted only when the complete control chain agrees on the exact request at execution time.

General customer/autonomous execution remains outside this canary. Any move beyond the reviewed platform-admin owner canary requires an explicit release decision, regression expansion, adversarial review and exact-SHA production qualification.
