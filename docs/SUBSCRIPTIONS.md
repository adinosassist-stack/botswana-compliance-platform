# Subscription Gate

New tenants start with a configurable trial (`TRIAL_DAYS`, default 14). Read access remains available after trial expiration, but workspace mutations and new evidence uploads return HTTP 402 until the subscription is active.

## Phase 0 manual bank payments

Subscription checkout can run in `manual_bank` mode using `SUBSCRIPTION_PAYMENT_MODE=manual_bank`.

1. The workspace owner selects a self-serve plan and billing cycle.
2. The server creates a normal `payment_orders` row with provider `manual_bank` plus a unique Thebe Desk payment reference.
3. The customer transfers the exact BWP amount to the configured Thebe Desk company bank account and uses that Thebe Desk payment reference.
4. The customer submits the bank transaction/reference number. This changes the manual payment to `submitted`; it does **not** activate the plan.
5. A provisioned platform administrator checks the company bank account and explicitly verifies that the exact amount has reflected.
6. Verification passes through the existing one-time payment settlement/fulfillment path. Only then is the subscription set to `active`.

A proof-of-payment screenshot is deliberately not treated as settlement evidence. Duplicate verified bank references are blocked. Rejected submissions may be corrected and resubmitted. Manual-bank refunds remain an operations/manual-review process rather than pretending a bank reversal is automated.

Customer-visible bank instructions come from:

- `MANUAL_PAYMENT_BANK_NAME`
- `MANUAL_PAYMENT_ACCOUNT_NAME`
- `MANUAL_PAYMENT_ACCOUNT_NUMBER`
- `MANUAL_PAYMENT_BRANCH_CODE` (optional)

The manual subscription endpoint fails closed when the required bank details are not configured.

## Automated providers

Payment-provider webhooks are intentionally not hard-coded into subscription entitlement logic. Automated rails must update payment state only after verifying provider evidence/signatures. Raw card data must never enter Thebe Desk.
