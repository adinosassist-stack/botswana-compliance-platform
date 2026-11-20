# C4 customer quotation — signed source-of-truth ownership bridge

**SOURCE ONLY / NOT CONNECTED TO A REAL ISSUER / NO ROUTE / NO CLOUD WRITE**

## Verified source-of-truth gap

Read-only inspection of production Cloudflare D1 bw-compliance-os showed the
tenant-scoped finance_customers table, but no quotation-related table in the
inspected sqlite_master table/view name list. This does not rule out a
separate Node/Postgres quotation source. The quotation module maintains an
independent D1 staging datastore bw-quotation-staging, with quotation_drafts.
These systems are not interchangeable; neither alone establishes an outside
customer's live right to a specific issued/frozen quotation.

Do not bind production D1 to isolated C4 customer staging. Never infer
customer ownership from display name, email, invitation URL, Google subject,
employee session, Finance customer existence or a synthetic identity link.

## Prepared functional private, one-way authority verifier

The source module
server/essentials-private-customer-ownership-authority-bridge.mjs
implements createC4TrustedCustomerOwnershipVerifier. It exports a named
verifyCurrentCustomerOwnership callback compatible with the existing
customer invitation/OIDC/session and identity-link functions.

- Requires an explicitly configured isolated staging environment and
  a separately approved Cloudflare *private Worker service binding*
  CUSTOMER_OWNERSHIP_SOURCE to a business-owned source-of-truth service.
  The internal .invalid hostname is only a binding dispatch target,
  never a public HTTP destination.
- Creates a new cryptographically random 256-bit nonce for every check.
- Sends a no-store credential-free **private binding POST** with exactly
  tenant, customer, quotation and identity-link IDs plus the fresh nonce.
  Never calls global fetch or production D1.
- Accepts only a bounded RS256 JWT signed by a pinned 2048-bit-or-better
  issuer public key. Pins issuer, audience, key ID, challenge nonce, four
  scoped IDs, current ownership, accepted quotation and short timestamps.
- Denies missing source, wrong tenant/customer/quotation/link, revoked
  relationship, stale JWT, replayed nonce, unapproved signature/algorithm,
  malformed body, source network failure and unexpected fields.
- Returns true only for the exact current source-attested association.
  It does not create an identity link, customer account or invitation.

The upstream authority itself is **NOT IMPLEMENTED NOR DEPLOYED** in this
batch. Its signer's public key must be pinned from an independently
qualified business source, not supplied by a browser or customer.

## Remaining proof required before staging operation

A separate approved issuer must check real tenant-scoped active customer,
approved published quote assigned to that exact customer, frozen immutable
quotation and complete full contractual terms/version, current unrevoked
identity-link/proof reference, and sign a fresh answer only after validating
the private caller. It needs its own source review, key custody,
rate limiting, audit, privacy/retention acceptance, recovery, and
separate owner and independent thusico approvals. A syntactically valid
JWT from a poorly implemented source **does not establish** genuine ownership.

Also outstanding: Google isolated staging project and confidential OIDC
client/consent approvals; private Cloudflare Access and complete C4 Worker
host; an actual one-time invitation delivery channel; isolated synthetic
end-to-end login, quotation/full terms, accept/reject, wrong-tenant/replay
negative/mobile tests; backup/restore rehearsal; and a distinct, explicitly
owner-initiated production authorization.

This change neither activates the new or existing customer login nor
changes production code, customer data or infrastructure. Source review
approval is NOT a Google/Cloudflare resource-write permission.
