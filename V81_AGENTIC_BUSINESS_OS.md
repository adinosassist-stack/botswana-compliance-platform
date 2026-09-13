# Thebe Desk V81 — Agentic Business Operating System

## Objective

Thebe Desk is evolving from an AI-enabled SME SaaS platform into a human-governed Agentic Business Operating System. The system must increasingly run routine business workflows while preserving owner authority, tenant isolation, financial truth, regulatory provenance, privacy and an auditable record of every decision.

The V81 Stage 1.5 release is intentionally **shadow-only**. It models delegated authority and records policy decisions without executing external side effects.

## Existing foundation

The current platform already provides:

- five governed agents: Management, Compliance, Tender Readiness, Daily Operations and Finance;
- a deterministic action catalogue;
- tenant and role checks;
- finance reconciliation and provenance;
- compliance obligations and evidence workflows;
- owner/manager approvals and audit trails;
- agentic runs, proposals, decisions and measured outcomes;
- outcome-informed ranking that does not increase authority;
- explicit prohibition of autonomous payment, filing, signing, employment termination and journal posting.

V81 extends this foundation rather than creating a second agent framework.

## Autonomy ladder

| Level | Name | Meaning | Example |
| --- | --- | --- | --- |
| L0 | Observe | Read governed business state | Read cash position |
| L1 | Recommend | Suggest next action | Recommend overdue-invoice follow-up |
| L2 | Prepare | Draft bounded work for human review | Prepare reminder or management brief |
| L3 | Bounded Execute | Execute a specifically delegated low-risk action inside explicit limits | Create an internal task; eventually send an approved reminder |
| L4 | Human Only | Never autonomous | Payment, statutory filing, signature, termination, financing acceptance |

Stage 1.5 does not execute L3 actions. It evaluates them in shadow mode only.

## Delegated Authority Engine

A delegation is tenant-specific, owner-approved and action-specific. It may contain:

- agent key;
- action key;
- maximum autonomy level;
- external-side-effect permission;
- strong-auth requirement;
- human-confirmation requirement;
- daily action limit;
- optional amount limit;
- validity window;
- status: active, paused, revoked or expired.

The Stage 1.5 database hard-locks every delegation to `shadow_only=1`. A future migration is required before real bounded execution can exist.

## Shadow evaluation

`POST /api/agentic/authority/shadow` evaluates a candidate action against:

1. authenticated tenant and role;
2. registered agent/action pair;
3. high-risk permanent human-only boundary;
4. active delegation;
5. autonomy ceiling;
6. validity window;
7. side-effect permission;
8. strong-auth policy;
9. human-confirmation policy;
10. daily action cap;
11. amount cap.

The route records a hashed, idempotent action intent and returns the policy result. It never executes the action.

## Permanent human-only boundary

The following remain outside autonomous authority:

- `payment.execute`
- `government_filing.submit`
- `document.sign`
- `employment.terminate`
- `financing.accept`
- `journal_entry.post`

Human approval may eventually trigger separate controlled workflows, but an agent may not grant itself authority for these actions.

## Rollout by customer maturity

### 0–24 paying businesses

Thebe observes, explains and recommends. Focus on the Core Five: owner brief, sales follow-up, finance import/reconciliation, compliance actions and staff reporting.

### 25–49

Thebe prepares actions. Shadow delegated-authority telemetry begins for candidate L3 actions.

### 50–149

If retention, support, security and direct contribution gates pass, a small set of low-risk actions may be considered for real bounded execution in a future release. V81 itself remains shadow-only.

### 150–399

Specialised agents may operate bounded internal workflows, subject to measured error rates, owner overrides, incident rate and rollback controls.

### 400+

Cross-agent orchestration may be introduced only after the single-agent bounded-execution model is proven.

## Promotion gate from shadow to real execution

No action may move from shadow to execution until all of the following are true:

- at least 100 shadow evaluations for the exact action class;
- zero critical cross-tenant/security incidents;
- policy false-allow rate below 0.5%;
- owner override/rejection rate below 5% for at least 30 days;
- deterministic idempotency verified;
- compensating/rollback action tested where applicable;
- provider credentials and real-device/end-to-end test green for external actions;
- audit trail complete;
- explicit release flag and migration enable execution;
- 3-pass adversarial review completed.

These are governance targets, not automatic enablement. Meeting them permits review; it does not itself switch execution on.

## Outcome metrics

The agent programme must be judged on business outcomes, not prompt volume:

- money collected;
- reconciliation exceptions resolved;
- compliance obligations completed on time;
- owner time saved;
- avoided errors/incidents;
- recommendation acceptance rate;
- owner override rate;
- false allow / false block rates;
- cost per completed agentic outcome;
- customer retention and expansion attributable to automation.

## Agent interaction model

Long term:

`Business event -> governed observation -> specialised agent -> policy -> delegated authority -> action intent -> execution/approval -> outcome -> learning`

Outcome learning may reorder recommendations but must never silently increase permission, risk class, spend limit or execution authority.

## Interoperability

Thebe should remain model- and provider-neutral. Future integration boundaries should be designed so internal tools can be exposed through standard agent/tool protocols where appropriate, while preserving Thebe's own tenant authorization, audit and policy layer. External agent protocols must never bypass delegated authority.

## Non-goals for V81 Stage 1.5

- no autonomous payments;
- no autonomous government filing;
- no autonomous document signature;
- no autonomous employment decisions;
- no autonomous journal posting;
- no unsupervised WhatsApp/email side effects;
- no agent-created delegation grants;
- no model-controlled permission escalation;
- no hidden execution;
- no cross-tenant learning that exposes customer data.

## Release posture

V81 Stage 1.5 is a **governance and telemetry release**. It prepares Thebe for the future in which agents run routine SME operations, without making the unsafe leap from recommendations to uncontrolled autonomy.
