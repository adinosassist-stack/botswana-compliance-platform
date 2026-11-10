# Guest House booking — isolated D1 qualification and release boundary

Status: **code-only draft / NO staging or production activation**. This file records
what the offline tests establish, not authorization to deploy the booking system.

## Scope tested

The PR's targeted workflow `.github/workflows/guest-house-isolated-d1-qualification.yml`
installs pinned dependencies and runs `node --test tests/guest-house-*.test.mjs`.
The new `guest-house-reservation-d1.test.mjs` uses **actual Miniflare local D1
bindings**, creates only a disposable in-memory/local test database and loads
`cloudflare/schema/guest-house-management-proposal.sql` as a proposal.
No customer database, tokens, public routes, paid services or Worker activation.

Tests exercise:
- Two concurrent overlapping requests on one isolated primary writer: exactly
  one persisted reservation, with price taken from the database.
- Identical server-issued reservation ID replay: one booking row, same active
  date/status/property/room, `replayed:true`.
- Changed date, cancelled reservation and cross-tenant ID replay fail closed.
- Database triggers reject bypass writes and attempted status transitions that
  would overlap an existing active reservation.
- Checkout-exclusive intervals permit back-to-back stays; inactive rooms deny
  bookings; customer-supplied prices and unauthorized scopes are rejected.
- Existing preview/unit/schema validation remains in the same test command.

## Retry safety contract and limitations

This is **same-ID / same-state replay recognition**, NOT a complete durable
idempotency protocol. Only trusted server code may issue and retain stable
reservation IDs and may retry them after ambiguous network failures. An
independent retry with a *new* ID is a new attempt and must not be represented
as a replay. Requests with changed fields, changed reservation status, or
foreign property/tenant do not produce a successful replay. The response
must not imply payment success, confirmed external channel delivery or
a committed durable audit entry.

## Proposed atomic audit extension (code-only)

The inert schema proposal now adds `guest_house_reservation_events`, an
append-only tenant/property-scoped event table. SQLite INSERT and UPDATE
triggers record creation, reservation amendment and cancellation in the
**same statement transaction** as the booking change. If the audit event
cannot be recorded, SQLite rolls back the booking write. Separate triggers
reject editing/deleting audit events, changing tenant/property or the saved
nightly-rate snapshot, and deleting reservations without a retention review.

These audit events intentionally omit guest personal information. They are
**not cryptographically sealed**, and privileged database administrators
could still change the database schema. The design is an independently
reviewed **proposal only** and does not activate any runtime endpoint,
remote D1 migration or customer booking.

The local D1 suite verifies event count on replay, cancellation and rate
changes, atomic rollback on simulated audit failures, append-only controls
and tenant isolation. It does not establish external payment settlement,
remote D1 behavior, a server-to-database cryptographic audit chain or
durable idempotency across newly minted reservation IDs.

The primary writer and single-statement conditional INSERT are required.
Local concurrent tests do **not** prove every distributed production concurrency
case, credential freshness or remote D1 consistency.

## Optional durable retry-key candidate (inert)

`cloudflare/src/guest-house-reservation-idempotent-proposal.js` is a **new,
unwired candidate command**; the existing runtime helper remains unchanged.
The proposed reservation table has a nullable `idempotency_key` and a
tenant/property-scoped partial unique index. A trusted server must generate
or validate a high-entropy request key and bind it to the authenticated
caller. The booking JSON cannot set, override or reveal the key.

A conditional primary-writer insert atomically captures that key alongside
the reservation and the existing local audit trigger. An identical retry
that uses a **new server reservation ID** but the same key and booking fields
returns the original reservation without adding another booking or event.
A changed booking, cancelled reservation or changed status fails closed.
A new key is an independent booking attempt, subject to normal availability.

The key is immutable after reservation creation; a rollback caused by audit
failure also rolls back the key claim. The tests exercise concurrent same-key
attempts, different tenants, changed fields, cancellations, immutable keys
and rejection before SQL for invalid or caller-controlled fields.

**Limitations:** This does not authenticate HTTP requests, generate secure
idempotency keys, prove owner membership from a live session, implement
key expiry/retention or a distributed cross-service replay protocol.
It is only locally qualified against a disposable D1 instance and must
not be deployed without retention/legal review, remote isolated D1 rehearsal
and independent approval. No guest personal identifiers are stored as keys.

## Outstanding mandatory acceptance before writes

1. Resolve or explicitly retire older overlapping PRs and requalify this PR
   against the then-current `main` SHA.
2. Record exact CI URLs, head SHA and outcomes; keep any failed check blocking.
3. Stage the schema **only** on a separate authorized isolated D1, never as an
   implicit automatic production migration. Rehearse rollback and recovery.
4. Prove write-time authenticated property membership, server-issued stable IDs,
   tenant ownership and role checks at the eventual HTTP boundary.
5. Independently review the proposed append-only database audit and add a
   durable, cryptographically verifiable audit and idempotency protocol for
   retries beyond the same-state same-ID case; verify audit failure recovery.
6. Exercise real isolated D1 concurrent requests, booking amendments, cancellations,
   out-of-service transitions, and financial reconciliation safely.
7. Obtain separate owner release authorization and independent `thusico`
   approval for each protected deployment. No self-review or traffic shift.

**No database migration, Worker deployment, routes, payment enablement, or
customer-facing reservation writes are authorized by this document or PR.**
