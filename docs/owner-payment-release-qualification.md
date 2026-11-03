# Owner payment verification — release qualification

Status: reference-only, default-off. No payment activation, migration, or bank integration is enabled.

## Trust boundaries
- Authenticate owner on the server; derive tenant and actor from trusted session, never browser JSON.
- Confirm settled funds directly through trusted bank reconciliation. Customer screenshots or references do not prove receipt.
- Match invoice tenant, exact amount, currency, settlement and unique bank transaction ID.
- Enforce uniqueness in the database. A previous-allocation lookup is advisory only.
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