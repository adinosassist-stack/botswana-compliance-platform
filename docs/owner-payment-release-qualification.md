# Owner payment verification — release qualification

Status: reference-only, default-off. No payment activation, migration, or bank integration is enabled.

## Trust boundaries
- Authenticate owner on the server; derive tenant and actor from trusted session, never browser JSON.
- Confirm settled funds directly through trusted bank reconciliation. Customer screenshots or references do not prove receipt.
- Match invoice tenant, exact amount, currency, settlement and unique bank transaction ID.
- Enforce uniqueness in the database. A previous-allocation lookup is advisory only.
- As full invoice allocations are the only supported reference contract, reject another credit against an already allocated invoice in the same tenant; reject reused bank transactions globally. Both checks require complete authoritative server-side allocation history; SQL uniqueness and concurrency checks are still mandatory.
- Subscription activation requires a separate reviewed workflow after allocation.

## Staging qualification gates
- Independently review the proposed schema and apply only to a disposable staging D1 database.
- Test real D1 INSERT OR IGNORE behavior and returned meta.changes for insertion and conflict.
- Test concurrent requests across separate workers against the same D1 database.
- Test duplicate receipt across tenants, duplicate invoice, partial/overpayment, reversals and stale bank status.
- Test bank API timeout, invalid owner session, cross-tenant evidence and customer-controlled bank IDs.
- Require audit trail, reconciliation exception queue, rollback plan, protected CI and independent approval.

## Known limits
- Pure policy trusts server-supplied evidence; it must never directly trust public request fields.
- Allocation SQL is a reference contract, not a shipped migration.
- D1 adapter tests use simulated D1 responses, not actual D1 execution.
- Allocation does not activate a subscription or establish finality of bank settlement.
- Current unique invoice constraint does not support multiple partial payments.
## 10 November 2026 — Production state and local D1 evidence

**Verified production observation (read-only Cloudflare):**
- Production script: `bw-compliance-os`; latest observed deployed Worker
  version **588** (100% traffic), deployed **2026-11-09 10:59:56 UTC**.
- Production `PAYMENT_PROVIDER=none`; no external automated paid checkout
  provider is enabled by this setting.
- `POP_UPLOAD_STAGING_ENABLED=false` and
  `EVIDENCE_UPLOADS_ENABLED=false`.
- Bank-transfer configuration is present, but an authenticated, settled
  live payment plus verified entitlement activation is **not established**
  by Worker settings or a successful code-only CI run.
- The last observed deployed Worker version predates several payment policy
  changes on GitHub `main`; do not equate merged code with deployed code.

**New disposable local-D1 qualification, not remote staging:** The workflow
`owner-bank-allocation-d1-qualification.yml` invokes
`tests/owner-bank-allocation-real-d1.test.mjs` against a Miniflare D1
database populated with the **reference-only** allocation schema.
It exercises concurrent same-receipt inserts, global bank transaction reuse,
one full allocation per tenant/invoice, real D1 `meta.changes`, input
canonicalization, and the separation between trusted settlement decisions
and database allocation. A successful CI run is local behavioral evidence
only: no bank provider API is contacted, no real settlement is confirmed,
no subscription is activated, and no migration is applied.

**Still blocking a paid release:**
1. Protected, **separately authorized** disposable remote D1 rehearsal,
   concurrency across distinct Workers, and schema/rollback review.
2. A trusted bank-reconciliation source and owner-side confirmation that
   funds are visibly settled in the Thebe Desk account; customer references
   and screenshots are not proof.
3. Cryptographically auditable allocation, reversals/chargebacks handling,
   exception queue, subscriptions/entitlement transaction boundary, and
   exact-tenant/role authorization in the real HTTP integration.
4. Qualified protected production migration and deployment against the
   approved current source SHA, plus independent `thusico` approval.
