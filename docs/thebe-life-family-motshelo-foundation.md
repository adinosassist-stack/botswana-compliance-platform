# Thebe Life — Family Budgeting & Motshelo foundation

**Status:** Offline planning-only development. **No production migration or route**. No public user activation, account issuance, money collection, deposit-taking, lending, wallets, transfers, payment initiation, or access to company funds.

## Product placement

Introduce **Thebe Life** as a distinct personal-finance surface inside Thebe Desk, separate from business Finance and the owner workspace. Household members must never inherit company workspace roles. A Motshelo group is its own private trust boundary; being in one group never grants access to another group or to household data.

| Module | Planned UX | Core privacy/auth decisions |
| --- | --- | --- |
| Family budgets | Income, rent, groceries, utilities, school fees, insurance and transport envelopes; alerts for overspend and underfunded goals | Private household scope; invited adult co-managers with consent; no business transactions shared by default |
| Savings goals | Emergency fund, school fees, building, weddings and holiday goals; visual progress; manual contributions | Planning records only; savings are held at the individual's existing bank/mobile-money provider |
| Motshelo rotations | Private group setup, rules, member roster, amount, schedule, expected recipient and manual contribution log | Chair, treasurer, member and auditor roles; every record tenant/group scoped; visible audit history |
| External payment evidence | Member submits non-sensitive proof reference; different authorized officer marks verified after checking funds | A payment reference alone is not proof; no automatic funds acceptance or verification |
| Motshelo payout record | Show readiness only when all members have independently verified contributions and two distinct group officers approve | Never transfer money in the app; record an **external** payout receipt only after verified settlement |
| AI assistance (later) | Budget summaries, opt-in reminders, spending patterns and explanations in Setswana/English | No agent ability to approve payments, move money, expose records, or infer household financial data without permission |

The backend foundation in [server/thebe-life-domain.mjs](../server/thebe-life-domain.mjs) includes:
- exact integer-thebe BWP parsing and formatting (no JavaScript floating-point amount calculations);
- budget-envelope and actual-spend summaries, including overspending and income gaps;
- deterministic rotating Motshelo projections with BWP expected pool amounts, explicitly **not funded**;
- a **read-only** external payout-record review: every member must have non-sensitive, independently reviewed receipt evidence; distinct chair and treasurer approvals are required; the result never authorizes fund movement.

The acceptance suite in [tests/thebe-life-foundation.test.mjs](../tests/thebe-life-foundation.test.mjs) uses synthetic information only. Run locally with:

\`\`\`bash
node --test tests/thebe-life-foundation.test.mjs
\`\`\`

The [D1 SQL proposal](../proposals/thebe-life/family-motshelo-schema-proposal.sql) is intentionally outside every migration folder and has **not** been executed. The implementation remains pure and unconnected to HTTP, employee portals, production wallets, payment credentials, and bank connectors.

## Botswana scope and legal requirements

Motshelo can mean a rotating contribution group or a pooled savings/loan-sharing arrangement. The initial scope is a **non-custodial recordkeeping and planning tool for existing voluntary groups**, with rotating projections only. No interest, member lending, deposit solicitation, return promises or new pooled-investment products are implemented.

The Bank of Botswana oversees payment and deposit-taking activities, and published the **Electronic Payment Services (Amendment) Regulations, 2026** in July 2026. Before adding wallet balances, transfers, contributions collected by Thebe, payment initiation, standing orders, pooled investment, automatic disbursements, or loans, seek an up-to-date Botswana legal assessment and verify whether the activity requires licensing or an authorized payment-service partner. The Bank has previously warned about illegal deposit-taking schemes marketed using the Motshelo name.

Reference material (policy research only; verify current legal advice before release):
- Bank of Botswana — Legislation and Regulations: https://www.bankofbotswana.bw/content/legislation-and-regulations
- Bank of Botswana — 2026 electronic payment amendment implementation: https://www.bankofbotswana.bw/press-release/implementation-electronic-payment-services-amendment-regulations-2026
- Bank of Botswana — Electronic Payment Services Regulations 2019: https://www.bankofbotswana.bw/sites/default/files/Electronic%20Payments%20Services%20Regulations%202019%20%28Website%20Download%29.pdf
- Bank of Botswana — illegal deposit-taking / Botswana Fund Motshelo notice: https://www.bankofbotswana.bw/sites/default/files/press-release-files/press-release--illegal-deposit-taking-activities-botswana-fund-motshelo.pdf

## Separate gates before a customer beta

1. Approve personal and Motshelo group data roles, minors/privacy rules, invite/consent/exit, retention, export/deletion and dispute handling. No bank account credentials or family IDs in free-text notes.
2. Convert the schema proposal into a reviewed, production-compatible additive migration on **separate isolated staging D1**, with fully group-scoped SQL, migrations, D1 rollback and race/idempotency tests.
3. Build mobile-first Thebe-blue UI, authenticated household/group route namespaces, origin/CSRF/rate limits, audit logs and reminders; permission tests must prove business staff, other households and other Motshelo groups cannot access records.
4. Test real-world member contribution state races, shared-receipt replay, partial payments, withdrawals, exits, schedule changes, bad actors and treasurer/chair conflict. Do not generate promised-return or fund-custody claims.
5. Independently review protected staging deployment and synthetic mobile acceptance. Obtain separate product/legal/privacy approval for every money-moving feature. Current stage includes no customer-facing change.

**Launch recommendation:** Make Family Budgeting and Motshelo Recordkeeping available together as Thebe Life after the gates pass, initially with manual entries and bank/mobile-money receipts verified independently outside Thebe Desk. Integrations with licensed payment providers are a separate, later initiative.
