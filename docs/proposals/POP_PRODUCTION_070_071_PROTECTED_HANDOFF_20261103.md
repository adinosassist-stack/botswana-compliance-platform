# POP production 070 → 071: protected execution handoff

Status: **HOLD / review-only**. This is not production write authorization.

## Verified facts
- Production D1: `bw-compliance-os`, UUID `8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce`.
- Isolated POP staging: UUID `812f9021-890b-41e6-8fa1-6001f90a9b53`.
- Production prerequisites `tenants`, `payment_orders`, `manual_payment_submissions` exist.
- Production POP tables and three indexes are absent on latest read-only inventory.
- Staging already has the 070/071 objects. Never replay 071 there.
- Read-only POP preflight is on main through independently reviewed PR #2124.

## Execution gates, in mandatory order
1. Owner approves the backup retention period, protected R2 object prefixes, recovery point and deletion/rotation process; independent reviewer validates the lock policy and effective Cloudflare state.
2. Bind the intended release window to an approved, checksum-verified recoverable backup, verified tenant isolation, and independently accepted rollback strategy.
3. Freeze exact reviewed current main SHA, production Cloudflare account, database UUID and immutable SHA-256 of both SQL migration files. Refuse stale source or target drift.
4. Engineer an independently reviewed, human-dispatched protected production workflow, with isolated single-phase 070 and 071 jobs, required reviewer `thusico`, explicit owner write authorization, and global serialization. Never depend on typing a confirmation string alone.
5. Before 070: verify prerequisite tables, dependent keys, complete absence of both POP tables and their named indexes, and source checksums. No speculative schema repair.
6. Apply only the approved 070 file, once, in the reviewed protected phase. Read-only verify table, both indexes, foreign keys and expected columns. Stop on mismatch.
7. Before 071: reconfirm exact source/head, 070 completeness, and absence of ALL 071 additive columns and upload-request objects. Partial 071 or already-applied 071 must STOP; no replay.
8. Apply only the approved 071 file, once, in a separately authorized protected phase. Read-only verify 25 document columns, 8 upload-request columns, all three indexes and foreign keys. Check post-phase row counts and integrity without exposing sensitive values.
9. Keep POP uploads/scans/payment activation OFF. Perform separately approved authenticated owner acceptance; a customer POP or reference does NOT prove cleared funds. Confirm actual bank receipt before activating a subscription.
10. Qualify a separate manifest-only promotion through BF-07 and protected deployment, followed by exact-SHA live acceptance.

## Evidence gaps
- No approved production R2 object lock/retention rules.
- Production recovery acceptance and rollback signoff are separate from successful existing-restore technical tests.
- No independently reviewed and authorized 070/071 production execution workflow has been qualified.
- Owner authenticated bank-confirmed activation E2E remains open as #1874.

**No Cloudflare resource mutation or production data write is authorized by this file.** Any production schema changes require separate scope-specific owner and independent reviewer approval. If core-only release is selected, retain the independently reviewed hard-off POP freeze, and do not claim POP has been enabled.
