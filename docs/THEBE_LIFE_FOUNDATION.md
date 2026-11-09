# Thebe Life — household, motshelo and licensed-partner insurance

Status: **code-only proposal; no endpoints, UI activation, migration, partner contract or release authorization**.

## Ownership and separation

- Thebe Life owns **Household Budget**, **Motshelo**, **Insurance**, and **Life Goals**. These are not Workspace business-accounting modules.
- Workspace may record business-to-personal transfers, but a paired transfer must not count twice as external income.
- Household memberships and motshelo memberships are distinct from business/company tenancy. Authorization must be enforced server-side for every read/write, with explicit shared-family permissions and committee roles.
- Insurance policies in Corporate Assets are business-owned and must not be silently imported into household policies.

## Initial domain contracts

The isolated `server/thebe-life/finance-core.mjs` exports pure minor-unit calculations for household income/expenses/commitments, motshelo projections, and insurance commission illustrations. No access to production money or personal records is enabled.

## Proposed development batch

1. **Household Budget:** household membership/invitations, income, expense, recurring bills, commitment envelopes (including motshelo dues), school-fee goals, joint/private visibility, cash-flow forecast, reconciled imports and deduplicated transfers.
2. **Motshelo:** member registry, constitution revisions, cycles, contributions, rotation queue, annual share-out, committee approvals, meetings, audit trail and debt ledger. Separate `reported`, `matched`, `cleared`, and `settled` states; screenshots and references are never proof of settlement.
3. **Insurance:** licensed insurer and product catalogue, consumer disclosure, informed opt-in/referrals, quote/application tracking through authorized partners, policy-document vault, renewals, insurer-led claims, partner commission receivables, clawbacks, and statement reconciliation.
4. **Thebe AI:** household summaries, what-if forecasts and explanation-only risk signals; no autonomous payouts, lending or policy binding.
5. **UX:** mobile-first Thebe Life tabs. Keep Household Budget, Motshelo and Insurance separate from the business Workspace and the public Market. No customer-facing feature flags until qualified.

## Hard release boundaries

- Do **not** receive, pool or disburse motshelo deposits until appropriate payment-service authorization and independent production approval exist. Initially only track externally held funds.
- Do **not** quote, solicit, bind, collect insurer premiums or recognize commission until the exact NBFIRA permissions, licensed-insurer agreement and compliance review are recorded. An introduction/referral arrangement itself requires legal confirmation of permissible scope and remuneration.
- Never represent the company as the underwriter; all cover, underwriting, premiums, claims outcomes and commissions must come from authorized insurer records.
- Encrypt sensitive personal/family data; keep insurer medical information out of generic AI contexts. Require purpose-specific consent, retention schedules and tenant-isolation tests.
- Financial forecasts are estimates; distinguish projections from cleared balances.
- Required tests before integration: authorization and cross-household isolation, committee approval separation, transfer deduplication, bank-receipt verification, overflow/currency precision, commission settlement/reversal, consent, accessibility and mobile UI.
- Merge/deploy only after repository CI and independent `thusico` review; preserve main and production protections.

## Local test

`node --test tests/thebe-life-finance-core.test.mjs`
