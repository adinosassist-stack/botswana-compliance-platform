# Protected versioned SQL restore candidate

This implements a review candidate for the missing versioned-input transport in
issue #1950. Merging it does not run a restore, accept retention evidence, or
authorize production writes. The existing fixed-input runner remains unchanged.

## Fixed scope

The new `RESTORE_VERSIONED_CANDIDATE` mode in the existing Isolated Operations
Rehearsals workflow uses only the dedicated backup credential inside the existing
protected selected-operation step. It retains operations-rehearsal review,
main-only/exact-current-main checks, DO_NOT_RUN default, pinned actions and shared
manual-rehearsal serialization. It has no schedule, production deploy, candidate
promotion, R2 write, automatic retry, reset or cleanup of remote databases.

The transport pins account `ddd23cab31928a4bb3d4998df9b26d1d`, isolated D1
`be15acba-ba16-4704-9498-e296a164b3a2` and name
`bw-compliance-os-ops-restore-candidate-20261103`. It reads only SQL candidate
run 41709222476, attempt 1, exactly 3,224,706 bytes, SHA-256
`2363d0cfc85a76e3cfef7c33a9f2f70a38899174042e23683aa663dfcbaf3f33`.
The historical export bookmark/provenance remains the independently reviewed
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
  "candidateSha256": "2363d0cfc85a76e3cfef7c33a9f2f70a38899174042e23683aa663dfcbaf3f33",
  "candidateBytes": 3224706,
  "retentionAndAccessAccepted": true
}
```

The source-sha placeholder is deliberately invalid. These instructions are not
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
