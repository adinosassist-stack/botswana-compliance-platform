# Production POP schema migration 070 → 071: controlled execution plan (NOT authorization)

Status: proposal only. No production migration has been applied by this document.

## Evidence (read-only production inspection)
- GitHub Actions run 40782512579 on main f33822c6dafdf600d3fcedb82a7adab166141e47.
- D1 target identity verified by read-only inspector: bw-compliance-os.
- Prerequisite tables tenants, payment_orders, manual_payment_submissions are present.
- payment_pop_documents and payment_pop_upload_requests are absent.
- d1_migrations table absent. This is not evidence of schema-history cleanliness: determine the database's actual migration mechanism before writing.
- No production mutation occurred during inspection.

## Immutable SQL under review
1. cloudflare/migrations/070_payment_pop_documents.sql (creates POP documents table, scan and order indexes; pending only).
2. cloudflare/migrations/071_payment_pop_runtime_compat.sql (12 additive document columns and reservation table/index; requires 070 first).
- Current verified SHA-256 of 071: 24cb1d9e42ef6edaaf04ba53f3945f5112cc61b0c3d52010480be4603c38dc3c.
- Pin exact main head and verify sha256 for BOTH migration files from reviewed commit before any execution. Recompute if main changes.

## Preflight: mandatory, do not assume
1. Authorized operator confirms production database UUID, account, environment, access scope and exact target identity. No staging/production cross-wire.
2. Read-only inspect sqlite_master, PRAGMA foreign_key_list and table_info for all dependent tables and indices. Confirm 070's CREATE TABLE foreign key targets/columns and no incompatible objects or partial 070 state.
3. Inspect existing migration tracking strategy including Cloudflare D1 migration metadata and prior release manifests; do not create a synthetic d1_migrations table or falsely record history.
4. Obtain an independently restorable pre-change D1 backup/bookmark suitable for the actual production database; record backup ID, timestamp, recovery procedure, retention and authorized restore operator. Perform recovery rehearsal separately with staging data; do not presume point-in-time features are available.
5. Rehearse exact SQL 070 then 071 against an isolated environment with production-compatible schema, verify constraints and indexes, check zero unexpected data effects, and keep POP feature flags OFF.
6. Capture immutable review artifacts: exact schema snapshots, SQL file checksums, dry-run report, backup receipt, rollback/compensating restore plan, operator and independent reviewer.

## Protected execution gate (NOT part of this PR)
- Separate PR and GitHub Actions workflow for a precisely bounded, human-dispatched schema application; use production environment required reviewer thusico, main-only, exact-SHA, checksum and target guards, explicit phase confirmation and exclusive concurrency.
- 070 and 071 are distinct gated phases; halt if either phase is incomplete. Do not blindly rerun 071: ALTER TABLE ADD COLUMN may fail on partial state.
- Require explicit owner authorization for production write, separately from approval of documentation. Independent reviewer approves exact-head implementation; environment approval must not be bypassed.
- Never run a generic migration bundle, D1 remote execute, arbitrary SQL input, or hidden auto-apply.
- After each phase, run read-only inspection of required columns/indexes/FKs and compare to reviewed manifests. Require verified written evidence before considering feature rollout.

## Business safeguards
- POP uploads, scanning and all payment activation remain OFF unless separately qualified and approved.
- A customer POP, bank reference or uploaded document does NOT establish funds received. Activate a subscription only after matching funds are independently visible in the Thebe Desk company bank account.
- A migration is schema preparation, not financial settlement, entitlement grant or production feature release.

## Stop conditions
- Unexpected existing POP objects, missing prerequisite columns, ambiguous migration history, no recoverable backup, SHA drift, failed rehearsal, target mismatch, revoked reviewer approval or any SQL side effect beyond 070/071: STOP and investigate; do not auto-correct production.
