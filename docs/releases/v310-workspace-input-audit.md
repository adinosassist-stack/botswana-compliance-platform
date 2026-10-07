# V310 — Money record entry and workspace input audit

Money had canonical finance reads and backend write routes, but no user-facing write forms. V307 deliberately tested its presentation module as read-only. That was appropriate for that module, but not adequate acceptance criteria for the Money product: a user could not populate its ledger. V310 adds a separate entry module and browser-to-real-ledger tests.

## Delivered

An expandable entry panel appears above the Money summary. Owners/managers can add bank/cash/mobile-money/clearing accounts with a starting balance; create customers and suppliers; record received income and spent expenses; create invoices and supplier bills; link existing payments to them; preview and confirm CSV statements; reconcile account statements; and review recorded accounts, contacts, invoices, open bills and transactions.

Amounts are entered in pula and converted to exact integer cents. Invoice/bill entry does not change cash. Payment linking changes outstanding obligations, without creating another transaction. Import preview performs no writes. Import/transaction/matching retries retain their request key; exact repeat import content is blocked by the existing backend. Overlapping CSV periods and previously entered manual transactions still require user review. Records stay in the form on failure. Success requires an affirmative backend response; successful saves refresh the canonical summary. The reconciliation result includes its difference.

The record lists use existing backend caps: 200 recent invoices, 50 open bills, 500 recent transactions and existing account/contact limits. Opening balances mean the balance before recorded transactions, not a dated historical ledger entry. No bank connection, fund movement, tax calculation or chat-to-ledger write is added.

## Other main workspaces

| Page | Existing input route | Finding |
| --- | --- | --- |
| People | Manage employees → employee form; Daily Operations → reporting links and exceptions | Forms and authenticated write handlers present |
| Sites / jobs | Create site / job and Edit site dialogs | Operating-location API write path present |
| Business | Business details; tax facts; licences; company actions and business changes | Inputs present; profile/tax facts use the shared versioned state persistence |
| Documents & proof | Add evidence → vault → file upload and completion | Input/upload path present |
| Tenders | Check readiness → create tender workspace | Title, issuer and closing-date inputs present |
| Property | Portfolio → add/edit property; calculator → save scenario | Canonical property writes present; calculator scenarios intentionally last only for the browser session |
| Automation | Workflow rules; recurring automation settings | Input/configuration routes present |
| Market / professional services | Service selection and order flow | Order path present; service catalog is supplied by the platform |
| Work / Protect / Home | Summary links to the source records above | Derived summaries rather than separate data registers |
| Settings | Security, integrations, billing and account controls | Dedicated actions exist; permissions apply |

No second complete absence of record-entry forms was found among the main workspace pages. This is source and regression evidence, not a claim that every live tenant, external integration or specialist workflow was exercised. Existing forms were retained.

## Fresh verification

- `node --no-warnings tests/v310-finance-inputs-runtime.mjs`: real SQLite migrations and backend handlers; persistence, exact balances, allocations, retry replay, over-allocation rejection, tenant isolation, role restrictions, reconciliation, audit events and asset delivery.
- `node --no-warnings tests/v310-money-inputs-browser.mjs`: Chromium UI against those real handlers; account/contact creation, income/expense, invoice/bill entry, matching, exact cents, import preview/confirmation/repeat blocking, failure recovery, recorded-data review, reconciliation and 320–1280px containment. The test first demonstrates that V307 alone has no Add account entry action.
- `node tests/v310-workspace-input-coverage.mjs`: existing main input entry paths, fields, persistence handlers and the new Money actions.
- V307 Money static/browser, V309 infographics browser, People static/browser and V272 property navigation regressions passed.
- `npm run check` and `npm run check:bundle-budget` passed.

CI runs the new persistence, workspace input coverage and browser workflows. Visual checks are now accompanied by an entry → save → refreshed summary acceptance path for Money.
