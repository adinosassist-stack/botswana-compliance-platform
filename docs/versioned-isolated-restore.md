# Protected versioned SQL restore candidate

This implements a review candidate for the missing versioned-input transport in
issue #1950. Merging it does not run a restore, accept retention evidence, or
authorize production writes. The existing fixed-input runner remains unchanged.

## Fixed scope

The new `RESTORE_VERSIONED_CANDIDATE` mode in the existing Isolated Operations
Rehearsals workflow uses only the dedicated backup credential inside the existing
protected selected-operation step. It retains operations-rehearsal review,
main-only/exact-current-main checks, DO_NOT_RUN default, pinned actions and shared
manual-rehearsal serialization. The GitHub token has read-only issue permission
to authenticate the two approval comments, with no issue write permission.
It has no schedule, production deploy, candidate
promotion, R2 write, automatic retry, reset or cleanup of remote databases.

The transport pins account `ddd23cab31928a4bb3d4998df9b26d1d`, isolated D1
`be15acba-ba16-4704-9498-e296a164b3a2` and name
`bw-compliance-os-ops-restore-candidate-20261103`. It reads only SQL candidate
run 42828130101, attempt 1, exactly 3,393,714 bytes, SHA-256
`de8507a6d550b20993ea07d5d70bf37795cc714f0460b9af44d4b58fa53d860f`.
Its production export source commit is `092e65eaba9a1e5ac0001e2b85eaf11a9ca5f0ba`.
The private object's 3,537,011 bytes and SHA-256 were independently verified using authenticated, read-only Cloudflare R2 GET and in-tool SHA-256; the preparation run [42828130101](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/42828130101) passed protected qualification and upload. Independently comparing the original sanitized GitHub step-summary receipt remains pending; a matching hash alone is not acceptance of retention, private access, or a live restore.
The protected preparation script completed successfully and attests to private byte roundtrip. The new run's export bookmark and sanitized receipt have not yet been independently compared; do not carry over the older candidate bookmark.
This is verified receipt and object-byte evidence; no remote D1 restore, Time Travel validation,
object-level retention proof, sustained RPO, or tenant recovery has been established.
The original export bookmark/provenance remains the independently reviewed
receipt in #1950 and the immutable offline planner; importing SQL does not
create or refresh a production Time Travel bookmark.

## Separate approvals before dispatch

After independent code review and merge, identify exact current main. The owner
account `adinosassist-stack` and independent reviewer `thusico` must each post a
separate comment on issue #1950. Each must independently review candidate
provenance, actual-byte qualification, enabled retention policy and object-level
enforcement evidence, authorized retention administrators, private access paths
including historical Worker versions/account principals, credential reach, and
exclusive writers to the isolated target. Do not sign acceptance before those
checks are complete. The runner cannot itself establish those human observations.

Each approval comment must consist of this marker line followed by the JSON
object below, replacing only the SHA with the reviewed current main:

```text
THEBE_VERSIONED_RESTORE_APPROVAL
```

```json
{
  "scope": "IMPORT_VERSIONED_BACKUP_INTO_ISOLATED_D1_ONCE",
  "sourceSha": "REPLACE_WITH_REVIEWED_CURRENT_MAIN_40_CHARACTER_SHA",
  "target": "be15acba-ba16-4704-9498-e296a164b3a2",
  "candidateKey": "candidates/42828130101/1/production-d1.sql",
  "candidateSha256": "de8507a6d550b20993ea07d5d70bf37795cc714f0460b9af44d4b58fa53d860f",
  "candidateBytes": 3537011,
  "backupSourceSha": "092e65eaba9a1e5ac0001e2b85eaf11a9ca5f0ba",
  "retentionAndAccessAccepted": true
}
```

The approval contract now includes the immutable candidate key and original backup source SHA, in addition to its digest and size. **`sourceSha` is the future, independently reviewed execution `main` commit; `backupSourceSha` is the fixed original export source.** The source-sha placeholder is deliberately invalid. These instructions are not
approval records. Both records are fetched through authenticated GitHub GETs;
author, issue, exact shape and scope are checked. Missing, different, deleted or
changed approvals stop execution. Comments are re-read during both isolation
passes. Approval for an older source SHA cannot authorize the next source SHA.

