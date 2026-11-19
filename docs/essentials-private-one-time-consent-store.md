# Essentials: isolated one-use challenge and atomic consent storage candidate

**SOURCE ONLY. DOES NOT AUTHORIZE SQL EXECUTION, WORKER BINDINGS, PRIVATE ROUTES OR CUSTOMER ACTIVATION.** This is a new tranche of #2695 after #2694. Synthetic tests do not constitute real customer consent or an approved identity provider.

## Security model required for eventual integration

- The #2694 pinned-OIDC verifier must be wired by a separately reviewed private host with genuine session authentication, CSRF, verified Origin and current account mapping. Customers must view the exact frozen quotation and terms before explicit acceptance.
- The private host must invoke authorizeHostSession on each operation and bind challengeId and nonce to the same authenticated server-held session. The begin method generates 256 nonce bits using a host-provided secure random source and stores only SHA-256 of encoded nonce text. The plaintext nonce must stay in the protected session, not a URL or log.
- The host must resolve independently authenticated customer identity, current tenant/customer link and actor authorization before obtaining a challenge. The tenant actor is not automatically the authenticated customer.
- The commitVerifiedConsent adapter checks immutable evidence SHA-256 and exact matching fields. It cannot by itself establish real IdP proof or host authorization. The actual private host must inject it into the pinned OIDC service only and NEVER expose it as a public API.
- The exact SQL candidate requires the previously proposed private consent authority schema, on the same separately approved ISOLATED D1 database. No SQL is run by this PR.

## Single-statement transaction

The immutable essentials_private_capture_attestations ledger has one unique tenant and quote pair. One INSERT invokes a SQLite trigger that:

1. Executes guarded INSERT SELECT into the existing private verified consents table, requiring identical tenant/quote, accepted quote state, pending challenge, customer/actor, reference, version, BWP minor total, quote SHA-256, nonce SHA-256 and D1 server-time expiry.
2. Consumes the exact pending challenge.

Each step requires exactly one changed row or raises ABORT, rolling back the entire outer statement and every triggered change. There are NO separate success-checked commits or read-then-write race windows. One active challenge per tenant/quote and unique capture attestations reject duplicate concurrent acceptance. All challenge and attestation rows are immutable except irreversible pending-to-consumed/revoked status transitions.

Offline SQLite tests execute the actual exported JS SQL and test replay, expiry, foreign key/unique constraints, mismatches, revocation, partial-failure rollback and immutable capture evidence. Node tests exercise the staging feature gates, server nonce digest, parameter binding, malformed bytes and fail-closed paths.

**Trust limitation:** SQLite cannot verify JWT signatures or calculate the SHA-256 of BLOBs. The host must cryptographically verify identity/nonce and frozen quote bytes; the adapter hashes serialized consent evidence before writing. A privileged direct SQL writer could still forge records bypassing this adapter. Restrict DB binding, data access, source writer permissions and review the complete host.

## Approval and operations

Separate exact-source owner approval and independent thusico review are required before code merge. For any isolated staging D1 migration/Worker deployment, require additional exact-resource/exact-SQL owner and thusico approval, privacy/retention review, current schema backups and recovery acceptance, documented token/cookie/nonce storage, provider key rotation, customer mapping, revocation path and isolated end-to-end synthetic tests. Production launch remains a distinct approval.

**Not implemented:** real identity-provider activation, customer-facing UI, protected session persistence, private route, complete provider/issuer key custody, real D1 execution, production Finance access or customer activation.
