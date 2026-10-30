# Thebe conversation API — security acceptance contract (not activated)

This is an implementation checklist. The endpoints listed below are **not currently implemented**.

## Request and response boundaries
- `POST /api/conversations`: authenticated workspace membership required. Server derives tenant and actor from session; request may contain optional sanitized title, never authoritative tenant/owner IDs.
- `GET /api/conversations?cursor=&limit=`: tenant-scoped list, membership filtered, bounded keyset pagination; never offset-scan across tenants.
- `GET /api/conversations/:id/messages?cursor=&limit=`: verify active membership against trusted session for every request, even after a cursor has been issued.
- `POST /api/conversations/:id/messages`: CSRF and authenticated session; membership read/write check; server-assigned message IDs; idempotency key scoped to tenant+thread; only finalized voice transcript or typed/assistant text; content cap; redaction before persistence.
- `DELETE /api/conversations/:id`: separately authorized owner/admin deletion, auditable and consistent with a privacy-approved retention policy; not enabled until policy approval.
- All failures use generic client-safe error codes and avoid disclosing whether a foreign conversation ID exists.
- No raw audio, secrets, credentials, payment proofs, or transient voice deltas stored.
- Financial actions remain on established separately authorized flows; text messages never confer execution approval.

## Acceptance gates
1. Logged-out / revoked users cannot list, read, append or delete; no cached private messages on logout.
2. Tenant A cannot access Tenant B by guessing conversation IDs or replaying cursors.
3. Viewer cannot append or delete; member cannot delete; owner/admin must be currently authorized.
4. Duplicate idempotency keys result in one stored turn, even under simultaneous retries.
5. Reject partial voice events and mismatched assistant/source kinds.
6. Malformed, too-long, HTML/script, control-character and secret-bearing content is safely rejected, escaped or redacted.
7. Pagination remains bounded and deterministic when new messages arrive.
8. DB errors and missing migrations fail closed without erasing unsent drafts; no client-side false success.
9. Voice interruptions do not generate duplicate finalized messages; only provider-confirmed completed events are eligible.
10. Browser, Android, desktop and weak-network tests prove voice and typing can coexist.
11. Retention, export and deletion behavior must be defined and approved before data collection.
12. No production route, migrations or R2/D1 writes until independently reviewed with regulatory gates and a reversible rollout plan.

## Work split
- PR #1974: pure authorization kernel
- PR #1975: isolated rehearsal schema
- This PR: independently reviewable endpoint contract and acceptance checklist
- Subsequent PR: integrated server-side handlers and actual SQLite behavior tests after security review
