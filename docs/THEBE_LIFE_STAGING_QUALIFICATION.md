# Thebe Life: private staging qualification batch

**Status:** reviewed-code candidate only. No resources were provisioned, databases migrated, staging Worker deployed, public route registered, or customer funds touched.

## Purpose
Prepare the next safe integration phase after PR #2283 merged. The module `cloudflare/src/thebe-life-staging-preflight.js` performs a **read-only** inspection of a *separately provisioned* synthetic-only D1 database and refuses to qualify if:
- environment/profile are not exact private Life staging;
- household, insurance, motshelo payment or public-route flags are enabled;
- staging D1 ID is missing or matches the independently verified production D1 ID;
- exact source SHA is missing/mismatched;
- synthetic-only data classification isn't present;
- any required Life table is missing or the D1 read fails.

## Important scope limits
- The preflight only checks table names, not full migration compatibility, column constraints, foreign keys, indexes, storage access rights, row-level permissions, or account-level Cloudflare bindings.
- An isolated ID does **not** prove the binding actually resolves to that database. Verify Cloudflare account and D1 identity independently.
- D1 is SQLite, not PostgreSQL. Existing PostgreSQL RLS proposals must never be applied as D1 migrations.
- `docs/sql/thebe-life-d1-proposal.sql` must be adapted to a reviewed numbered migration and exercised against isolated fixtures with rollback rehearsal.
- Never enable live Life reads or writes based on this preflight alone.
- Do not repurpose existing billing, POP, operations, General AI or production databases for Life staging.
- Require tested tenant/household isolation, retention, backup/restore, policy approval, independent `thusico` review and exact-SHA release checks before any public activation.

## Offline test
`node --test tests/thebe-life-staging-preflight.test.mjs`

## Follow-on work
Provision a **dedicated** `bw-life-staging` D1 database and private Worker (subject to explicit infrastructure approvals and policies); review synthetic fixture migration, bind least-privilege credentials, confirm the actual Worker import/build graph, then run private staging authentication and household isolation smoke tests.
