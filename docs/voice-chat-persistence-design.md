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


## Integration dependency order (2026-10-30 verified)
No step below authorizes merging without a current independent approval and required CI at the exact head SHA.

1. Independent main-target baseline PRs: #1973 (this design), #1974 (authorization policy), #1975 (isolated schema rehearsal), #1976 (API acceptance contract). They can be reviewed independently; #1974 and #1975 are code/test prerequisites for later staging work.
2. Schema branch: #1977 contains actual SQLite behavioral tests stacked on #1975. Its branch already absorbed #1980's concurrent-write test. Once #1975 is approved and merged, rebase or retarget #1977 with exact-head and test verification.
3. Storage adapter branch: #1978 stacks on #1974; #1979 stacks on #1978 with atomic idempotency; #1984 stacks on #1979 with failure-isolation tests. #1984's development branch has absorbed #1985, #1986, #1987, #1989, and #1991. These development-branch merges are NOT merges into main.
4. Independent client changes: #1970 (mobile composer focus), #1971 (concurrent voice/text regression), #1972 (in-session voice turns). Keep their existing independent review requirements; avoid blindly reconciling overlapping dock changes.
5. After prerequisites are on main through protected PRs, make a new staging-only integration PR for server-resolved actor/membership, authenticated CSRF-protected routes, a real D1 rehearsal migration with rollback, and browser tests. All storage and authorization must fail closed.
6. Before customer rollout: approve privacy disclosure, transcript consent, retention/deletion policy, staged tenant-isolation tests, audit logging and idempotent concurrent-write validation. No production schema change or live transcription storage by any current PR.

### Current release decision
Blocked pending required independent reviews on foundational PRs. Do not bypass governance, and do not treat successful CI or development-branch merges as permission to deploy.
