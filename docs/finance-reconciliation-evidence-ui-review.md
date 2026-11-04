# Money workspace reconciliation evidence UX — review only

When a canonical finance summary omits or invalidates the nonnegative integer `unresolvedCount` or `unresolvedExposureMinor`, the Money workspace now displays **Unavailable** for both reconciliation count and exposure and **Evidence unavailable** for the lane status. It no longer renders a false zero-exception state. A valid count of zero still displays zero and remains subject to the existing stale freshness warning.

The current canonical read endpoint and provider-neutral architecture remain unchanged. This is a read-only UI interpretation fix, not a bank verification, reconciliation execution, financial forecast or settlement control. No API, database schema, payment processing, subscription activation, migrations, deployment or protected environment changes are included.

Qualification: `node --test tests/finance-reconciliation-missing-evidence-ui.test.mjs`, required Money/Finance regression workflows, and independent `thusico` review before protected merge. Current production launch HOLD and recovery gates remain in force.
