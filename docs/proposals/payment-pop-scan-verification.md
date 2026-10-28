# POP scan attestation and private retrieval candidate

Related: #1886 and #1874. This is code/protocol qualification, not a configured
malware scanner, a migration, a retrieval endpoint or an upload enablement approval.
No scanner provider is selected or contacted. Local tests sign synthetic verdicts;
they do not demonstrate malware detection or the suitability of a real receipt.

## Explicitly isolated configuration

Internal qualification functions require `APP_ENV=staging`, the exact
`billing-staging-readonly` profile, `POP_SCAN_STAGING_ENABLED=true`, an independently
provisioned POP-only secret with a trimmed length of at least 32 characters, and a configured
scanner identifier. Reusing a supplied audit/evidence-scanner secret is rejected.
Private retrieval additionally requires
`POP_OWNER_RETRIEVAL_STAGING_ENABLED=true` and a trusted platform-owner user identity.
The renderer and runtime boundary do not expose/forward these flags or scanner
credentials. No caller body or Boolean is treated as scanner authentication.
Production context is rejected even if flags are supplied. Default behavior is off.

## Candidate scanner contract

`preparePopScanRequest` reads only an accepted, pending, undeleted POP whose upload
reservation is stored. It verifies the exact private object key, ETag, length,
SHA-256 and existing file validation. It allocates one five-minute scan request,
persisting its UUID/issued time/deadline with a conditional pending-state update.
Only an expired request can be superseded; an older request cannot complete the
new challenge. Preparing a request performs no network call or scheduled work.

The returned request consists of exact UTF-8 `metadata`, receipt `bytes`, and the
lowercase HMAC-SHA256 signature of `pop-scan-request:v1:` plus that metadata. The
metadata contains version 1, document/tenant/order UUIDs, request UUID, content digest,
R2 ETag, byte length, MIME type, issued time and expiry. A future qualified adapter
must authenticate the scanner transport and require the provider to verify the
request and scan the matching bytes. Receipt bytes must not be sent to an arbitrary
URL or an unqualified provider; consent/data-handling notice remains a release gate.

The response is exact UTF-8 JSON plus lowercase HMAC-SHA256 of
`pop-scan-response:v1:` plus the JSON. Its only fields are `version`, `documentId`,
`tenantId`, `orderId`, `requestId`, `sha256`, `etag`, `bytes`, `contentType`, `verdict`,
`provider`, `scannedAt`. Verdict is clean/blocked/failed; provider must match configured
identity. Server state binds every scope/content field and deadline. `scannedAt` is
integer epoch milliseconds, with 30 seconds of clock tolerance around receipt time.
The response body is capped at 16,384 characters and signature verification precedes
use of its scope. Request and response signatures have distinct domain prefixes.

A valid result additionally rechecks the stored object. Its pending compare-and-set
and sealed `POP_SCAN_RESULT` audit event share the existing D1 audit transaction.
The database checks expiry at mutation time. Audit failure rolls back the clean
status; concurrent or replayed results cannot create a second completion event.
All verdicts preserve `bankFundsConfirmed:false` and never settle a payment.
The raw scoped verdict metadata, signature, hash, provider and scan time are stored
privately for subsequent verification; receipt bytes are not stored in SQL/audit.

## Private attachment primitive

`readCleanPopForOwner` now returns a private attachment `Response`, replacing its
unqualified raw-R2-object prototype return. No production callsite or HTTP route
currently uses this helper. Future routing must derive the actor from live session
and platform-owner authorization, not request fields, and qualify request expiry.

Only an accepted/stored, clean, undeleted, correctly scoped receipt with a valid
persisted scanner signature and matching bytes may be returned. The current scanner
identity/key must verify that record. Download rechecks ETag, length, SHA-256 and file
validation, then conditionally records owner access and a sealed audit event in one
transaction. Deletion or state/content change before that transaction blocks the
response; an unavailable audit does too. A clean flag alone is insufficient.

Responses are octet-stream attachments with a sanitized filename, private/no-store
caching, no-sniff, sandbox CSP and no-referrer headers. No public object URL, reusable
retrieval token or storage key is emitted. Blocked/failed/pending/deleted content
remains unavailable. The five-minute limit governs accepting a scan response;
already accepted historical verdicts do not expire after five minutes. Approved
scan-age, key-rotation/history and rescan policies are still required before launch.

## Remaining release gates

The extended fields remain only in the design candidate schema. No release migration
or remote schema operation is supplied. Existing legacy/null identity records are
not made reviewable or backfilled automatically. Real scanner transport/provider
qualification, unavailable-scanner handling, consent/privacy review, malware test
corpus, safe UI/routing, retention/deletion, key rotation, operational reconciliation,
and request throttling remain outstanding. Uploads stay disabled until those gates
are independently reviewed and demonstrated. A POP never replaces independently
reconciled bank credit for payment activation.
