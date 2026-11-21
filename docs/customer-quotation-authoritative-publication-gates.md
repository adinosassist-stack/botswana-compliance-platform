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

## Isolated approved-publication registry proposed for the existing quotation D1

The live isolated `bw-quotation-staging` D1 (UUID
`aec227e9-b0f2-4b00-8de0-105465c4e2d6`) was read-only inspected:
its existing application tables are `quotation_drafts`,
`quotation_logo_assets` and `quotation_logo_settings`. There is **no
approved-quotation publication registry**. The source-only SQL candidate
`docs/sql/c4-quotation-approved-publications-STAGING-CANDIDATE.sql`
proposes an additive, append-only synthetic review registry. **It has not
been executed; no D1 migration is authorized by this PR.**

Its proposed records store the exact tenant/customer/quotation identities,
original immutable quote and full terms bytes, both SHA-256s, approval actor,
version, BWP minor-unit amount and evidence ID. A separate mandatory
assertion binds these fields, and permanent revocation tombstones prevent
further source reads of revoked records. The SQL constraints deliberately
reject changed/deleted publication, assertion or revocation rows. A dedicated
Python SQLite test exercises actual schema execution **only in-memory**,
including atomic assertion rollback, unique references, missing approvals,
revocation immutability and wrong-tenant/customer read denial.

`server/essentials-private-approved-quotation-staging-read-adapter.mjs`
implements a **read-only** D1 SELECT with tenant/customer/quote scoping,
mandatory matched assertion, revocation exclusion and SHA-256 re-verification
of both immutable byte buffers. It also requires separately supplied callbacks
to confirm the isolated D1 binding and independently verify the live business
approval before returning a record. It composes with the existing guarded
business-publication bridge. This source adapter does **not** connect Finance,
perform a publication INSERT, or make records authoritative by itself.

**Do not treat a staging registry row as a real issued customer quotation.**
A separately approved protected business issuer and genuinely authoritative
source must sign off the exact customer/quote/terms proof. Isolated staging
records are synthetic-only. Before any migration, reverify current main and
immutable SQL blob/checksum, confirm current database schema and backup
recovery, obtain **new distinct owner and thusico exact SQL execution
approvals**, and rehearse on an isolated disposable database. Never run the
SQL against production D1 or reapply an already installed migration.
