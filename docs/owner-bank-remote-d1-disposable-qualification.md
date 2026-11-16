# Owner bank allocation — remote D1 qualification authorization packet

**Status: PLAN ONLY / NO WRITES AUTHORIZED.** This document is not a staging
deployment, migration, payment activation, or authorization to touch customer data.

## Scope and boundaries

- Source baseline: review exact current `main` SHA at the time of qualification;
  record it with the approved PR, check run, D1 UUID and independent approvals.
- Cloudflare account: `ddd23cab31928a4bb3d4998df9b26d1d`.
- NEVER target `bw-compliance-os` (production), `bw-billing-staging`,
  `bw-compliance-os-pop-staging`, or any existing customer/backup DB.
- A new D1 resource must be explicitly named as disposable qualification, with
  a unique UUID, no routes, no Worker bindings to customer environments, no
  credentials or customer information, and no payment or subscription activation.
- All example identifiers are synthetic. Use `owner_bank_receipt_allocation`
  reference schema from `server/payments/owner-bank-allocation-contract.mjs`;
  do not edit the production schema or run unreviewed migrations.
- The read-only inventory on 10 November 2026 confirmed that the existing
  `bw-billing-staging` and `bw-compliance-os-pop-staging` D1 databases do
  not contain `owner_bank_receipt_allocation`; **that does not authorize
  writing it into those databases**.

## Required authorization before the first remote write

1. Owner confirms the exact proposed **new** disposable database name/UUID,
   reference schema SHA, test plan and cleanup authority.
2. `thusico` independently approves the exact current PR/SHA and isolated
   database scope through the protected review process.
3. Validate Cloudflare account, new database UUID, zero application bindings,
   no routes, no existing user tables and no customer rows.
4. Restrict the credential to the disposable resource where supported; never
   reuse production deployment/restore credentials as an implicit authorization.
5. Record an immutable pre-test resource inventory and the operator identity.
6. Only after gates 1–5, apply the reviewed schema **to the new database only**.

## Remote acceptance matrix

| Case | Synthetic input | Required D1 outcome |
| --- | --- | --- |
| First valid receipt | bank-a / tenant-a / invoice-a | One insert, `meta.changes=1` |
| Exact replay | bank-a / tenant-a / invoice-a | No insert, `meta.changes=0` |
| Cross-tenant bank replay | bank-a / tenant-b / invoice-b | No insert, `meta.changes=0` |
| Same funded invoice, new bank credit | bank-b / tenant-a / invoice-a | No insert, `meta.changes=0` |
| Equal invoice ID, other tenant, new credit | bank-c / tenant-b / invoice-a | One insert, `meta.changes=1` |
| Concurrent same receipt | two separate isolated Workers/requests against same DB | Exactly one insert; exactly one conflict |
| Concurrent same tenant/invoice, distinct receipts | two isolated Workers/requests | Exactly one insert; exactly one conflict |
| No trusted settlement | pending, reversed, customer-uploaded proof | Denied by policy; **zero DB inserts** |
| Invalid actor / malformed Unicode / amount | missing session, invisible ID, zero/fractional amount | Denied before DB write |
| Failure/timeout | DB unreachable or ambiguous execution result | No payment or entitlement activation; reconcile before retry |

For all cases, query only synthetic allocation row counts and anonymous
test IDs. Never return token values, customer data or live bank identifiers.

## Fail-closed protocol and rollback

- Check that the reference schema contains `bank_transaction_id TEXT PRIMARY KEY`
  and `UNIQUE (tenant_id, invoice_id)` before any write.
- Record each D1 `success`, `meta.changes`, request correlation ID, expected
  result and final row count, with sensitive fields redacted.
- If any expected denial inserts a row, if either competing write succeeds
  twice, or if the results cannot be attributed to the approved DB UUID:
  **STOP / NO GO**. Do not use retry loops that could turn an uncertain
  settlement into repeated allocations.
- On incomplete execution, read back synthetic test IDs and reconcile before
  repeating requests; a transport timeout is not proof of non-insertion.
- There is no automatic deletion. Independently approve cleanup of the
  disposable database after evidence is preserved, then verify its absence.
- No restore of production data or rollback into a customer database.
- Completing this matrix does not prove bank settlement, fraud handling,
  refund/chargeback workflows, signed audit integrity, real HTTP authorization,
  or atomic subscription entitlement changes. Each remains a separate gate.

## Evidence and release decision

Capture exact source SHA, approvers, Cloudflare account/new database UUID,
sanitized API results, race outcomes, final synthetic row count,
resource cleanup verification, and a signed go/no-go conclusion.
The release remains **NO GO** for live payments absent independently visible
cleared funds in Thebe Desk's bank account, owner-side reconciliation,
production migration review, protected deployment authorization and
authenticated end-to-end acceptance.
