# Thebe Desk consolidated SaaS improvement batch — review-only

Baseline main: `7b465dad01015d6298e50cf8545023c4c0b5864e`. This batch adds a fail-closed, offline quality-evidence gate and adversarial tests. It does **not** claim that CI, staging, security, recovery or production checks passed.

## Immediate change
- New `scripts/saas-quality-evidence-gate.mjs` rejects incomplete, invalid, duplicated or contradictory synthetic navigation measurements.
- Requires exact SHA, passing CI, independent review, authenticated staging smoke, tenant isolation and qualified recovery before emitting `qualified:true`.
- New tests: `node --test tests/saas-quality-evidence-gate.test.mjs`.
- This gate is not wired into deployment; doing so requires a separate reviewed workflow change and real authenticated evidence. It cannot be used as proof of launch readiness by itself.

## Consolidated follow-on work (same program, separate gated deployment)
1. UI: implement and verify the full `docs/ux-2157-acceptance-matrix.md` across Market, Workspace, dock and mobile, including Chromium/Firefox/WebKit and accessibility.
2. Performance: collect sanitized authenticated cold/warm navigation and API p95 measurements, fix confirmed bottlenecks, establish CI budgets.
3. Security: adversarial tenant and role-revocation tests, payment confirmation against bank-visible funds, upload boundaries and no secret leakage.
4. Business workflows: prove finance reconciliation, owner dashboard, onboarding and subscription activation end-to-end.
5. Release: qualify private recovery/restore evidence tracked in #1950 and independently review exact-main CI, staging smoke and release artifacts.
6. Keep advanced exports, POP ingestion and unqualified AI/voice persistence OFF until separately qualified.

No production writes, secrets, deployments, approvals, schema changes, payment activations or branch-protection bypass. Independent `thusico` review required.