Use the existing workflow on main with `mode=RESTORE_VERSIONED_CANDIDATE`,
`expected_sha` matching that reviewed current main, the two distinct numeric
comment IDs in `versioned_owner_approval_id` and `versioned_review_approval_id`,
and `confirmation=RUN_ISOLATED_REHEARSAL`. Independently approve the existing
operations-rehearsal environment. Do not broaden credentials or configure a
replacement approval environment to make a failing dispatch run.

## Execution and failure handling

The runner checks live main, target UUID/name, backup bucket domains, exact
retention rule and current account Worker D1 bindings. It queries zero application
schema objects before download and immediately before import. Metadata queries
must report zero rows written. Current Worker enumeration is not proof of every
possible access path; the independent access inspection remains mandatory.

Private SQL is streamed through the fixed authenticated Cloudflare object GET
endpoint, with redirects refused and strict byte bounds. It is stored only in a
private temporary directory and verified against the pinned SHA-256. Strict
UTF-8, existing in-memory SQLite SQL inspection, integrity/FK checks and required
tenant/user data qualification run before import. A second isolation/emptiness
pass precedes the single D1 import using lockfile-pinned Wrangler. Child-process
credentials are restricted to the dedicated Cloudflare token; the GitHub token
is not forwarded. All child output is captured, never printed into reports.

After import, the complete application-table set, each table's count and remote
foreign keys must match the qualified SQL inventory. Only aggregate counts,
hashes, identifiers and elapsed import/verification time enter the protected
summary. No SQL, row values, signed URLs or backup artifacts are published.
Temporary files are removed in finally on normal success/failure. Runner or
machine termination may require restricted operator inspection of scratch data.

Emptiness checks and import are separate operations: exclude other writers for
the entire job. Any transport uncertainty, partial import or failed acceptance
means HOLD. Inspect the target before any further action. Never reset, drop,
delete or automatically replay. A target populated by a successful prior run
will fail the next empty-target check. Reuse of the same comment IDs cannot
override that guard.

## What success establishes

Success covers only this SQL backup's isolated import, complete application-table
set, counts and foreign keys. Retention/access acceptance is explicitly recorded
as operator-and-independent attestation, not a runtime observation. No R2 sample
is restored and no object-to-database metadata consistency is claimed.

Signed-in tenant recovery, application/schema compatibility, complete access
isolation, sustained 120-minute RPO, total disaster RTO, offsite copies and
production release/POP/payment acceptance remain separate gates. Import timing
alone proves none of those. Live import has not been run by authoring this batch.

## Validation

Run the existing recovery/bootstrap/credential/dispatch suites together with
`tests/restore-versioned-candidate.test.mjs`. The focused suites use synthetic
records/bytes and actual local SQLite checks; they never contain private backup
bytes or perform remote operations. The exact pinned private backup's successful
import path requires protected live qualification after independent approvals;
local tests are not a substitute for that acceptance.

## 10 November 2026 review-only candidate update

This review PR changes only the isolated, approval-gated versioned import candidate to the fresh Release 595 backup. It **does not dispatch a restore**. It does not modify the legacy fixed-input restore mode, the protected environment, Cloudflare settings, D1, R2, credentials or production. The old historical candidate remains separately recorded in issue #1950, but is no longer this mode's import input after this PR merges.

The candidate-specific owner and independent `thusico` approval comments must be written **after** independent review of retention enforcement, administrators, access isolation and exclusive writer controls, using the then-current reviewed main SHA. Existing bare `approved` comments cannot authorize this import. If target identity/emptiness changes or any import fails, halt; never auto-reset or replay. The exact new backup-byte hash was independently calculated, but the preparation receipt is not yet separately compared; `retentionEnforced`, actual isolated restore and application tenant recovery are **not accepted** by that result. Do not activate POP, exports or General AI on this PR alone.


## 10 November 2026 new candidate safeguards

The revised pin names only `candidates/42828130101/1/production-d1.sql` (3,537,011 bytes; independent SHA-256 `de8507a6d550b20993ea07d5d70bf37795cc714f0460b9af44d4b58fa53d860f`; export source `092e65eaba9a1e5ac0001e2b85eaf11a9ca5f0ba`). The dedicated target remains `be15acba-ba16-4704-9498-e296a164b3a2`, verified empty and healthy in read-only checks on 10 November. Updating this pin and tests does not approve, dispatch or execute a restore. Old approvals cannot authorize the new key/hash and source. Both distinct signed reviews, retention and full access acceptance, exact-current-main verification, and existing `operations-rehearsal` protection remain mandatory. Do not treat a schema-integrity result as a recovered authenticated service or approval for POP production migration.
