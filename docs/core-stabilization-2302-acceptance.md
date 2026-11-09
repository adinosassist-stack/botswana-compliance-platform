# Core stabilization acceptance matrix — issue #2302

This is a **planning and evidence checklist**, not a claim that production is qualified.

| Batch | Existing implementation to inspect | Required proof before closure |
| --- | --- | --- |
| A: payments | `tests/manual-bank-resubmission-d1.test.mjs`, owner payment evidence policy, checkout and POP routes | Isolated D1 regression, rejection/resubmission race tests, idempotent activation, tenant/role enforcement, real owner-observed bank settlement |
| B: recovery | POP staging, protected backups and restore workflows | Exact source SHA, isolated migration dry run, retention/access sign-off, independent restore authorization and rehearsal |
| C: core | AI Dock, live voice, private AI exports, employee self-service, Corporate Assets | Authenticated desktop/mobile E2E, provider credit and voice sample, isolated asset schema test, audited add/edit flows |

## Non-negotiable controls
- A customer-submitted reference, screenshot or proof of payment is **not** evidence of cleared bank funds.
- Rejected submissions remain immutable; replacement checkout must use a new order and must not activate the rejected order.
- No production database writes, feature flag activation, token rotation or deployment from this documentation-only PR.
- Keep independent `thusico` approval, protected environments, branch restrictions, SHA-bound evidence and no self-review.
- Mark each acceptance row PASS / FAIL / BLOCKED with exact SHA, run URL, timestamp, environment and sanitized evidence.

## Proposed execution sequence
1. Inventory existing code and PRs; run targeted payment/asset/AI tests.
2. Fix confirmed failures in consolidated A/B/C implementation PRs, not one PR per test.
3. Qualify isolated staging and collect owner-observed payment evidence.
4. Request independent review and separately authorize production release.
5. Run postdeploy smoke checks, rollback verification and audit record reconciliation.

Related issues: #1874 #1886 #2291 #1950 #2102 #1934 #2187 #474 #1868 #2271 #2204 #2157.
