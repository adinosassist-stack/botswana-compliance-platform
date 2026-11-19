# Essentials private signed-receipt identity revocation — source-only candidate

**No operational authority:** This adds SQL query guards and synthetic tests to the existing UNMOUNTED receipt authority. It does not provision a real Identity Provider, database, Worker, live route, receipt signer, customer data or public acceptance feature.

## Problem

The private quotation acceptance receipt authority previously joined accepted frozen quote + consent rows, but did not verify that the customer's independently provisioned identity mapping remained active **at the moment the receipt was issued or later verified**. A signed receipt has a short TTL, but revocation must invalidate access immediately, not merely after expiry.

## Hardened authority

Both SQL constants in server/essentials-private-consent-authority-store.mjs now require, in the SAME isolated D1 read or guarded INSERT:
- Immutable consent must match the authoritative capture attestation **by exact BLOB bytes**, consent digest, tenant, quote, customer, actor, amount, version, reference and timestamp.
- The associated one-time challenge must have been irreversibly consumed and bind the same actor, customer, quotation and nonce hash.
- The exact link ID, issuer, keyed subject HMAC and opaque consent subject in the attestation's immutable JSON must match the **currently active** private customer identity link.
- The identity link cannot be revoked or expired. It must be independently provisioned by the recorded acceptance time. Link expiration checks use D1's millisecond-precision clock.
- Malformed JSON is handled fail-closed with an inert fallback, not trusted as customer identity.

A revoked or expired link therefore causes a previously signed receipt to disappear from the authoritative lookup, and the public-key verifier's fresh-authority check must fail even though the Ed25519 signature remains mathematically valid. Issuance checks the same predicate inside its single guarded INSERT SELECT so a link revoked after consent capture but before receipt signing cannot authorize issuance.

The existing signatures do not contain a new identity field: identity is bound to the original immutable consent digest and verified by the same-D1 query. This preserves the receipt contract and ensures the decisive revocation decision is based on CURRENT authority, rather than a stale authorization callback.

## Offline proof and remaining limitations

Offline SQLite tests execute the actual JavaScript SQL against synthetic data with the source-only private authority, one-time challenge, identity mapping and identity-bound capture schemas. The tests verify valid issued receipts, consent/quote/receipt revocation, wrong tenant/customer/amount/quote versions, legacy consent rows with no identity-proof lineage, link revocation after issuance, link revocation before issuance, and permanent revocation. The existing Node tests assert the guarded joins are in both queries.

**Still not a real customer consent service:** These are unmounted source-only candidates. Real IdP reauthentication, secure customer host/session, account-link verification and provisioning, customer-visible immutable terms, privacy and retention, issuer private-key custody, and isolated staging D1 execution remain separate qualification gates. A trusted direct SQL writer could bypass application-level HMAC/IdP proof; all SQL bindings and privileged writes require independent operational controls.

## Required approvals

Before protected code merge: full CI success and independent exact-head thusico GitHub approval.

Before ANY staging operation: separate owner and independent thusico exact-resource, exact-SQL and recovery approvals for the isolated D1, protected Worker session/identity provider binding and signer. The live site, Finance D1, production customer identities, payment services and customer-facing quotation acceptance remain unchanged and disabled. Production activation requires a distinct release decision.
