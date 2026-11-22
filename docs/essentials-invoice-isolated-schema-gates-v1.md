# Essentials invoice isolated D1 — proposed schema qualification (UNEXECUTED)

**Tracking:** [#2670](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2670). **Prepared at protected main:** `72a61c0c6d05d52193f940037bef2da31337b0a9`. **This package is NOT an operational database-write authorization.**

## New target; strictly isolated
- Cloudflare account: `ae0dccfed66fc497259aebd81229f08d` (**Thebe Desk Essentials Invoice Staging**).
- D1: `bw-essentials-invoice-rehearsal`, UUID `4eb6c739-9c45-4756-bfa9-8ec0a6efb3be`, read replication **disabled**.
- **FORBIDDEN** production account: `ddd23cab31928a4bb3d4998df9b26d1d`.
- **FORBIDDEN** production D1: `8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce`.
- **FORBIDDEN** legacy staging D1 in production account: `f6d35915-851a-4771-9e07-589572dc4d05`.
- GitHub protected environment `essentials-invoice-staging-protected` (28124961923): `thusico` required, self-review prevention, no bypass, main only.
- Last Cloudflare read-only: D1 has **zero application tables**, only internal `_cf_KV`, and a Time Travel bookmark endpoint available. **No actual restore rehearsal, operator write scope or retention window verified.**

## Exact, ordered DDL-only candidate (NOT TO EXECUTE YET)

Candidate SQL: `cloudflare/migrations/essentials_invoice_rehearsal_NEW_ACCOUNT_STAGING_ONLY.sql`.

**Raw SQL SHA-256:** `8713f453f0033402040b9846dc2c089c7c81c78c4832efcdf95905a380039074` (independently reproduce from the GitHub CI job's Python `hashlib.sha256` computation; stop on mismatch).

This is an **explicit proposed schema**, designed for a NEW empty database, with sections in order:
1. Three minimal synthetic dependency tables (`tenants`, `users`, `finance_customers`) using DDL extracted from the existing offline fixture **without** its synthetic INSERT/seed statements.
2. Existing candidate `essentials_invoice_drafts` table, explicit index and customer/tenant integrity trigger, copied byte-for-byte from current checked-out source.
3. Existing candidate `essentials_accepted_quotation_snapshots` table and three irrevocable acceptance integrity/customer-guard triggers, copied byte-for-byte from current checked-out source.

**Expected application schema after a separately approved execution:** five empty tables, four triggers, one explicit index, zero synthetic records, zero customer records. No production Finance Core tables, invoices or allocations are copied. A second application must fail closed because the dependency tables already exist. It is NOT an idempotent operational migration. Never blindly replay it.

The plan deliberately has **zero data manipulation commands**, and does not authorize creation of a real acceptance event, customer record, draft invoice or a service. The existing offline fixture seeds fake tenant/customer records only in local in-memory SQLite; **that source file is not the remote seed plan**.

## Tests

`python3 -B tests/essentials_invoice_isolated_schema_plan.py`:
- Recompute the exact raw SQL SHA-256 and compare with a fail-closed manifest `tests/fixtures/essentials_invoice_isolated_schema_plan_v1.json`.
- Rebuild the expected SQL from checked-out three canonical source files and reject reordering, tampering, drift or unapproved sections.
- Reject unexpected DML, DROP/ALTER, ATTACH, PRAGMA, transaction control and other unsafe commands; test four malicious append cases.
- Apply DDL in a **fresh local** SQLite memory database only; assert exactly five empty tables, four triggers, one explicit index, foreign-key and integrity checks.
- Check that schema reapplication fails rather than silently mutates an existing database.
- Run existing quote-to-invoice guarded SQLite test (13 invalid cases, revocation, replay, idempotency) again to guard source compatibility.

The PR CI job has **no Cloudflare client, credentials, environment secrets, API network calls, Worker deploy or D1 mutation step**.

## Recovery and permissions: mandatory prewrite gates

**No staging schema write is authorized by the old approvals** for creating the EMPTY D1 ([owner](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2670#issuecomment-7072333539), [independent `thusico`](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2670#issuecomment-7080771081)). Require **new operational decisions** after merging this source-only qualification:

1. Reconfirm actual current protected `main`, the **raw SQL SHA-256 above**, source-plan blob SHA, target account/D1 UUID, empty D1 catalog, and effective protected environment rules.
2. Confirm **new account** Workers plan and Time Travel eligibility/retention, current bookmark stored as *private evidence* (never in GitHub public comments), owner/operator identity, audit logs, and an independently reviewed restore runbook. A bookmark exists, but no actual restore test has been performed. **No restore will be attempted here.** Documentation: https://developers.cloudflare.com/d1/reference/time-travel/ ; audit: https://developers.cloudflare.com/d1/observability/audit-logs/ .
3. Prove staging writer token grants **only the new isolated account**, with explicit production-account access-denial using a **non-mutating** request; store token only in the protected GitHub environment without exposing values or issuing an unauthorized credential. Verify protected environment gates.
4. Obtain owner `adinosassist-stack` **new, exact-SHA schema-only execution decision** and independent `thusico` approval of precisely the same migration bytes/target/rollback conditions, plus protected environment deployment approval where required. Do not rely on PR review as operation approval.
5. Only if ALL conditions pass, a separately authorized operator may apply **the exact static DDL only** in a controlled one-time process and verify expected zero-row schema and audit. Fail closed on duplicate, unexpected schema, mismatch or permission issue.

**Subsequent synthetic acceptance/quotedraft canary** will require yet another independent owner/reviewer write approval with its own fixtures/hashes, tenant/customer consent model, recovery and cleanup policy. Production Worker promotion, real invoices, settlements and paid feature activation remain separately blocked.

No Cloudflare D1 write/restore, data seed, secret/token creation, Worker version/route/DNS, or production release is performed by publishing this package.
