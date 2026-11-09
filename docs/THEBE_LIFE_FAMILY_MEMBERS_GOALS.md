# Thebe Life family: member privacy and savings goals

Family membership roster: `server/thebe-life/d1-family-members.mjs` is read-only and
requires an active household **owner** in the same SQL SELECT that returns members.
All IDs come from a validated verified server-side session. Invited, adult, owner,
and viewer role records are visible to the active owner only. No invitation delivery
or membership changes are implemented; an invited role never grants access because
other household reads require active membership.

Savings goal planner: `server/thebe-life/family-goal-planner.mjs` computes a
monthly BWP savings plan with exact minor-unit integer arithmetic. It does not
create transactions, schedule bank movements, persist savings balances or verify
settlement. All computed goals clearly declare `bankVerified: false` and
`automaticTransfersEnabled: false`.

Neither module is mounted on production or staging HTTP endpoints. Before enabling:
use isolated synthetic D1 to test owner revocation and unrelated households, verify
server sessions, add invite acceptance and consent flows, audit data retention, then
obtain `thusico` review and protected release checks.
