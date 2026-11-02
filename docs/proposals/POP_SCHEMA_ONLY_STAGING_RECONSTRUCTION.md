# POP 070/071 schema-only staging reconstruction — qualification plan

**Status:** proposed evidence procedure, not permission to modify production or staging.

## Proven inventory
- Current production D1: `bw-compliance-os`, UUID `8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce`; read-only `sqlite_master` returned 573 objects including internal objects.
- Isolated POP staging D1: `bw-compliance-os-pop-staging`, UUID `812f9021-890b-41e6-8fa1-6001f90a9b53`; only the internal `_cf_KV` table.
- Production has `tenants`, `payment_orders`, `manual_payment_submissions`, but neither POP table.
- The pinned pre-070 repository candidate is **not** a production schema snapshot; the current consolidated schema covers fewer tables than the live database.

## Stage A — schema-only extraction and comparison (read-only)
1. Freeze exact reviewed main commit; capture time and read-only production D1 bookmark receipt.
2. Obtain schema **definitions only** from `sqlite_master` excluding the internal SQLite/Cloudflare-managed objects. Do not retrieve any customer rows, payment references, tokens, R2 objects or D1 exports containing customer content. Store any sensitive SQL definitions in restricted CI artifacts only.
3. Compare table names, column names/types/nullability/defaults/PKs, indexes, views, triggers and FK targets/actions. Treat unresolved drift and missing migration history as stop conditions.
4. Strip unsafe environment-dependent functions and operational seeds under independent review; do not invent absent migration history or claim the schema-only baseline equals production data.

## Stage B — isolated staging reconstruction (separate authorization)
1. Ensure exact staging UUID and environment have independent access; never point a write-capable token to production.
2. Approve a bounded initialization plan for the **empty staging database only**, using the reviewed, sanitized, compatible pre-070 DDL, excluding customer rows.
3. Run schema and integrity comparisons. If mismatched, stop and collect evidence; never repair by applying arbitrary SQL.
4. Apply checksum-pinned `070_payment_pop_documents.sql` followed by `071_payment_pop_runtime_compat.sql` **in staging only**. Verify columns, indexes, FKs, duplicate-replay failure, zero unexpected mutations and POP features disabled.
5. Rehearse staging restoration separately and record immutable backup/restore receipts with reviewer signoff.

## Production migration hold
Any production 070/071 application requires separate explicit owner authorization, recoverable production backup proof, exact main and SQL checksums, independent `thusico` review, protected environment approval, bounded phase-scoped migration workflow, and post-migration read-only checks. Never activate subscriptions from customer POP alone. Phase 0 and authenticated AI Dock acceptance must pass before unrestricted launch.
