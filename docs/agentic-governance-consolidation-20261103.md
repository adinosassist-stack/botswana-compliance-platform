# Consolidated default-off agentic governance reference batch

Source PRs: #1939 (governed admission, tenant budgets and stop switch), #1875 (draft workflow contracts and read-only finance/command centre), #1960 (read-only anomaly classification).

## Integration boundary
All code in this batch is additive and intentionally unmounted. It does not register production routes, enable external tools, start agents, change current entitlements, provision D1/R2, execute payments, activate subscriptions or migrate production data. Existing auth, tenant boundaries, review controls and required main checks remain authoritative.

## Release requirements
- Run all imported unit tests, including SQLite multi-connection, optimistic budget reservation, owner auth, workflow transition, readonly finance and anomaly tests.
- Independently review tenant scoping, fail-closed denial, stale authorization and budget races, forbidden actions, workflow state transitions and data disclosure risks.
- Any future production wiring needs a separate PR with authenticated API/CSRF tests, tenant-isolation negative tests, execution off switch and explicit risk-scoped approvals. No automatic merge or rollout.
- Source PRs remain open until this replacement is reviewed and merged, then may be closed individually with a link to this consolidated PR and confirmation of coverage.

## Provenance
- Source heads: #1939 `88d6e4c0273ee2129108292fbe868bb72be49632`; #1875 `53fc174df4631ed828e3f5e5659c0be796119990`; #1960 `7c834c432408bc4c5875622ea5bb3795a42dda98`
- Base: `c6d37873aa3b9f0e2965807582c8631984a17f84`
- Every imported path was an added path in its source PR, with no duplicate path across the three PRs.
