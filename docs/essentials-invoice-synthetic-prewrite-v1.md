# Essentials invoice — synthetic prewrite v1 (OFFLINE ONLY)

**Tracking:** #2670 | **Prepared against main:** `a29a735317a34aad251724a67b4100342ec08bff`.

This is a deterministic, synthetic prewrite **qualification fixture**, not a customer consent receipt, staging-write authorization, executed migration, approved bank transaction, or production deployment. DO NOT copy and run the fixture remotely. The SQL statements used in CI are extracted from the checked-out, existing source and run exclusively in fresh `:memory:` SQLite.

## Canonical fixture
- File: `tests/fixtures/essentials_invoice_prewrite_synthetic_v1.json`.
- Git blob: `a4c29190e994bd1b1487d8b9717ca0f129ffe492`.
- **Exact raw fixture SHA-256:** `6071f9c7fce4e3db8f9e76c1919239a681c69a3ec325a72af19e44278ed88d24`.
- Fixed synthetic tenant, actor, customer, quotation, invoice and BWP minor amount in the fixture. No real customer IDs or payment data.
- `readyForRemoteWrite=false`; this remains false in the source fixture after code merge.
- Source: `server/essentials-accepted-quotation-guard.mjs` guarded atomic `INSERT SELECT` and `server/essentials-guarded-idempotent-replay.mjs` same-D1 lookup; reuse current checked-out source and no new privileged service.

## Exact resource boundaries
| Dimension | Exact permitted value for a *future separately approved* staging rehearsal |
|---|---|
| Cloudflare account | `ddd23cab31928a4bb3d4998df9b26d1d` |
| Isolated D1 | `bw-essentials-invoice-drafts-isolated-staging`, UUID `f6d35915-851a-4771-9e07-589572dc4d05` |
| Forbidden production D1 | `bw-compliance-os`, UUID `8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce` |
| GitHub protected environment | `essentials-invoice-staging-protected`, ID `28124961923` |
| Independently required reviewer | `thusico`; owner cannot self-review; admin bypass OFF; `main` only, no tags |
| Secret status | No dedicated environment secret on last UI verification; **no execution credential approved** |
| Worker/public route | None authorized |
| Production/legal/bank/issuance scope | Excluded; no customer activation |

## Offline acceptance, no remote writes
`python3 -B tests/essentials_invoice_prewrite_guarded_sqlite.py` runs the already-existing fixture dependency SQL and existing applied schema in local memory, then exercises the checked-out guarded INSERT and replay SELECT:
1. Guarded accepted synthetic quote creates exactly one `draft` with consistent tenant, customer, reference, amount, and BWP currency.
2. 13 negative conditions insert zero rows: cross-tenant/customer, wrong quote/reference/version/amount, and seven malformed draft payload fields (including USD, altered total and issued status).
3. Duplicate same idempotency key/source cannot create another invoice; replay SELECT only succeeds while acceptance is valid.
4. Irreversible revocation denies subsequent insert and replay; schema forbids unrevoke/delete.
5. SQLite quick integrity check and zero foreign-key errors. DB exists only in memory and is discarded when the test ends.

The isolated D1 had **zero draft invoices, zero active accepted quotes, one revoked historical synthetic quote, four expected triggers**, `PRAGMA quick_check=ok`, zero FK violations at last remote read-only inspection. The schemas were previously applied—**do not repeat migrations**.

## Not yet proven; mandatory prewrite authority
- Current exact `main` SHA must be independently rechecked immediately before an eventual staging write, **not** assumed to equal the preparation SHA in the fixture.
- Recheck fixture **raw** SHA-256, existing SQL raw SHA-256, actual guard/replay source, and the complete synthetic SQL execution plan/parameters. The offline fixture is **not** an approved remote execution program.
- Verify effective credential scope. Same Cloudflare account contains production D1; no broad account-wide D1 Write permission may be used for convenience. Avoid any remote write if a truly isolated operator scope cannot be proven. The existing Cloudflare connector is acceptable for read-only inspection, not a replacement for protected execution authority.
- Confirm fresh D1 Time Travel bookmark, effective retention window, independent rollback/restore runbook and audit before write. Bookmark availability **does not** prove retention/restore eligibility; do not invoke the restore endpoint as a test on this live staging database without separate authority.
- Owner `adinosassist-stack` must independently initiate an exact-source, target, fixture, recovery and synthetic-write decision in #2670; `thusico` must separately approve that identical scope. Both are additional to the protected environment job gate.
- Remote synthetic test requires explicit approval for a NEW active accepted quote and one draft, plus durable accounting of the immutable/revoked evidence and cleanup; a committed local fixture does **not** constitute real authenticated customer consent.
- **No D1 INSERT, UPDATE, DELETE, RESTORE, Worker route, version, deployment, customer invoice issuance, payment settlement or production activation** is authorized by this document or by merging the PR.

**Required stop:** any SHA, SQL/fixture checksum, D1 UUID, credential, reviewer, recovery or pending approval mismatch.
