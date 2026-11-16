# Corporate Assets — canonical session and audit key-rotation risk

**Status: synthetic offline tests only. No staging Worker deployment.**

The canonical Cloudflare runtime `cloudflare/src/worker.js` derives stored
session `token_hash` with HMAC-SHA256 using `env.SESSION_SECRET`. When
authentication reads an existing session cookie, it recomputes the hash with
**the current key** and queries the session table for that exact hash.
The same runtime uses `env.AUDIT_INTEGRITY_SECRET` to HMAC-chain audit
events and to recompute their signatures in `verifyAuditChain`. There
is no proof from `secret_text` binding types that existing records remain
verifiable under different bytes.

## New focused tests

`tests/corporate-assets-credential-rotation-hazards.test.mjs`:

- Calls the **actual exported** `authenticateWorkspaceSession` function
  with a synthetic cookie, two synthetic keys and a fake read-only session
  database. An old-session record authenticates under its original key
  but is rejected when the key is replaced; a new-key record reverses
  that result.
- Demonstrates the same behavior for `__Host-bw_session` and the
  legacy `bw_session` cookie.
- Uses a synthetic canonicalized audit event and HMAC-SHA256 to show
  that an event signed under one key fails signature comparison under
  a different key. This portion is an **algorithm model**, not a
  direct execution of the live audit verification function.
- Pins the actual source-level HMAC and verifier patterns so the model
  must be re-reviewed if the canonical implementation changes.
- Never accesses real D1, customer data, staging Workers or actual
  secret values; no sensitive values are included in receipts.

## Operational consequence

A direct `SESSION_SECRET` replacement causes users with sessions keyed
to the old secret to reauthenticate. Do not assume existing cookies
will continue to work or promise seamless login.

If historical audit events exist in the isolated staging DB, simply
replacing `AUDIT_INTEGRITY_SECRET` can cause their verification to fail.
The correct treatment requires **independent inventory of any sealed
audit history**, a reviewed per-key-version verification strategy or
an approved empty/synthetic-only staging reset, and rollback testing.
Never silently overwrite audit hashes, discard evidence or reuse the
old plaintext key simply to make the check pass. There may be further
key-dependent functions (e.g. lineage and receipts) beyond these tests.

## Decision gates (all remain unfulfilled)

1. Independently prove the exact compiled source bytes represented by
   the proposed Worker version, not merely matching ETags or SHA markers.
2. Prove any existing staging sessions and audit records are covered
   by a reviewed rotation/migration/expiration plan, using **isolated**
   test data and no exposure of secret values.
3. Rehearse rollback and adverse session/audit failure paths privately.
4. Obtain separate explicit owner authorization and fresh independent
   `thusico` approval for any staging deployment or write-enabled
   acceptance. The existing protected active-v2 credential safety
   release blocker must not be bypassed.
5. Keep isolated D1, feature/writes flags OFF, public routes, preview
   URLs, and production unchanged.

**NO GO** for a v4 deployment solely because the candidate uses
`secret_text`: the key bytes and operational continuity are unverified.
The old protected source-upload
[run #42719464957](https://github.com/adinosassist-stack/botswana-compliance-platform/actions/runs/42719464957)
is on stale source and should not be approved as a current-main operation.

This is a code-only PR with no Cloudflare write, Worker version creation,
secret rotation, D1 read/write, traffic shift or production change.
