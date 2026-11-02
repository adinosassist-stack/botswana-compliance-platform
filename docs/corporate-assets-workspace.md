# Corporate Assets workspace

Native Cloudflare workspace extension for owners and managers. Uses the existing
navigation, hero/cards/buttons, origin/CSRF/session transport and shared charcoal
AI dock. Asset records are never copied from the earlier browser-local demo.

## Implemented

- Tenant-scoped register with a 1,000-asset per-tenant cap and 100-record keyset pages, search/category filtering
  of the visible page and explicit current-page CSV export (money in minor units).
- Asset name, category, branch/location label, serial/VIN, custodian, acquisition
  date/cost, recorded book value and status. Case-insensitive serial uniqueness
  within a tenant. Integer minor-unit money only; no depreciation/tax valuation.
- Versioned edits; stale updates fail with conflict rather than overwriting.
  Only owners may retire/write off or change an existing asset's financial values.
- Append-only service/repair/insurance/warranty records. Latest record per asset
  and kind supersedes its previous due date in the schedule, without deleting
  history. Dashboard due count includes overdue dates and the next 30 days for
  active/maintenance assets; these are in-app dates, not outbound notifications.
- Each successful mutation is in the same D1 transaction as a sealed audit entry
  and chain update. Missing audit integrity or failed audit writes deny mutation.
  History is available per asset (latest 100 entries).
- No client-selected tenant/actor, external messages, payment actions, journal
  postings, document uploads, production migration or automatic AI execution.

## Qualification and activation

`THEBE_CORPORATE_ASSETS_ENABLED` is **false** in production configuration. Missing
schema fails closed. `cloudflare/schema/corporate-assets.sql` is an additive
schema proposal, deliberately outside the automatic numbered production migration
chain. Do not execute it against production. First rehearse the exact schema and
feature tests on a separately approved staging target with the existing tenants,
users and sealed audit tables. Review data retention/export/deletion coverage and
operational limits before production promotion. Obtain separate production D1
write authorization and normal independent release approval; promote the reviewed
schema through the repository's protected migration process, then explicitly
activate the flag only after authenticated acceptance checks. Existing release
readiness/migration-tip requirements are unchanged. Node/Postgres fallback does
not implement these endpoints in this phase; it must not advertise this module.

## Validation

`npm run test:corporate-assets` covers validation, tenant boundaries, owner-only
financial/status changes, duplicate serials, optimistic concurrency, sealed audit
rollback, schedule supersession and shared-shell injection. The client runtime CI
runs `tests/corporate-assets-browser.mjs` in Chromium for native navigation,
forms, history, narrow-screen containment and clearing records on navigation.
Browser screenshots contain synthetic fixtures only. Local tests/builds do not
prove staging or production activation.
