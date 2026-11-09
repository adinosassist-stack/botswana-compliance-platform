# Thebe Life: read-only family monthly budget

A household-scoped monthly aggregate is available in `server/thebe-life/d1-family-budget-summary.mjs`.
It requires a server-session user ID and actively authorized household membership **inside the
same D1 SELECT statement** used for the aggregate. Returns BWP minor units for income, expenses,
commitments and remaining planned budget, with `bankVerified:false`. Transfers are deliberately
excluded to avoid double counting.

The implementation is deliberately **not connected to live HTTP, Workspace navigation, or
production finance**. No new migration, public route, banking API, wallet, payment approval or
insurance execution is introduced.

Reviewer acceptance:
- Confirm zero-row aggregate for an active household member, and refusal for revoked members
  and users outside the household, using a real isolated synthetic D1 fixture.
- Compare monthly totals at year boundaries; validate integer overflow behavior and transfers.
- Confirm no exposure to users without a verified server session and a separate Life entitlement.
- Require `thusico` review and protected checks before integration.