5. Authenticated desktop/mobile customer purchase, retry, cancellation,
   receipt, and owner-review end-to-end smoke tests with no premature
   entitlement grant.

**This document and the isolated tests neither authorize nor perform**
production writes, payment-provider activation, POP upload enablement,
traffic changes, token changes, or a live checkout.

## 10 November 2026 — Release 607 postdeploy acceptance matrix

**Verified live baseline** (supersedes the November 9 Worker snapshot above):
- Release 607 reports sourceSha e365c678427c1b80efcf902bb6ee364f05d667c1 on /api/version, /api/live, and /api/ready.
- Cloudflare Worker version 589 reached 100% traffic on 2026-11-10 13:13:30 UTC.
- /api/ready reports healthy D1, R2, core schema and required configuration,
  but popSchemaReady=false and popSchemaStatus=missing. POP is not qualified.
- PAYMENT_PROVIDER=none; EVIDENCE_UPLOADS_ENABLED=false;
  POP_UPLOAD_STAGING_ENABLED=false. Automated checkout/receipt upload are OFF.

**Read-only production D1 consistency evidence:**
- The one historical approved manual submission is linked to a matching
  paid manual-bank order, applied fulfillment and active subscription.
- The historical rejected submission is not paid.
- No duplicate existing bank-reference groups were observed. These are
  historical snapshots, not independent company-bank settlement evidence
  or exhaustive concurrent-request proof.
- Anonymous GET requests to platform billing queue, subscription dashboard
  and analytics returned HTTP 401. Signed-in cross-tenant review is untested.

**Offline acceptance regressions in this candidate:**
- tests/manual-bank-checkout-resubmission.test.mjs executes the checked-in
  checkout and manual-bank submission route bodies against an isolated fake
  persistence layer. It tests pending reuse, rejection/new-order recovery,
  claimed-review reference fencing, pending-reference correction, paid-order
  refusal, wrong-tenant denial, invalid input and non-owner denial.
- tests/manual-bank-owner-approval-flow.test.mjs covers the real owner-side
  approve/reject route body, including attestation, reconciliation flags,
  competing reviewer guards, duplicate approval and fulfillment evidence.
- .github/workflows/manual-bank-checkout-acceptance.yml runs both offline.
  These fixtures are neither remote D1 nor a trusted bank integration and
  they never prove a live customer paid/settled bank transaction.

**Critical outstanding bank-trust gap:** The deployed manual-bank owner
approval route accepts three authenticated owner boolean attestations
(bankFundsConfirmed, bankAmountMatched, bankTransactionMatched) but does not
itself retrieve a trusted bank settlement record or atomically allocate a
unique independently observed company-bank transaction before calling
applyVerifiedPaymentOrder. Existing bank-allocation policy and local D1 tests
are reference-only. Never accept a customer reference/screenshot, an
unverified CSV, or a checkbox alone as proof of settled funds.
Owner-side independent observation of exact settled funds credited to Thebe
Desk's bank is mandatory prior to any real approval.

**Remaining protected acceptance:**
1. Trusted, independently sourced settled company-bank credit with unique
   transaction ID, exact BWP amount and matching tenant/order.
2. Authenticated owner/customer web and mobile manual transfer journeys:
   pending, actual bank credit, rejection/new order, duplicate/replay,
   competing administrator, subscription persistence after re-login.
3. Reviewed trusted-bank reconciliation ingress, atomic unique allocation,
   reversals/chargebacks and exception handling, qualified in isolated
   remote D1 before any production migration.
4. Protected owner-initiated production promotion with independent thusico
   review, exact-source seal, postdeploy smoke and rollback evidence.
5. POP migration and upload enablement remain separately gated.
6. Keep payment P0 issue #1874 open until bank-backed E2E acceptance is proven.

This is TEST/DOCUMENTATION ONLY. It does not modify live customer payments,
bank credentials, Cloudflare configuration, production D1, routes, production
deployments or customer entitlements.
