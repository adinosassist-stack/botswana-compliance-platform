# Essentials private consent authority — isolated D1 source candidate

**SOURCE ONLY · NOT AUTHORIZED FOR SQL EXECUTION OR DEPLOYMENT**

This design is stacked on PR #2691 and must not be merged or executed independently of its protected approval. It is a synthetic, isolated D1 **candidate**, not an established customer acceptance system. Do not run SQL against production Finance, shared billing D1, live quotation D1 or any other D1 without a separate exact-file, exact-database owner authorization and independent `thusico` review.

## Purpose

The issuer candidate needs an authority that cannot silently convert a previously revoked frozen quotation or recorded consent into an accepted signed receipt.

`cloudflare/migrations/essentials_private_consent_authority_STAGING_CANDIDATE.sql` defines three **new isolated staging** resources:

- `essentials_private_frozen_quotes`: frozen quotation revision, tenant, finance customer ID, BWP minor units, immutable source bytes, digest and irrevocable state.
- `essentials_private_verified_consents`: independently authenticated customer-consent provenance (including an external customer subject ID), immutable consent bytes/digest, actor, quotation financial matching and irrevocable state.
- `essentials_private_signed_receipts`: exact signed receipt and source digest references, one per tenant/quotation, with an irreversible revocation state and no delete.

**Important:** These table names and the presence of values do not prove the bytes are genuinely frozen, the digest is correct, that a customer is who they claim to be, or that consent was authentic. A *separate customer-authenticated consent-capture authority* and key/callback controls must be reviewed and qualified. SQL `CHECK` alone cannot establish any of that.

## New source-only D1 adapter

`server/essentials-private-consent-authority-store.mjs` is disabled by default and hard-gated to `essentials-private-staging`. It provides candidate methods for an issuer and verifier:

- `commitImmutableReceipt` uses a single `INSERT ... SELECT` statement that validates **both current accepted frozen quote and current accepted consent** at the D1 write boundary against tenant, quote, customer, reference, revision, minor-unit total, hashes, actor and acceptance time. Only exactly one inserted row is success. A uniqueness violation or change of authority state fails closed.
- `loadServerSideReceipt` returns a stored receipt only while frozen quote, consent and receipt all remain accepted/issued in **one joined D1 SELECT**.
- `verifyCurrentAuthorityReceipt` runs the same joined D1 query and compares receipt ID, actor, tenant, customer, quotation reference, version, amount and both content hashes.

The candidate does **not** validate customer identity, sign cryptographically, verify the issuer signature, establish browser sessions or issue an accounting invoice. The previously reviewed Ed25519 issuer and verifier own signing and verification. Do not wire this adapter as an authorization endpoint.

## Evidence and verification

- `tests/essentials_private_consent_authority_sqlite.py` executes the actual JS SQL constants against SQLite using synthetic rows and proves valid receipt commitment, cross-tenant and financial mismatch rejection, revoked-source and revoked-receipt denial, immutable/no-delete constraints and duplicate denial.
- `tests/essentials-private-consent-authority-store.test.mjs` checks the exact D1 binding contract, deny-by-default configuration, invalid client claims, failed D1 operations and current read-side checks.
- Additive SQL must be separately reviewed against the actual isolated staging database schema and foreign-key/index expectations. No database or cloud changes are made by these source files.

## Still blocked before operational use

1. Independently implement real customer identity and consent capture, with explicit approval of a fixed quotation/document revision.
2. Establish a trusted quote freeze with verifiable immutable bytes and BWP amounts; independently map the customer to the correct finance tenant.
3. Independently qualify the issuer private key custody, signature rotation, authorized actor and write-capability isolation.
4. Establish exact D1 bindings, backup and restore evidence, and authorization to execute the exact reviewed SQL **only on isolated staging**.
5. Add an end-to-end private host test (invitation/session/CSRF, customer proof, document freeze, sign, commit, read, revoke, denial) using only synthetic identities.
6. Obtain separate production approvals before considering any live route, quote-to-invoice customer action or production Finance change.

**The existing live website remains unchanged.**
