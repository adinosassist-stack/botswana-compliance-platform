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
- The browser requires an explicit successful mutation acknowledgement before reporting a save. If a post-save register refresh fails, it attempts an authenticated exact-record (or sealed service-history) readback before reporting verification; additional writes remain disabled until the register reloads. Invalid register payloads fail closed, and CSV export is unavailable while the register is not ready.
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

## Authenticated isolated staging acceptance gates

The optional authenticated staging entry is **not the deployed status-only staging Worker**. It requires three independently configured opt-ins: `ASSETS_STAGING_AUTH_ACCEPTANCE_ENABLED=true`, `ASSETS_STAGING_WRITES_ENABLED=true`, and `THEBE_CORPORATE_ASSETS_ENABLED=true`, in addition to exact-source, isolated D1 marker/schema, HTTPS origin, session, CSRF and sealed-audit prerequisites. The status-only scaffold remains read-only with both asset and write flags false.

Authenticated staging schema preflight verifies the required columns for the
asset register, service recording, canonical sealed audit append, failure
recording and audit-chain verification; a partial table definition fails closed.
This is a read-only metadata check, **not** a SQL migration, authenticated
write-rehearsal result or approval to initialize the isolated D1. Its Cloudflare
inventory currently reports zero tables, so schema provisioning remains a
separate protected write operation requiring explicit authorization.

For staging, verify that both `SESSION_SECRET` and `AUDIT_INTEGRITY_SECRET` are **Worker `secret_text` bindings** (not plain-text variables) using Cloudflare metadata, never by revealing their values. Previously plain-text staging values must be rotated to fresh, unrelated values in the Secret type before acceptance. A nonempty runtime value or a dashboard-listed variable name is not proof of secure binding. This code-only gate does not replace protected deployment review or a real authenticated login → CSRF → create/edit → audit → readback test.

## Offline synthetic backup and recovery rehearsal

`tests/corporate-assets-staging-synthetic-backup-restore.test.mjs` creates an
**ephemeral local SQLite database**, using the checked-in canonical auth/audit
DDL, the reviewed Corporate Assets schema, and the isolation marker. It seeds
only synthetic users, tenants, assets, service records, a session and sealed
audit events. It then:

- Creates a local SQLite backup using `VACUUM INTO` in a private temporary
  directory, checks a SHA-256 digest, and opens the snapshot independently.
- Checks SQLite integrity, foreign keys, tenant-scoped asset reads, the original
  synthetic session, audit-chain verification and the read-only staging schema
  preflight against the restored database.
- Proves the deployed status-only entry continues to reject asset writes, and
  that altered backup bytes or tampered audit events cannot pass integrity
  checks. All temporary files are removed.

This is **not** a remote Cloudflare D1 backup, a validated production restore
or permission to initialize the staging database. It cannot prove provider
time-travel/restore bookmarks, Cloudflare deployment rollback, real key
continuity or the absence of all external database writers. Cloudflare's
isolated staging D1 must still be independently identified and reviewed before
any separately authorized schema/bootstrap or restore operation. The existing
Worker stays private with both Assets and writes disabled; credential/source
provenance and independent `thusico` approval remain mandatory.

## Source-only staging D1 bootstrap receipt (not an execution workflow)

`scripts/corporate-assets-staging-offline-bootstrap-receipt.mjs` assembles a
**minimal, reviewable SQL candidate** from the existing canonical auth DDL,
audit-lineage migration and the separate Corporate Assets schema. It preserves
the non-relabeling staging identity marker introduced in PR #2550. All code
is local file I/O, and has **no Cloudflare client, Wrangler execution, network
request, token or automatic migration**.

Its informational receipt requires the explicitly identified isolated D1
`bw-corporate-assets-staging` (`e19f09de-3bb9-4021-b4f8-44df04c8aaa8`),
a valid exact matching source commit, and an explicit *empty* SQLite catalog
observation from `sqlite_master`. The obsolete Cloudflare `num_tables` field
is **deprecated and not a reliable emptiness test**. A nonzero/unknown count,
any existing application table/index/trigger/view, any existing identity marker,
or any observed data causes the bootstrap receipt to fail closed. This receipt
is still only *caller-supplied review evidence*, not independently authenticated
Cloudflare emptiness or permission to run SQL. It computes deterministic
SHA-256 digests of the candidate SQL and its three canonical source inputs.
**Even a passing receipt cannot authorize or safely execute remote SQL.**

