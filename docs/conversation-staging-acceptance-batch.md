# Conversation history: single staging acceptance batch

Do not activate these endpoints for customers until privacy/retention review is approved and a real staging D1 database is independently qualified.

## Gate 1 — Trusted runtime boundary
Use only an authenticated, server-resolved current session and tenant membership, never a request-supplied tenant, role or deployment flag. Wire the handler ONLY in a separate staging Worker deployment with a restricted route, and verify no production route references it. Reject unauthenticated, revoked, cross-tenant, cross-thread and CSRF-invalid requests.

## Gate 2 — Storage
Apply the reviewed rehearsal schema on a dedicated staging D1 database, after capturing a rollback/export and verifying foreign keys and indexed table structure. Query sqlite_master and PRAGMA table_info/index_list on staging; do not treat a table-name-only probe as full qualification. Use synthetic accounts and synthetic messages only. Confirm atomic idempotency across concurrent writes, no raw audio storage and no partial speech storage.

## Gate 3 — Privacy
Obtain approved transcript consent, retention and deletion policy prior to enabling any data capture. The feature gate remains false while approval is absent. Do not infer approvals from a successful CI result.

## Gate 4 — End-to-end
Using synthetic identities, test a typed question and finalized voice input in one thread, server response preservation, reload/pagination, cross-account isolation, revoked access, network recovery, conflicting idempotency keys, duplicate events and complete logout cleanup. Test mobile keyboard/voice coexistence. Verify no client draft overwritten and no state-changing financial workflow triggered.

## Gate 5 — Rollout
Obtain independent security approval and normal protected checks. Activate staging via explicit configuration only; report actual deployment ID, database ID, test evidence and rollback readiness. Production migration is a separate approval and release.

## Current reality
Code is present for isolated authorization, rehearsal D1 adapter, signed cursors, staging HTTP-shaped handler and fail-closed feature gate. The production Worker route is not wired. This file is an actionable consolidated acceptance gate, not evidence of staged deployment.
