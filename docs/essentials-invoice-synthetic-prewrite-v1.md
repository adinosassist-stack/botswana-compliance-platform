# Essentials invoice — synthetic prewrite v1 (OFFLINE ONLY; isolated-account retarget)

**Tracking:** #2670 | **Retarget prepared against protected main:** `c9e18c3c6d4e8ed9a3c7f51724ae9ca1360f511d`. This is a **source-only qualification**. No remote staging schema or data writes were authorized by preparing or merging this change.

The deterministic synthetic fixture and checked-out guarded SQL are exercised **only in fresh local in-memory SQLite**. It is not an authenticated customer consent record, a real invoice, a staging-write approval, an executed migration, a bank transaction, or a production deployment. **Do not run the test fixture directly against Cloudflare D1.**

## Canonical retargeted fixture

- File: `tests/fixtures/essentials_invoice_prewrite_synthetic_v1.json`.
- **Exact expected raw fixture SHA-256:** `af5adf776231c1be50cf0ade4f4de5377e2e6e16e5d6197c9a54a72a5ec9d866` (verify independently against checked-out bytes before merge and again before future operational approval).
- Original offline-only fixture SHA-256 before the retarget: `6071f9c7fce4e3db8f9e76c1919239a681c69a3ec325a72af19e44278ed88d24`. Historical, **no longer the canonical current fixture**.
- Fixed fake tenant, actor, customer, quotation and BWP minor amount; **no actual customer or bank data**.
- `readyForRemoteWrite=false`, `requiresNewOwnerApproval=true`, `requiresNewIndependentThusicoApproval=true`. These may **not** be flipped by this PR.
- `protectedMainAtPreparation` is the frozen audit baseline, **not** a substitute for checking current exact `main` before a future write.
- Real source guarded SQL: `server/essentials-accepted-quotation-guard.mjs`; replay: `server/essentials-guarded-idempotent-replay.mjs`. Neither is mounted or deployed by this PR.

## Resource boundary — NEW isolated Cloudflare account

| Dimension | Value |
|---|---|
| Target Cloudflare account | **Thebe Desk Essentials Invoice Staging**, `ae0dccfed66fc497259aebd81229f08d` |
| Target empty D1 | `bw-essentials-invoice-rehearsal`, UUID `4eb6c739-9c45-4756-bfa9-8ec0a6efb3be` |
| Read replication | Disabled |
| **FORBIDDEN** production account | `ddd23cab31928a4bb3d4998df9b26d1d` |
| **FORBIDDEN** production D1 | `bw-compliance-os`, UUID `8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce` |
| **FORBIDDEN** prior staging D1 in production account | `bw-essentials-invoice-drafts-isolated-staging`, UUID `f6d35915-851a-4771-9e07-589572dc4d05` |
| GitHub protected environment | `essentials-invoice-staging-protected`, ID `28124961923` |
| Independent reviewer | `thusico`; owner cannot self-review; admin bypass off; `main` only |
| Credential/Worker/public route | No approved execution credential, Worker deployment, or public route in this source-only batch |

The **NEW** D1 was created empty under [owner's resource-only decision](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2670#issuecomment-7072333539) and [independent `thusico` resource-only approval](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2670#issuecomment-7080771081). [Creation receipt](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2670#issuecomment-7080794153): exactly one matching D1, `num_tables=0`, zero application tables, only Cloudflare internal `_cf_KV` catalog entry, read replica disabled. **Those approvals covered creation of the empty D1 ONLY**, not installing tables or inserting synthetic records.

The **OLD** staging D1 had five application tables, four integrity triggers and one revoked synthetic acceptance from a different account. Do **not** copy or reapply that schema, credentials, approvals or historic account-level privileges to the new database. In particular **the new D1 has NO application tables or triggers** at this preparation point.

## Deterministic offline rehearsal (no Cloudflare calls)

Run `python3 -B tests/essentials_invoice_prewrite_guarded_sqlite.py`.

This offline test uses `tests/fixtures/essentials_d1_synthetic_dependencies_STAGING_ONLY.sql` to create fake dependency tables **in SQLite memory only**, then two checked-out candidate schema files: `cloudflare/migrations/essentials_invoice_drafts_STAGING_ONLY.sql` and `cloudflare/migrations/essentials_accepted_quotation_snapshots_STAGING_CANDIDATE.sql`. It exercises real guarded `INSERT SELECT` and replay SQL from server source, including:
1. Exactly one eligible synthetic draft with consistent tenant, customer, quotation and BWP amount.
2. Thirteen denied invalid cases across tenant/customer/quotation/version/amount and malformed payload.
3. Unique idempotency and same-source duplicate denial; replay allowed only for active acceptance.
4. Irreversible revocation blocks replay and further drafts.
5. `PRAGMA quick_check=ok` and no foreign-key violations.

**Important:** the dependency SQL file contains synthetic `INSERT` statements for the local test. It is **NOT an approved remote migration or seed plan**. The new D1 requires a separately designed, reviewed and approved synthetic schema plan before even a table creation, including recovery controls.

## Separate gates before any new-account D1 writes

1. Verify exact current `main` and source/checksums (new fixture SHA-256 above, raw SQL migration bytes, guarded insert/replay source); prepare an independently reviewed **explicit ordered staging-only schema plan**, including minimal synthetic dependencies and restrictions. Do not assume prior main/account approvals carry over.
2. Verify the D1 account/UUID boundary, a credential with write permissions **only in the NEW isolated account** (not production), protected environment secret handling, privilege-negative production access checks, and auditable operator identity. No token is created or used in this PR.
3. Obtain and retain a fresh Time Travel bookmark; validate the new Free account's actual retention and restore eligibility, including rollback runbook and independently reviewed recovery evidence. Bookmark availability alone is insufficient.
4. Record a **separate owner exact-SHA, SQL checksums, database UUID, recovery and migration approval**, followed by an independently authored `thusico` approval of precisely that schema action. Protected GitHub environment review also applies. **No migration is approved by the empty-resource creation decision.**
5. After successful separately authorized schema qualification, require **another separate** owner and `thusico` approval for inserting any synthetic acceptance/draft and executing idempotency/revocation/canary logic. Fake acceptance does not establish a real customer's informed consent.

**Stop if any exact SHA, raw checksum, account ID, D1 UUID, credential, review, schema or recovery condition does not match.** Do not execute D1 `CREATE`, `INSERT`, `UPDATE`, `DELETE`, `RESTORE`, Worker upload, route, DNS, subscriber/payment activation or production deployment under this source-only PR.

## Audit references

Issue [#2670](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/2670); offline proof merged in [PR #2753](https://github.com/adinosassist-stack/botswana-compliance-platform/pull/2753). This PR simply updates the isolated rehearsal target and makes the offline test reject references to the legacy staging and production accounts. No remote resources touched.
