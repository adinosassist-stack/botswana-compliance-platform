# Platform owner payment dashboard

Authorized platform billing administrators with an owner workspace role land on Payments after sign-in. The primary navigation opens **Owner dashboard** directly. Customer owners keep Home and cannot list or change other clients' subscriptions.

The dashboard shows pending reviews, active paid plans and paused plans. Pending bank-transfer submissions activate through the existing verified-funds confirmation and settlement path. Reject remains separate. Client subscription switches pause or resume an existing manual-bank subscription; they do not change payment records, charge a client or extend the paid-through date. Resuming requires an unexpired paid period and an applied, paid subscription fulfillment for the same client and plan. Expired periods require a new verified payment. The current admin workspace cannot be paused from its own session.

Access changes require a reason, current status/period and an idempotency key. The server records an audit intent before mutation, then batches the compare-and-set, sealed completion event and audit chain head in one D1 transaction. A concurrent plan, period, status or refund change prevents the update and creates no completion event. If either completion audit write fails, the transaction rolls back access and completion evidence; the prior intent remains. A retry must still satisfy the current status, paid period and verified payment checks.

Pausing blocks authenticated mutating workspace requests at the outer Worker boundary, including agentic and report-attachment routes. Read access, sign-in/account recovery and billing remain available. It does not cancel existing background jobs or revoke token-only employee reporting; those have separate controls. This limitation appears in the pause confirmation. No schema migration is required: `paused` is already an existing subscription status.

Rolling back this code does not undo recorded subscription statuses, and older Worker versions do not enforce this pause boundary. Review affected subscriptions before rollback. No live client payment or subscription was changed during implementation.

Validation: `node --test tests/owner-payment-dashboard.test.mjs tests/platform-billing-controls.test.mjs` covers owner controls. `node --test tests/subscription-access-audit-d1.test.mjs` verifies rollback and concurrency against local D1; neither suite proves authenticated staging or bank settlement. Also run existing delegation/CSP, role, reporting/attachments, scheduler, asset, syntax, lint and bundle checks. Signed-in live owner acceptance and desktop/mobile visual acceptance follow deployment.

## Research-led analytics additions (25 October 2026)

[Stripe Billing analytics](https://docs.stripe.com/billing/subscriptions/analytics) separates recurring subscription metrics from collected payments. [Paddle Explore](https://developer.paddle.com/build/analytics/explore/) uses date filters, trends, breakdowns and exact figures behind charts. The dashboard applies those patterns to Thebe's actual manual-bank records:

- Monthly verified subscription receipts, with 3/6/12 calendar-month selection and an exact-figures table. Includes paid orders with applied fulfillment for the same client, counted once; excludes service/credit orders, unfulfilled orders, future receipts and orders marked refunded. This is not MRR, bank balance or accounting revenue.
- A status ring and active-plan comparison. Status, plan mix, pending transfers, aging and renewals are current snapshots, independent of the selected receipts range.
- Unverified transfer value, reviews older than 48 hours, paid periods ending within seven days, and a limited recent activity feed. Activity omits private audit reasons and bank references.
- Client search, status filters and a renewal shortcut that filters the client list. All dates used in server aggregation are UTC. No fake growth, churn, revenue forecasts or demo figures appear in live analytics.

Graphs use lightweight HTML/CSS with text labels, a table alternative, keyboard controls and explicit empty/error states. They load only for authorized platform owners; logout clears them and fences late responses. No chart library, tracking integration or recurring background polling was added. Desktop/mobile visual acceptance remains to be run against the deployed owner session.

## Dashboard audit follow-up

Regression cases reproduced misleading expired-access switch state, hidden customer-billing requests, confirmation dialogs surviving an account change, delayed filtering after navigation, and UTC timestamps parsed as browser-local time. The fix keeps access-control state separate from paid-period validity: an expired active record may still be explicitly paused, while an expired paused record requires a new verified payment before resume. Neither action changes the paid-through date.

Payment/access confirmations are fenced to the same authorized session before submission. Owner refreshes request only platform panels; customer owners retain their ordinary billing panels. Client filters stop after navigation and reset on logout. UTC database timestamps are converted before local display. Long names/references and exact-figure tables wrap within narrow screens.

`tests/owner-dashboard-audit.test.mjs` covers these behaviors. `scripts/owner-dashboard-audit-browser.mjs` renders the canonical Payments section, actual dashboard scripts, delegation/sanitization and styles in isolated Chrome at desktop and mobile widths, using synthetic records only. CI checks switching, chart/date/search wiring, cancellation, viewport overflow and zero POST requests, and saves four screenshots for review. This component test does not substitute for a live signed-in owner acceptance test.

Screenshot review also found the shared H2 rule suppressing the dashboard title and analytics preceding approvals. The title now retains its hierarchy, payment approvals precede the charts, and top-level Review payments / Manage subscriptions actions provide direct access. Browser checks verify the heading size and rendered approval order; overview screenshots expand the component scroll container for inspection while controls screenshots preserve the real viewport.

## Manual review completion and interrupted responses

Manual approval writes a sealed `MANUAL_PAYMENT_APPROVAL_REQUESTED` intent before initiating settlement. Missing audit availability prevents a new settlement attempt. Final review status, sealed approval/rejection audit, chain head and the legacy dashboard receipt commit in one D1 batch; failure of any completion write rolls that completion back. Approval also rechecks the paid order, matching fulfillment, active plan and paid period inside the compare-and-set. All three independent bank-funds/amount/transaction confirmations remain mandatory.

This does not make the entire settlement workflow one transaction: a verified payment may already be applied when the completion batch fails. The review remains recoverable by its claiming administrator; after the existing paid-order/fulfillment checks, retry completes the review without applying another paid period. Rejected and already approved submissions remain closed to replay. Never create a second payment or approve from a customer reference to work around an interrupted response.

`node --test tests/manual-bank-owner-approval-flow.test.mjs tests/manual-bank-review-audit-d1.test.mjs tests/subscription-access-audit-d1.test.mjs` exercises the actual approval/rejection route and local D1 rollback, receipt/audit/chain failures, refund races, competing approvals and recovery. This is isolated evidence; live bank settlement and authenticated staging acceptance are still separate release gates. No schema change or production data operation is included.
