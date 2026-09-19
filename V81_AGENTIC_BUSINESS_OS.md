# Thebe Desk V81 — Agentic Business Operating System

## Objective

Thebe Desk is evolving from an AI-enabled SME SaaS platform into a human-governed Agentic Business Operating System. The system must increasingly run routine business workflows while preserving owner authority, tenant isolation, financial truth, regulatory provenance, privacy and an auditable record of every decision.

The production architecture exposes **one canonical Thebe agent**. Finance, Compliance & Tender Readiness, Operations & People, and future Receivables & Customer work are capability boundaries behind that agent. They are not independent user-facing agents.

The V81 Stage 1.5 release remains intentionally **shadow-only** for delegated execution. It models authority and records policy decisions without executing external side effects.

## Existing foundation

The current platform provides:

- one governed Thebe agent as the canonical agent identity;
- deterministic capability routing for Finance, Compliance & Tender Readiness, and Operations & People;
- a reserved Receivables & Customer capability boundary that remains disabled until authoritative customer data, consent and execution controls are ready;
- a deterministic action catalogue;
- tenant and role checks;
- finance reconciliation and provenance;
- compliance obligations and evidence workflows;
- owner/manager approvals and audit trails;
- agentic runs, proposals, decisions and measured outcomes;
- outcome-informed ranking that does not increase authority;
- explicit prohibition of autonomous payment, filing, signing, employment termination and journal posting.

Historical keys such as `management`, `compliance`, `tender`, `operations` and `finance` are compatibility aliases only. They resolve through the canonical Thebe policy boundary and must not create independent personalities, memory, permissions or execution loops.

V81 extends the existing governance foundation rather than creating a second agent framework.

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

A delegation is tenant-specific, owner-approved and action-specific. New delegations use the canonical `thebe` agent key. Historical records may still contain a legacy agent key and are normalized by the compatibility layer before policy evaluation.

A delegation may contain:

- canonical agent key;
- action key and capability;
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
2. canonical Thebe/action/capability policy;
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

Human approval may eventually trigger separate controlled workflows, but Thebe may not grant itself authority for these actions.

## Capability model

### Core coordination

Thebe owns the conversation, plan, explanation and governed routing. It does not duplicate deterministic business logic.

### Finance

Reads reconciled finance outputs, management accounts and finance data-quality controls. It may prepare bounded drafts, but cannot invent figures, post journals or move money.

### Compliance & Tender Readiness

Reads verified obligations, evidence and tender-readiness records. Tender work is a compliance capability, not a separate agent.

### Operations & People

Reads aggregate operational signals and prepares bounded operational follow-up. It must not perform employee surveillance or autonomous employment decisions.

### Receivables & Customer

Reserved and disabled until authoritative customer data, consent, communication and execution controls are production-ready.

## Rollout by customer maturity

### 0–24 paying businesses

Thebe observes, explains and recommends across approved capabilities. Focus on owner brief, finance reconciliation, compliance actions, customer follow-up preparation and staff reporting.

### 25–49

Thebe prepares bounded work. Shadow delegated-authority telemetry begins for candidate L3 actions.

### 50–149

If retention, support, security and direct-contribution gates pass, a small set of low-risk actions may be considered for real bounded execution in a future release. V81 itself remains shadow-only.

### 150–399

Selected capability workflows may gain bounded execution only after action-specific evidence, owner override analysis, incident review and rollback controls are proven. This does not require creating separate user-facing agents.

### 400+

Internal parallel/fan-out execution may be considered for suitable complex tasks, but the product should retain one canonical Thebe agent unless a specialist requires materially different permissions, tools, long-running state or safety controls.

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

Canonical flow:

`Business event -> Thebe -> capability routing -> deterministic policy -> delegated authority -> action intent -> execution/approval -> outcome -> learning`

Outcome learning may reorder recommendations but must never silently increase permission, risk class, spend limit or execution authority.

## Interoperability

Thebe remains model- and provider-neutral. Future integration boundaries should be designed so internal tools can be exposed through standard agent/tool protocols where appropriate, while preserving Thebe's tenant authorization, audit and policy layer. External agent protocols must never bypass delegated authority.

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
- no cross-tenant learning that exposes customer data;
- no reintroduction of separate user-facing domain agents without a new security and product justification.

## Release posture

V81 Stage 1.5 is a **governance and telemetry release**. It prepares Thebe for bounded routine SME workflows while preserving one canonical agent identity, deterministic capability controls and human authority.
