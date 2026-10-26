# Isolated operations rehearsal workflow

Prepared operations tooling, not evidence that a live alert, rollback or recovery
has occurred. The production acceptance checklist remains
`LAUNCH_MONITORING_ROLLBACK_RECOVERY_ACCEPTANCE.md`.

## Prerequisites before a live run

Create/protect the GitHub environment **operations-rehearsal** with an independent
reviewer and main-only deployment restriction. Do not copy production credentials
into it. Set dedicated secrets `OPERATIONS_REHEARSAL_ACCOUNT_ID` and
`OPERATIONS_REHEARSAL_CLOUDFLARE_TOKEN`. Scope the token to the rehearsal resources
where supported; do not assume account-wide D1 permission is database-specific.
The code pins resource names and rejects both production and regulatory-staging
D1 UUIDs regardless of token reach. Missing credentials/approval stop before
provider requests. This change does not create an environment, resource or token.

Provision and independently inspect these dedicated resources:

| Resource | Required identity/use |
| --- | --- |
| D1 restore target | `bw-compliance-os-ops-restore`; empty before restore; **never bound to any deployed Worker or publicly reachable application** |
| D1 rehearsal app database | `bw-compliance-os-ops-rehearsal`; separate from restore target; only approved synthetic/scrubbed app fixtures |
| Private backup bucket | `bw-compliance-ops-backups`; holds approved `approved-d1-backup.sql` and `approved-r2-sample.bin` |
| Private restore bucket | `bw-compliance-ops-restore`; restored samples use fresh random keys; never exposed through Workers or public domains |
| Private rehearsal app bucket | `bw-compliance-ops-evidence`; separate from real restored objects |
| Worker | `bw-compliance-os-ops-rehearsal`; no cron schedules, no production resource/service bindings, dedicated rehearsal secrets, `APP_ENV=rehearsal` |

Set `OPS_RESTORE_D1_ID`, `OPS_WORKER_D1_ID`, and
`REHEARSAL_BASE_URL=https://bw-compliance-os-ops-rehearsal.<account-subdomain>.workers.dev/`.
An owner must independently inspect **all** Worker bindings and access paths,
including Workers other than the named rehearsal service. Only after confirming
these resources contain no production write paths and expose no restored data,
set `REHEARSAL_ISOLATION_APPROVAL=ISOLATED_REHEARSAL_ONLY`.
The runtime checks the named service, identities and bucket public domains; it
cannot independently prove the absence of every other account access path.

Use the exact reviewed current main SHA and `RUN_ISOLATED_REHEARSAL` for every
manual dispatch. There are no push/scheduled operations. Pull requests run only
credential-free tests. Existing environment protections remain in force.

## Modes and evidence

### PREFLIGHT_ONLY

Reads the restore D1 identity, private bucket/domain settings, the named Worker's
bindings and cron settings. Refuses a restore target bound to the rehearsal
Worker. No live writes. This is the default operation, but confirmation still
defaults to `DO_NOT_RUN`.

### PREFLIGHT_WORKER

Checks the rehearsal app database/bindings and reads its schema definitions to
produce a deterministic `schemaSha256`. Store this hash with a review of the
candidate artifact's schema compatibility; the hash alone does not prove that
older application code can correctly use that schema.

### RESTORE_APPROVED_BACKUP

An authorized operator must first place a privately obtained, independently
approved backup and representative object into the private backup bucket. This
workflow does not export production or download directly from production.
Set `REHEARSAL_BACKUP_SHA256`, `REHEARSAL_OBJECT_SHA256`, and a traceable review
reference in `REHEARSAL_BACKUP_APPROVAL`. Do not put customer data, object keys,
raw SQL or provider errors in repository files, chat, logs or Actions artifacts.

The runner checks the restore target is empty, downloads the two fixed inputs,
checks independent SHA-256 values, validates SQL in an isolated in-memory SQLite
database with extensions disabled, and requires actual tenant/user rows. SQL
that can attach/write filesystem databases is refused. It rechecks emptiness,
imports into the isolated D1 target, compares every application-table row count,
checks remote foreign keys, writes the sample under a fresh random key in the
private restore bucket, and downloads it again to compare bytes by checksum.

SQL inputs are capped at 25 MiB and objects at 10 MiB after download; larger
datasets require a separately reviewed transport. Runner temporary files use a
private directory and restrictive permissions and are removed on success/failure.
Nothing uploads backup bytes as an Actions artifact. Rehearsal D1/R2 data remains
private for operator inspection and separately authorized retention/cleanup.

The empty check and import are separate provider operations. Keep other writers
out of the restore target for the entire run; workflow concurrency only excludes
other runs of this workflow. On failure, inspect the target before retrying.
No drop, reset, deletion or automatic replay over a partial import is implemented.

Passing establishes this approved backup's row counts/foreign keys and one
object's byte roundtrip. Provenance remains operator-attested. It does not prove
tenant authorization, object metadata consistency, RPO/RTO, full application
recovery, or a complete production disaster recovery decision.

### ROLLBACK_REHEARSAL_WORKER

An operator must deploy two reviewed compatible application versions to the
dedicated rehearsal service first. Set `REHEARSAL_CURRENT_VERSION_ID`,
`REHEARSAL_ROLLBACK_VERSION_ID`, the approved `REHEARSAL_SCHEMA_SHA256`, and
`REHEARSAL_COMPATIBILITY_APPROVAL`. Record the sealed source/artifact identity,
schema review and rollback owner with that review reference. Do not pass a
production Worker version as an instruction to act on the production service.

The runner verifies the selected prior version belongs to the rehearsal service's
deployment history, validates its bindings, checks the exact currently active
version and approved schema hash, then deploys that prior version at 100% **only
on the rehearsal service**. It re-reads active deployment metadata, confirms the
schema stayed unchanged, and checks readiness 200 plus anonymous diagnostics 401
on the pinned rehearsal hostname. A failure requires inspection; it does not
trigger another automatic rollback or change any production resource.

This covers provider rollback and limited anonymous smoke checks. Signed-in
synthetic-owner navigation, tenant isolation, relevant application reads and
operator acceptance remain required before accepting application rollback.

### ALERT_PROBE

An operator must configure a rehearsal-only alert policy and a specific approved
destination/recipient before this mode is authorized. Store that policy/destination
review reference in `REHEARSAL_ALERT_APPROVAL`; the runner never chooses a recipient
or provisions notification access. A reviewed deliberately failing rehearsal
version must be active so `/api/ready` returns 503 without disrupting customers.

The runner enables invocation logging **only on the named rehearsal Worker**,
re-reads settings to confirm logging, then sends one GET to rehearsal readiness
with a synthetic correlation ID. It requires the expected 503 and reports the
probe ID/status. It never claims delivery: the approved recipient must confirm
the matching alert, delivery time and routing/escalation evidence independently.
Do not change production logging or manufacture a customer-visible outage for
this test. Logging remains enabled on the rehearsal Worker after the probe.

## Final acceptance

Retain the exact SHA, workflow run, independent approvals, timestamps, sanitized
reports, real alert receipt, signed-in application checks, recovery timing and
owner-approved RPO/RTO. None of these modes activates regulatory rules, employee
autonomy or production release authority.

References: [Worker rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/),
[Worker deployment API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/create/),
[D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/),
[R2 commands](https://developers.cloudflare.com/r2/reference/wrangler-commands/),
[R2 private/public domain settings](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/domains/).
