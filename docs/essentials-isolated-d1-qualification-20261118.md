# Essentials isolated D1 qualification — 2026-11-18

## Verified resource (read-only Cloudflare API)
- Account: `ddd23cab31928a4bb3d4998df9b26d1d`
- Dedicated D1: `bw-essentials-invoice-drafts-isolated-staging`
- UUID: `f6d35915-851a-4771-9e07-589572dc4d05`
- Read replication disabled; no Worker binding or public route enabled.
- Prechange recovery bookmark: `00000000-00000006-00005127-786aec848f652b3e079e3069f359e570`
- `sqlite_master` read-only inspection: only Cloudflare internal `_cf_KV`; no application tables, triggers or indexes.

## Preflight finding — migration dependencies absent
`essentials_invoice_drafts_STAGING_ONLY.sql` references `tenants`, `users`, and `finance_customers`. These do **not** exist in this fresh isolated database. The migration cannot be meaningfully qualified by applying it alone; the test harness must first provide a reviewed synthetic fixture schema or a separately qualified, minimal staging-only dependency setup. No production data is required.

## Execution gate
1. Review exact branch SHA and checksum of migration plus synthetic dependency fixture.
2. Obtain separate owner authorization for applying the exact fixture and draft migration to **only** the UUID above, followed by independent `thusico` approval per protected workflow.
3. Capture fresh prechange D1 bookmark, verify empty application schema, then apply only the approved synthetic fixture and draft migration.
4. Verify schema, tenant/customer trigger, uniqueness, same-key retry, foreign keys, and rollback using synthetic records.
5. Capture postflight evidence; do not bind a Worker or expose public routes.
6. Keep Finance Core production and other staging databases untouched.

## Current status
Provisioned and read-only verified. **No migration or synthetic fixture applied.** Offline GitHub Essentials qualification passed at SHA `883ae51e09d9d31a98410471dbdb65a49f17d20f`; later commits require fresh qualification.
