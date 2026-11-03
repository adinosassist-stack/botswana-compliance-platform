# Business Analytics — finance evidence qualification

Code-only, read-only Business Analytics hardening.

- Reconciliation is **current** only when the canonical unresolved count is a nonnegative safe integer equal to zero and the explicit stale flag is `false`. Missing count or freshness creates a separate medium-severity read-only evidence signal and downgrades readiness to partial.
- Essential money-domain fields retain `null` on missing inputs rather than silently becoming zero, allowing Owner Command Centre and future consumers to display Unavailable.
- A genuine numeric zero remains zero. This does not assert that a reconciliation was performed, only that the provided canonical current-state fields satisfy the existing summary contract.
- No database changes, route, API call, feature flag, payments, activation, notifications or production deployment.

Review with `node --test tests/business-analytics-finance-evidence.test.mjs` plus `node tests/v173-business-analytics.mjs` and required CI. Independent reviewer `thusico` must approve before protected merge. Recovery and core launch release gates remain unchanged.
