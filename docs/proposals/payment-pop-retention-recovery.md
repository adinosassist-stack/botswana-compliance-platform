# POP content retirement and recovery-inspection candidate

Related: #1886 and #1874. This proposal supplies disabled internal primitives and
local tests, not a retention schedule, legal retention period, migration, live
storage operation or deployed deletion endpoint. No live receipt is deleted.

## Authority and reviewed snapshot

`retireStoredPop` requires the exact staging/read-only profile, a separately enabled
`POP_RETENTION_STAGING_ENABLED` flag, trusted platform-owner user identity, audit
secret, document/tenant/order UUIDs, a reason and expected SHA-256/R2 ETag snapshot.
The caller must review that snapshot and choose the deletion basis explicitly.
A guessed duration, a customer payment reference or generic instruction to continue
is not a retention policy. Future routing must derive identity from a live owner
session and qualify authorization, confirmation/expiry and request limits.

Only an accepted receipt with a stored upload reservation is eligible. Missing,
mis-scoped or changed metadata fails closed. Orphan/in-progress uploads cannot use
this deletion primitive: an in-flight storage operation may not yet be finished.
Storage keys are derived solely from the verified UUID scope, never caller paths.

## Two audited phases

| State | Metadata | Meaning |
| --- | --- | --- |
| Active | `deleted_at` absent | Existing scan/auth conditions govern access |
| Access revoked | `deleted_at` set, `storage_deleted_at` absent | Cleanup pending/uncertain; receipt cannot be served |
| Removal recorded | Both timestamps set | Private object absence observed and completion audit committed |

The first active-record compare-and-set and sealed `POP_RETIREMENT_REQUESTED` audit
commit together. An unavailable initial audit prevents both tombstone and deletion.
The tombstone blocks downloads, scanner transitions and upload replay before R2
cleanup starts. No filename, payment status, paid period or entitlement is changed.

The private object's canonical key, ETag, length and SHA-256 must match the reviewed
record before deletion. Missing objects can proceed to confirmation; changed objects
are held for reconciliation. Storage writes are expected to remain immutable through
conditional creation and unique server document IDs. Out-of-band replacement or
restoration is not an authorized workflow. No cross-service atomic delete is claimed:
the helper checks scope/content and observes absence, and flags restored objects.

After absence is observed, `storage_deleted_at` and sealed `POP_STORAGE_REMOVED`
evidence commit together. An unavailable completion audit leaves a tombstone and
unconfirmed cleanup, never a false success. Retrying observes absence and completes
audit without deleting again. Lost storage/database acknowledgements and concurrent
requests are replay-safe. A reappearing already-retired object requires reconciliation
and is not silently deleted. Recovery success never asserts bank funds or activation.

Quota reservations, receipt metadata, filenames and audit history remain retained.
The helper removes object content and revokes access; it is **not** a complete
personal-data erasure or retention-compliance operation. No capacity is released.
Reviewed periods/bases for object, metadata, ledger and audit retention, as well as
any privileged capacity-release process, remain prerequisites for enabling uploads.

## Inspection without speculative cleanup

`inspectPopRecovery` requires its own disabled `POP_RECOVERY_STAGING_ENABLED` flag,
qualified owner, reason, scope and audit. It observes reservation/metadata and R2
HEAD state and records `POP_RECOVERY_INSPECTED`. It does not download receipt bytes,
delete objects, change receipt/reservation state or release quota. No storage key,
receipt content, public URL, scan credential or reusable capability is returned.

Reserved objects, missing metadata, failed/uncertain cleanup, scope mismatch,
unavailable storage and reappearing retired objects are explicit reconciliation
cases. Unknown storage is reported as unknown, not absent. An active metadata-match
observation compares HEAD metadata only; it is not a malware verdict or full content
integrity proof. Failed requests with absent objects may be observed consistently,
but their reservation remains charged. In-flight/orphan cleanup and capacity release
require a separately qualified fencing/drain/reconciliation procedure; no age-based
automatic deletion is implemented.

## Qualification evidence and remaining gates

Native SQLite/local R2 tests exercise both phases, deletion failures, lost
acknowledgements, retries, conflicting scope/content, default-off and production
rejection, concurrent calls, orphan observation and inspection audit failure. Local
D1 verifies rollback of each audit phase and exactly one completion after recovery.
The extra timestamp remains in design candidate SQL only. Runtime staging strips
the proposed operation flags; no route or schedule invokes these helpers.

Actual schema integration, scanner/provider qualification, retention/privacy policy,
operator UI/session authorization, object immutability guarantees, recovery fencing,
quota release and authenticated live evidence remain outstanding. Independent review
of this code is not permission to delete data, migrate or enable uploads. Payment
approval and regulatory controls remain unchanged.
