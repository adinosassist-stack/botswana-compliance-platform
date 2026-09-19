# Thebe Desk Agent Runtime Governance

## Purpose

Thebe Desk uses one canonical Thebe agent. Models may propose work, but deterministic platform controls remain authoritative.

This runtime governance layer adds two release requirements without enabling new autonomous side effects:

1. every agent tool call must be eligible for deterministic pre-execution policy evaluation;
2. the fixed agent safety evaluation suite must pass before a release is qualified.

## Runtime guard

`cloudflare/src/agent-runtime-guard.js` composes the existing action catalogue and delegated-authority engine.

The guard fails closed when any of the following is true:

- the action is unknown;
- authenticated tenant scope is missing;
- actor, target and authenticated tenant do not match;
- the agent is disabled;
- the tenant/platform kill switch is active;
- the applicable AI/action budget is exceeded;
- an approval is bound to an obsolete payload;
- the action is permanently human-only;
- the existing agent policy rejects the action;
- delegated authority rejects the action;
- execution is requested without deterministic execution authority.

The guard never grants permissions, modifies delegations, calls an AI provider or performs network I/O.

## Evaluation harness

`cloudflare/src/agent-evaluation.js` contains a deterministic replay suite for the agent safety boundary.

The suite currently covers:

- permitted governed reads;
- permitted prepare-only work;
- unknown/prototype action keys;
- missing tenant scope;
- cross-tenant attempts;
- disabled agent state;
- kill switch enforcement;
- budget exhaustion;
- stale approval payloads;
- permanent human-only actions;
- disabled bounded execution;
- prompt-injection attempts to expand authority.

`scripts/agent-evaluation-gate.mjs` fails the release gate on any scenario failure, false allow or execution escape.

## Model/provider qualification

When Thebe introduces or changes a model/provider, model outputs that propose tool calls must be evaluated against the same deterministic guard before production use. A model/provider may improve recommendation quality, but it cannot increase authority.

The production sequence must remain fail-closed. This change does not enable L3 bounded execution and does not alter the permanent human-only boundary for payments, statutory filings, signatures, employment termination, financing acceptance or journal posting.