`tests/corporate-assets-staging-offline-bootstrap-receipt.test.mjs`
creates the candidate schema in ephemeral *in-memory* SQLite, runs the actual
read-only staging schema preflight and tests negative metadata, stale SHA,
missing audit uniqueness and destructive DDL cases. It exercises the locked
status-only staging Worker and proves that it still blocks writes.

### Existing staging D1: reconciliation required, not bootstrap

**Read-only observation, 16 November 2026:** The account-wide D1 list
reported `num_tables=0`, the dedicated database GET reported 11, and an
independently executed **SELECT-only** query against `sqlite_master` showed
11 application tables plus Cloudflare's internal `_cf_KV` table. The staging
marker identified the correct isolated D1. Aggregate row counts showed
nonzero tenants, users, memberships, one asset, one service, and the marker.
The provenance of those records has **not** been established; do not assume
they are disposable synthetic fixtures. `audit_integrity_checks`, required
by the canonical authenticated staging preflight, was **missing**. The
available D1 Time Travel bookmark was checked for presence only; its value
was not logged, and no restore was initiated.

`assessExistingAssetsStaging` accepts a **sanitized, externally supplied**
schema-object catalog, aggregate row counts, marker and source SHA, then
reports the missing required tables and the nonempty table names without
returning any personal or customer records. It is **not a Cloudflare query
runner**, does not authenticate the upstream evidence, and always returns
`bootstrapAllowed=false` and `additiveRepairAuthorized=false`.

**Non-destructive protected remediation path (not executed):**

1. Reconfirm the current-main SHA and dedicated D1 identity via independently
   authenticated metadata GET; inspect the actual `sqlite_master` catalog,
   required `PRAGMA table_info` columns, aggregate row counts and isolated
   marker with **read-only SQL**. Do not use `num_tables` as proof of emptiness.
   Record only sanitized evidence; do not copy record values.
2. Establish ownership/provenance and retention rules for existing records;
   independently preserve/qualify a pre-change D1 Time Travel bookmark and an
   approved recovery method. **Restoring a bookmark overwrites database state**
   and needs its own protected authorization.
3. Design a **narrow additive** migration for missing
   `audit_integrity_checks` and its required indexes, compare the
   canonical reviewed DDL and any other schema/index dependencies, and
   test it against a separate synthetic offline copy. Never replay the
   complete bootstrap bundle over this populated D1.
4. Obtain new explicit owner **staging-D1 additive-write** approval pinned to
   the exact reviewed source SHA, independently approved `thusico` protected
   environment review, and a verified isolation/rollback plan before
   any actual D1 schema operation. Recheck the live schema immediately before
   the permitted operation to block drift or unexpected writers.
5. Keep the private status-only Worker, all public routes, staging write
   flags and Assets activation disabled while credential-binding safety,
   source-byte provenance, session/audit continuity and authenticated
   staging E2E are qualified in separate approvals.

Provider references: [D1 metadata fields](https://developers.cloudflare.com/api/resources/d1/),
[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

This candidate covers the **minimum** auth/audit/Assets table subset needed
for the targeted staging preflight. It does not claim complete parity with
all production user-registration, billing, tenancy or workflow paths.
Before any authorized Cloudflare D1 initialization, an independently
protected operator must inspect live database identity, emptiness/objects,
D1 backup/restore safeguards, schema/index dependencies and isolation from
other Workers. Explicit separate owner authorization plus independent
`thusico` approval must be recorded for the *specific* private staging D1
write operation. Future deployments, key rotation, authenticated write E2E
and production migration/Assets activation require **other approvals**.

## Validation

`npm run test:corporate-assets` covers validation, tenant boundaries, owner-only
financial/status changes, duplicate serials, optimistic concurrency, sealed audit
rollback, schedule supersession and shared-shell injection. The client runtime CI
runs `tests/corporate-assets-browser.mjs` in Chromium for native navigation,
forms, history, narrow-screen containment and clearing records on navigation.
Browser screenshots contain synthetic fixtures only. Local tests/builds do not
prove staging or production activation.
