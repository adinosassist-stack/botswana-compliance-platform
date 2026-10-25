# Empty regulatory staging baseline initialization

The read-only audit can fail with `query_sources / schema_missing` when the
designated D1 database has not been initialized. Retrying that audit cannot repair
the schema. This is a separate, explicitly approved database write operation.

## Reviewed operation

Workflow: **Regulatory Staging Empty Database Bootstrap**.

The only imported file is the reviewed revision of `cloudflare/schema.sql`.
It creates the repository's baseline tables, indexes and triggers, applies its
embedded schema changes, and inserts its static platform catalog/entitlement
defaults. This is baseline initialization, not application of every later file
in `cloudflare/migrations`. It does not import a regulatory foundation pack,
create tenant records, seed v1.7 fixtures, approve sources/rules or deploy a Worker.

Local integration tests execute the actual baseline and all four existing audit
queries, check SQLite integrity/foreign keys and confirm no tenant, user, source,
rule or obligation records are inserted. Remote D1 compatibility is verified only
when the protected workflow runs successfully.

The guard verifies Cloudflare's remote UUID and exact staging name before a pinned
read-only `sqlite_schema` count. Any existing application table, index, view or
trigger refuses initialization; only SQLite's reserved internal objects and
D1's `_cf_KV` are excluded. A partial/existing schema needs a separately reviewed
repair. Production-ID exclusion and staging-name restrictions remain enforced.
Wrangler receives a temporary configuration containing only the verified staging
binding; the production Wrangler configuration is never used.

## Operator steps

1. Review and merge this change after required checks and independent approval.
   Retain the `regulatory-staging` environment's required reviewer and main-only
   branch protection. Keep other tools/operators from writing this database
   during initialization; the identity/empty check and import are distinct API
   operations, not a single atomic conditional import.
2. Create a short-lived dedicated Cloudflare token with **Account > D1 > Edit**
   on the account containing the staging database. Cloudflare's API names this
   permission **D1 Write**. Where supported, narrow it to the staging account;
   do not assume this token is restricted to one database within a shared account.
   Save it as environment secret `REGULATORY_STAGING_BOOTSTRAP_TOKEN` in
   `regulatory-staging`. Never put the value in chat, a variable or a repository
   file. The existing read-only audit token remains separate.
3. Dispatch **Regulatory Staging Empty Database Bootstrap** from `main`, supplying
   its exact current 40-character SHA and `INITIALIZE_EMPTY_STAGING`.
   The designated environment reviewer must approve the write operation.
4. The workflow runs local guards/tests, installs lockfile-pinned Wrangler,
   rechecks current main, verifies remote identity and emptiness, then executes
   the baseline SQL using `wrangler d1 execute --remote --file`. Provider output
   is withheld from public logs. A failure stops the workflow; inspect staging
   before retrying. Never drop tables or change target IDs to force a pass.
5. The existing read-only audit runs with its read-only token after initialization.
   Revoke the temporary write token and remove its GitHub secret when finished.
   Keep the read-only token for subsequent evidence collection.

An empty-baseline audit success establishes schema/query connectivity only.
The reviewed v1.7 fixture preparation and actual v1.8 import qualification in
[the staging qualification guide](regulatory-v18-staging-d1-readonly-qualification.md)
remain separately authorized work. Never represent zero source/rule counts as a
populated migration qualification or production approval.

References: [Cloudflare D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
and [Wrangler D1 execute](https://developers.cloudflare.com/d1/wrangler-commands/#d1-execute).
