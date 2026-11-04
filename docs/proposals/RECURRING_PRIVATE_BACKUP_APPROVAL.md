# Proposal — default-off hourly production D1 candidate exports

**Status: REVIEW ONLY.** This change does not authorize a production export, prove
the 120-minute RPO, satisfy recovery acceptance, approve a database restore, or
change a live credential. The existing manual `operations-rehearsal` workflow
remains independently protected. The scheduled export job is **off by default**.

## Why this exists

The approved manual private backup candidate workflow can produce correctly scoped
SQL candidate receipts, but it is not scheduled. The separately merged
`backup-cadence-observer.yml` is GET-only; it can diagnose >120-minute gaps
but cannot create recovery points. An hourly scheduled job *may* reduce gaps,
but GitHub cron is best-effort, export/roundtrip can fail, and retention and
restorability require evidence beyond object metadata.

The opt-in schedule runs at minute 17 UTC each hour. It is controlled by a
repository variable that must be exactly `true` and by a separate GitHub
environment, short-lived authenticated issue approvals, and a dedicated
credential. **Do not enable it merely because this PR or offline CI passes.**

## Mandatory independent standing-authorization setup — NOT performed

1. Security/operations and the owner independently review the current exact
   `main` source SHA, backup exporter, R2 object lock and prior lock mutations,
   token privileges, retention enforcement evidence, monitoring response and
   breach response; decide whether an unattended export can be authorized.
   Restrict and rotate the existing broad production deploy token separately.
2. An authorized repository administrator configures the exact
   `operations-recurring-backup` environment with the team's documented
   authorization and access controls. This must be reviewed *before* adding
   credentials or enabling the job. Do not assume an auto-created environment
   includes protection; dedicated environment credentials must never be copied
   from the broad production deploy token.
3. Provision a **distinct** `PRIVATE_BACKUP_SCHEDULE_CLOUDFLARE_TOKEN` secret
   in that environment. Grant only provider-supported permissions needed for
   production D1 export and private R2 candidate object creation/readback,
   with explicit Cloudflare account scope and any tighter database/bucket scopes
   the provider supports. Verify GET/POST/PUT routes under this dedicated
   identity before approving recurring execution; avoid the S3-only object-read
   token on Cloudflare REST endpoints. Document expiry, owner, revocation and
   rotation steps. No token values belong in comments, logs or PRs.
4. Following **actual** retention/access acceptance, the authenticated GitHub
   issue #1950 owner `adinosassist-stack` and independent reviewer `thusico`
   each submit *their own* comment with the exact marker and JSON contract
   below. No assistant, CI job or caller-supplied text may impersonate them.
   Both records must carry the **same** expiry; the last approval must still
   be unexpired and each record must be at most seven days old.
5. Set repository variable `PRIVATE_BACKUP_SCHEDULE_ENABLED=true`, and
   environment/repository variables
   `PRIVATE_BACKUP_SCHEDULE_OWNER_APPROVAL_ID` and
   `PRIVATE_BACKUP_SCHEDULE_REVIEW_APPROVAL_ID` to the independently
   submitted **distinct** GitHub comment IDs. These values are verified
   against GitHub's live authenticated API *each run and again before the R2
   write*. The current approved SHA must remain `main`; any new merge,
   expiry, revocation, failed provider check or missing secret automatically
   blocks subsequent exports. Do not authorize a new SHA without a fresh
   security review.
6. Validate dedicated secret access, earliest and latest export bookmarks,
   immutable/private candidate receipts and byte roundtrips, 30-day retention
   rule and actual enforcement as independently accepted. Establish an
   alert destination and human response for failed cron, export, checksum,
   R2 write, missing receipts, stale monitor, and missed 120-minute targets.
   Only after sustained compliant receipts and separately approved isolated
   restore/tenant tests may operations accept the real RPO.

Both approval records must start with the exact line
`THEBE_RECURRING_BACKUP_APPROVAL`, then one newline, then a JSON object with
exactly these keys and literal types (sourceSHA and expiry are illustrative):

```text
THEBE_RECURRING_BACKUP_APPROVAL
{
  "scope": "HOURLY_PRIVATE_D1_CANDIDATE_EXPORT_ONLY",
  "sourceSha": "<exact reviewed 40-character current main commit>",
  "accountId": "ddd23cab31928a4bb3d4998df9b26d1d",
  "databaseId": "8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce",
  "bucket": "bw-compliance-ops-backups",
  "prefix": "candidates/",
  "maxIntervalMinutes": 120,
  "retentionDays": 30,
  "retentionAndAccessAccepted": true,
  "dedicatedCredentialScopeAccepted": true,
  "expiresAt": "2026-11-06T20:00:00Z"
}
```

Do **not** copy the sample expiry or claim acceptance without reviewing the
actual conditions. The expiry must be later than the time of execution and no
more than seven days after the original owner's/reviewer's respective comment
creation. The live source SHA and all fields must match both records.

## Implemented fail-closed boundaries

- Scheduled workflow only (never branch, PR, fork or user-dispatched export);
  one-hour UTC cron, job disabled by default; `operations-recurring-backup`
  environment; dedicated GitHub token and dedicated Cloudflare secret.
- Both independent approvals verified as GitHub issue #1950 records authored
  by the exact account identities; each approval is explicit, narrowly scoped,
  expiring, source-pinned and non-transferable to restore, deploy or payments.
- Exact current `main` checked before exporting and again before uploading.
  Untrusted errors cannot output SQL bytes, signed URLs or token bodies.
- Same concurrency group as manual backup and isolated restore prevents
  simultaneous protected writers; no cancel-in-progress or silent retry.
- Both current private R2 domain state and the exact 30-day retention policy
  are verified, with a second policy readback immediately before candidate PUT.
  An existing or unverifiable destination is rejected rather than overwritten.
- Candidate SQL is size-limited, SHA-256 checked on private roundtrip, and
  carries the already-reviewed export bookmark and source metadata in a receipt.
- The scheduling authorization does **not** grant an isolated import or
  release right, and does not allow POP ingestion, advanced exports, bank
  reference-only subscription activation or production configuration changes.

## Remaining blockers

This PR alone **does not create** the environment, credential, two approvals,
operations rotation plan, alerting recipient, actual recurring exports or
completed recoverability acceptance. GitHub Actions scheduling can be delayed,
so a one-hour cron **does not guarantee** a two-hour RPO. The read-only
cadence observer must continue checking real candidate gaps; independent
restore testing with user/tenant isolation is still required. Production launch,
Release 590 and restore versioned candidate remain on HOLD until their
**separate existing** independent approvals and protected gates are satisfied.
