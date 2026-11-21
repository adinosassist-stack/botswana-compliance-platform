# C4 — business-approved quotation publication bridge to immutable full terms

**Source only. No deployed route, production issuance, invitation, login or D1 write.**

This change reuses the already-reviewed immutable quote + complete terms
freeze store rather than inventing a second customer quotation ledger.

## Confirmed limitations in current live flow

The live owner-only customer-ready page under
cloudflare/src/quotation-browser-preview.js renders an editable quotation
interface, not a trusted issued quote/account-ownership authority. Staging
quotation_drafts is not an issued customer quotation with a tenant-scoped
Finance customer assignment. C4's separate customer consent staging
database has its immutable freeze schema, but no frozen quote records.

These three facts prevent safely delivering a live external-customer login.

## New source interface

server/essentials-private-business-quotation-publication-bridge.mjs exposes
createC4AuthoritativeQuotationPublicationBridge, default disabled and
restricted to essentials-private-staging. An operator must provide:

1. A business principal independently verified by the server as an
   authenticated active owner of the exact tenant, with validated session,
   CSRF, and quotation:issue:approved capability. A browser-supplied
   principal is never accepted as authoritative by the host.
2. Read-only authoritative business customer lookup bound to tenantId and
   customerId; the customer must be current, active and not revoked.
3. Read-only authoritative quotation lookup bound to tenantId, customerId
   and quotationId, showing exact approved-for-issuance state, a current
   approval-evidence ID, a version, BWP minor-unit amount, exact quote bytes,
   complete approved terms bytes, and both SHA-256 digests. Do not trust
   draft payload, customer display name or email as account ownership.
4. Separate owner authorization for that exact source/customer/quote, plus
   an independent recheck immediately before the freeze. This recheck
   alone is not atomic; the underlying D1 store must independently verify
   source authority again at the batch commit boundary.
5. The already-reviewed createEssentialsPrivateFrozenTermsReviewStore
   instance, bound only to isolated C4 staging D1. Its freezeQuotationWithTerms
   executes the three-row atomic insert and mandatory terms/audit assertion.
   This source module itself never opens a database or creates a route.

The bridge verifies identical tenant/customer/quote identity and the
source supplied quote/terms SHA-256 against separately bounded immutable
byte snapshots. Only if every check passes can it call the existing
freeze store and verify that the returned digests and version exactly
match. It returns no invitation or login authorization.

## Critical external work

**This source code is not a live approved issuance operation.** No actual
business-approved quotation datastore, approved owner-only issuance endpoint,
trusted Finance/customer read binding, approval-evidence source, signing
key or production-to-private-staging data transfer is supplied here.

For a functioning isolated test, the team still needs a business-owned
approved quote/terms source (not just drafts), explicit tenant/customer
assignment, independent exact-source authorization, private signed
ownership issuer connected to current records, private OIDC, trusted delivery
channel, Access policy, recovery and separate owner + thusico approvals.
The current default C4 Worker stays 404-only. No customer-facing routes
or production writes are authorized by merging this source.

Test file:
tests/customer-quotation-authoritative-publication-bridge.test.mjs.
The existing offline-only C4 CI workflow tests permitted and denied cases,
then performs the same deny-all Worker dry-run binary build; no cloud token
or write is available to the job.

At a minimum, reject: employee actor or cross-tenant owner, unauthenticated
session, missing CSRF, stale/archived Finance customer, unpublished or
revoked quote, tampered quote/terms bytes, wrong version/amount, failed
independent approval recheck, failed atomic freeze and inconsistent receipt.
