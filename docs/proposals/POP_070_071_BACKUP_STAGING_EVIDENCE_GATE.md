# POP 070/071 — backup and staging evidence gate

This checklist is a **hold point**, not authorization to migrate production. Never infer backup availability from a successful read-only schema inspection.

## Updated read-only staging evidence — 4 November 2026
- Production D1 catalog: **573 SQLite schema objects**, no POP tables; staging: **578**, including exactly two POP tables and three reviewed POP indexes.
- All **573** production objects are present in staging; shared `sqlite_master.sql` definitions and object owners are unchanged. Five additional staged objects match the reviewed 070/071 names and table owners exactly.
- Staging D1 reports 233 application tables, zero foreign-key violations and `PRAGMA quick_check=ok`. This is a point-in-time schema inspection, **not an authenticated 070/071 migration execution receipt**.
- The former empty-staging/pre-070 initializer must **not** be replayed against the populated staging target. Its schema shape alone does not authorize production migration, activate POP ingestion or prove a recovery-time objective.
- The read-only catalog and digest workflows are configured for an exact current `main` SHA and protected environment approval. Their schema-only review is a fail-closed check of exactly the five planned additions, not a migration or launch attestation.

## Historical evidence
- Last read-only production inspection: GitHub Actions run 40782512579; prerequisite tables exist, POP 070/071 objects are absent; d1_migrations was not found.
- Isolated **minimal-fixture** SQLite rehearsal (PR #1928) passed. This does not prove compatibility with a production-like database or a recoverable Cloudflare D1 backup.
- Verified main when drafted: 94f11ca79391c2db32e5618b48c197d51fb24d61. Recheck current main before using.

## Backup receipt — must be supplied by authorized operator
- Cloudflare account/environment/database name and UUID (compare with production inspection)
- Actual supported backup mechanism (D1 Time Travel/bookmark or verified alternative), backup identifier/bookmark and timestamp
- Retention window and expiry, status, scope and how to restore without production experimentation
- Independent staging restore rehearsal evidence and operator/reviewer sign-off
- Backup evidence should not contain API tokens, passwords, customer bank information or private payment documents

If any item is unknown or unverified, **STOP**. Do not represent a proposed backup as completed.

## Production-compatible staging rehearsal — mandatory
Repository-only pre-070 candidate preparation is available with
`python3 scripts/prepare-pop-pre070-baseline.py` (manifest) or `--schema`
(candidate SQL). It removes only the byte-identical embedded 070 from the
checksum-pinned consolidated schema, preserving unrelated schema and seed SQL.
Offline tests verify complete schema/seed equivalence after reapplying 070,
ordered 071, fixture survival, FK integrity, source-drift rejection and unsafe
071 replay rejection. This candidate is **not a production snapshot**. Compare
it independently against the current production schema before accepting it as
the staging baseline. No remote initialization or execution authority is granted.

1. Use a distinct, isolated staging D1 database with explicit name/UUID. Confirm it is NOT the production UUID.
2. Build schema from reviewed production-compatible baseline; verify tenant/payment_orders/manual_payment_submissions columns, indexes, FKs and existing objects.
3. Apply exact checksum-pinned migration 070 then 071 only on that isolated staging target.
4. Verify 070 documents table, two scan/order indexes, 071 metadata columns, reservation table/index, both foreign keys, and zero unintended changes.
5. Exercise partial-state and duplicate-application failure cases; do not promise automatic idempotence for 071 ALTER TABLE statements.
6. Record staging DB name/UUID, exact commit, both migration hashes, pre/post schema snapshot, test logs and recovery rehearsal.
7. Keep POP uploads, scanning and subscription activation OFF.

## Independent execution decision
A separate reviewed and protected workflow is required for any production migration. Prior CI, draft PR review, backup receipt, or staging rehearsal does **not** constitute permission to write production. Owner must expressly authorize the production schema write; independent reviewer thusico must review exact-head workflow and approve protected deployment per GitHub protections.

## Payment safety
POP references and uploads are not proof of settled funds. Only activate paid subscriptions when matching funds are independently visible in Thebe Desk's bank account.

## Evidence status (28 October 2026)
- Production prerequisite read-only inspection: COMPLETE, POP schema absent.
- Static source preflight: COMMITTED, no production write.
- Minimal isolated SQLite rehearsal: PASSED.
- Recoverable production D1 backup: NOT VERIFIED.
- Production-compatible staging rehearsal: NOT VERIFIED.
- Production execution workflow and explicit production write authorization: NOT COMPLETE.
