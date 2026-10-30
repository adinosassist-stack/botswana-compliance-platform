# Thebe Desk — Authenticated voice and text conversation persistence (design contract)

Status: design only. No production migration, API route, customer data capture, or retention policy activation.

## Purpose
Unify typed chat, completed speech transcripts, assistant responses and governed action summaries into one workspace conversation timeline. The existing voice overlay and 20-turn client-memory change remain independently reviewed.

## Boundaries
- Require authenticated session, active workspace membership, and an explicit permission to read/write each conversation. Resolve tenant and actor from the trusted server session; never accept client-supplied tenant IDs as authority.
- Cross-tenant reads and writes must fail closed. Each query, update and delete filters by tenant_id AND conversation_id, and verifies actor's workspace membership.
- Do not persist raw microphone audio, provider session tokens, tool secrets, raw model function arguments, submitted payment proofs, or unredacted credentials.
- Only finalized voice transcription turns are eligible for persistence. Partial deltas stay ephemeral; do not infer final transcript from a timeout. Honor recording/transcription consent requirements and provide a visible disclosure.
- Persist finalized assistant text only after appropriate privacy filtering. Tool execution requires existing separate governed approval; conversation text cannot authorize a financial, regulatory or subscription state change.
- Use server-assigned IDs and timestamps, idempotency keys per completed turn, bounded message sizes, input validation, throttling and pagination.
- Fail closed when migrations/schema are missing. API failure must not overwrite the unsent draft or disrupt the live voice session.
- Explicitly define retention and deletion policy with product/legal review *before* any rollout; avoid selecting an arbitrary retention duration.
- In production, migration, access policies, audit records, privacy notices and restoration/rollback procedures must be approved separately.

## Proposed schema (future migration, not executable in this PR)
- conversations: id, tenant_id, owner_user_id, title, status, created_at, updated_at, deleted_at
- conversation_memberships: tenant_id, conversation_id, user_id, access_role
- conversation_messages: id, tenant_id, conversation_id, author_user_id, role, source_kind (typed|voice_final|assistant|governed_result), content_redacted, idempotency_key, created_at, deleted_at
- Store minimal metadata and *avoid storing raw audio*; maintain separate bounded audit metadata for security-relevant operations.
- Unique index on (tenant_id, conversation_id, idempotency_key), plus tenant-scoped list indexes; all authorization occurs at API boundary and is repeated for every write/read.

## Proposed API (future)
- POST /api/conversations: create scoped thread
- GET /api/conversations?cursor=&limit=: list authenticated permitted threads
- GET /api/conversations/:id/messages?cursor=&limit=: keyset paginate, scope by tenant and membership
- POST /api/conversations/:id/messages: idempotent append of finalized permitted message
- DELETE /api/conversations/:id: authorized soft-delete with established retention/purge policy
- Never authorize access from client-provided role, owner ID or workspace ID. No global unscoped search endpoint.

## Client behavior
1. Start or select an authorized conversation; maintain same thread for typing and voice.
2. Show low-latency partial speech only in the in-memory activity panel; commit only a confirmed completed transcription event.
3. Commit finalized assistant response separately, preserving chronological order via server timestamps and stable IDs.
4. Reconcile optimistic rows by idempotency key; never duplicate messages on reconnect/retry.
5. Keep unsent text intact when voice events arrive. Never let voice session navigation hijack the composer.
6. Show sync failure discreetly and offer retry; never show success until server confirms save.
7. Clear private transcript state on logout, workspace switch, authorization change and account removal.

## Required adversarial acceptance tests before implementation or deployment
- Tenant A session cannot list, read, append or delete Tenant B conversations even with guessed IDs.
- Read-only member cannot write; revoked member loses access immediately.
- Missing CSRF/authentication fails for writes, stale session fails closed.
- Duplicate and out-of-order final voice events yield one stored message; partial deltas are never stored.
- Large, malicious, secret-bearing and HTML payloads are rejected or safely redacted/escaped.
- Failed persistence does not block voice transport or damage a typed draft; no false saved state.
- Logout and workspace switch isolate old message buffers; client never renders stale private data publicly.
- Provider disconnect and retry obey idempotency and bounded backoff; data deletion follows reviewed policy.
- Financial commands still require independent authority and bank receipt verification.

## Release plan
Implement in separate scoped PRs: database + migration qualification; authenticated API + adversarial tenant tests; opt-in client sync; staged end-to-end tests; explicit privacy/legal review; BF-07 sealed production release. No bypass of main governance or regulated activation gates.
