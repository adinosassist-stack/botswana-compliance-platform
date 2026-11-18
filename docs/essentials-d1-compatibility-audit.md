# Essentials D1 compatibility audit — existing Finance Core

Source: cloudflare/migrations/049_v108_finance_receivables.sql and cloudflare/src/finance-receivables.js.

## Important compatibility finding
The existing `finance_invoices` schema allows only `issued` or `void`, not `draft`. It requires an issued date, due date, tenant-scoped customer, positive total and a unique (tenant_id, invoice_number). Therefore **do not insert Essentials draft invoices into finance_invoices** and do not weaken the existing CHECK constraint. Existing receivables and allocation triggers enforce critical accounting invariants.

## Safe staging design
- Reuse `finance_customers` and the existing issued receivables ledger after explicit invoice issuance.
- Draft invoices need a separate, additive, tenant-scoped staging table or an already-reviewed draft store; qualify the exact migration and rollback first.
- Proposed draft table fields: id, tenant_id, customer_id, source_quotation_id, idempotency_key, invoice_number, draft_payload_json, status='draft', created_by_user_id, created_at.
- Enforce UNIQUE(tenant_id,idempotency_key), UNIQUE(tenant_id,invoice_number) and optionally UNIQUE(tenant_id,source_quotation_id) according to approved conversion semantics.
- Add tenant/customer/source checks and indexes; validate ownership in the DB adapter and API. Do not rely on UI-supplied tenant IDs.
- Existing `finance_invoice_allocations` are for issued invoices and must remain unchanged; schedules and deposits are read-only previews until a separately reviewed persistence design is approved.
- Do not infer verified bank settlement from a boolean supplied by a customer or browser.
- A D1 repository must implement transaction-safe idempotency with atomic uniqueness. The current repository interface is only an orchestration contract and has not been proven to map to Cloudflare D1's transaction primitives.

## Gate
No D1 schema apply, write, invoice issuance or production activation is authorized by this audit. First run exact-SHA isolated staging migration qualification, tenant-isolation/rollback/idempotency tests and independent thusico approval.
