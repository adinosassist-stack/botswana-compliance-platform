# Corporate Assets — protected isolated D1 audit repair

Status: **source candidate only; not authorized or dispatched**.

## Existing staging state

The isolated staging D1 bw-corporate-assets-staging, ID
e19f09de-3bb9-4021-b4f8-44df04c8aaa8, contains tenant,
user, asset and service records. The deprecated Cloudflare num_tables
metadata contradicted the actual SELECT-only sqlite_master catalog.
Preserve all records. Required audit_integrity_checks and two
associated indexes are missing. A D1 Time Travel bookmark exists,
but no restore or schema write is authorized here. The active
private Worker still has sensitive plain_text binding types,
and both Assets and staging writes remain disabled.

## Workflow and separation of authority

The proposed workflow file is
.github/workflows/corporate-assets-protected-audit-d1.yml.
PRs execute **offline tests only**, without Cloudflare credentials.

1. Default **preflight-only** uses a distinct D1 Read token. It verifies
   exact current main, independent thusico protected environment rules,
   isolated D1 identity, private Worker routing and disabled flags,
   actual SQLite schema objects, aggregate record counts, required
   existing columns, foreign keys and a D1 Time Travel bookmark.
   Only fixed SELECT and PRAGMA statements are submitted. It returns
   the additive SQL SHA-256 and bookmark SHA-256, never the raw bookmark,
   credentials, record contents or session data.
2. Future **apply-approved** is not authorized by a general "GO" or
   source PR approval. It requires a new explicit owner comment in
   issue #2204 bound to the reviewed main SHA, the isolated D1 UUID,
   the reviewed canonical SQL SHA-256 and the original prechange
   bookmark digest. The initiating GitHub actor must be adinosassist-stack,
   and independent thusico must approve the protected environment job.
   Changed live main, private Worker exposure, table shapes, row counts
   or bookmark hash deny execution.
3. If separately authorized, the only mutation is the three canonical
   CREATE statements for audit_integrity_checks and the two missing
   audit indexes. Existing row counts, D1 identity, added schema objects
   and the authenticated staging schema preflight are compared afterward.
   No Worker route, credential, asset flag or production resource changes.
4. On any provider error or partial application, **stop**, inspect and
   re-qualify manually. Never automatically retry DDL or run a Time
   Travel restore: restoration overwrites database state and needs a
   different owner scope and independent reviewer approval.

## Exact future owner issue comment

The comment must be posted by repository owner adinosassist-stack in
issue #2204 and remain unedited, and the numeric comment ID is required
in the protected dispatch. Replace only the three placeholders:

    ASSETS_STAGING_D1_AUDIT_ADD_SCOPE_V1
    authorization=APPLY_ISOLATED_ASSETS_AUDIT_ADDITIVE_ONLY
    source_sha=<40-hex current main commit SHA>
    database_id=e19f09de-3bb9-4021-b4f8-44df04c8aaa8
    sql_sha256=<64-hex digest from protected preflight>
    prechange_bookmark_sha256=<64-hex digest from protected preflight>
    writer_freeze=OWNER_ATTESTS_NO_OTHER_STAGING_D1_WRITERS
    scope=CREATE_AUDIT_INTEGRITY_TABLE_AND_TWO_INDEXES_ONLY
    customer_data_preservation=REQUIRED
    production_and_worker_changes=NOT_AUTHORIZED

The raw bookmark must be retained privately by an approved recovery
operator, never logged or pasted. The hash is evidence of continuity,
**not proof that a restore is safe or has been tested**.

## Dedicated protected environment secrets

- ASSETS_STAGING_GITHUB_READ_TOKEN: read main policy and owner comment
  authority, not source write credentials.
- ASSETS_STAGING_D1_READ_TOKEN: D1 Read access, preflight job only.
- ASSETS_STAGING_D1_AUDIT_WRITE_TOKEN: separately provisioned staging
  D1 Write, **future approved apply job only**. Never grant by changing
  permissions on the existing Worker token.
- ASSETS_STAGING_CLOUDFLARE_TOKEN: existing private Worker read metadata.
- ASSETS_STAGING_CLOUDFLARE_ACCOUNT_READ_TOKEN: existing separate
  account-wide Worker Domains read.

The runner pins the isolated target UUID, but that alone does not
prove provider token scope, isolation of other writers, a valid
recovery procedure or credential safety. Independently check
Cloudflare permissions and stop if account-wide D1 Write access
cannot be safely scoped or other writers cannot be frozen.
GitHub Actions concurrency excludes only this one workflow.

## Before any real staging D1 change

- Review exact-main CI and source PR with independent thusico approval.
- Establish existing staging record provenance and retention approval.
- Verify live schema and read-only provider preflight on reviewed main.
- Record an approved Time Travel bookmark and independent recoverability,
  with a separate plan for a possible restore.
- Obtain a *fresh* exact owner issue comment and independent protected
  environment approval for the fixed additive SQL and target.
- Observe post-write integrity and preserved counts if a separately
  authorized operation is later executed.

Private authenticated testing, credential rotation, source version
deployment, production D1 migration and Assets activation all require
other separate authorizations. This PR does not grant any of them.

Offline tests simulate the D1 API and use synthetic in-memory SQLite.
They do not prove Cloudflare transaction guarantees or an end-to-end
remote restore.
