# POP upload admission and replay candidate

Related: #1886 and #1874. This code/schema candidate does **not** authorize a
migration or upload enablement. Production and billing staging uploads stay off.
No POP, request key or upload outcome verifies bank funds or activates a plan.

The dormant HTTP route requires `Idempotency-Key`: 16–128 ASCII letters, digits,
periods, underscores, colons or hyphens. A client generates one key per intended
upload and preserves it across transport retries. It must use a new key for an
intentional replacement or new attempt after a definitive failure. This key does
not choose the document UUID or object key; those remain server-controlled.

An authenticated tenant/order-scoped reservation stores only the key hash and a
fingerprint of the actor, filename, normalized MIME type, length and content digest.
Authorization and validation are repeated before a replay lookup. A different
payload with the same scoped key returns 409. A completed replay returns the original
document ID without another R2 write; deleted metadata returns 409, missing metadata
requires reconciliation, and an in-progress/failed request cannot write again.

## Proposed conservative limits

| Admission budget | Proposed value | Counted records |
| --- | --- | --- |
| Per order | 5 attempts | All reservations, including failed/uncertain |
| Per tenant in preceding 24 hours | 20 attempts | Database timestamps, all states |
| Per tenant retained ledger | 100 attempts | All states, no automatic release |
| Per tenant byte budget | 50 MiB | Declared validated bytes, all reservations |
| Per file | Existing 3.5 MiB | Signature/MIME/filename validation unchanged |

These are fixed server-side admission limits proposed for review, not configurable
client inputs or a complete HTTP burst-rate limiter. Validation failures before a
reservation do not consume them. Capacity includes failed/deleted/uncertain attempts
conservatively; the application has no capacity-reset or ledger-delete endpoint.
A separately reviewed retention/reconciliation mechanism must qualify release of
capacity before uploads are enabled. No legal retention period is asserted here.

Counts and the insert are one SQLite statement, preventing count-then-write races.
The unique `(tenant, order, key hash)` scope prevents duplicate reservations. A
simultaneous duplicate receives 409 while its winner is unfinished; it can replay
once the winner completes. Replays at capacity still resolve the existing receipt.

## Persistence and failure behavior

The reservation precedes R2. After a conditional private-object write, pending
metadata and `stored` reservation state commit together in one D1 transaction,
with a reserved-state scope guard. If the acknowledgement is lost, authoritative
stored state recovers the same receipt. Accepted objects must never be deleted
merely because a response or acknowledgement was lost.

A confirmed metadata rollback permits cleanup of only the newly created object;
then the reservation becomes `failed` and retains budget. If database outcome or
storage cleanup is uncertain, the object/reservation remain held and the request
requires reconciliation; a retry cannot allocate more storage. Missing schema
fails closed before R2 access. No automatic stale-reservation expiry is implemented.

The reservation table is included only in the existing **design candidate SQL**.
Local SQLite and Miniflare D1/R2 tests execute it; no release migration or remote
schema change is supplied. Existing service mocks were replaced with real SQLite
storage so the transaction guard and failure behavior execute in regressions.

Remaining gates include an approved migration and linked-scope constraints,
authenticated scanner integration, malware/unavailable-scanner behavior, retrieval
and deletion qualification, operational reconciliation/capacity release, general
request throttling, privacy/retention review, UI accessibility and WhatsApp intake.
None of these is qualified by the admission limits alone. Real activation remains
separate and requires independently reconciled bank evidence.
