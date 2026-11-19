# Essentials private customer identity-link reader — source-only candidate

**UNMOUNTED. NOT AN IDENTITY PROVIDER, ACCOUNT OWNERSHIP PROOF OR LIVE CUSTOMER SERVICE.**

This is the next source-only increment for issue #2695 after #2697. Previous layers check cryptographic OIDC tokens, session/CSRF, frozen quotes and one-time consent storage. An authenticated IdP subject still must be linked independently to the correct tenant and customer record.

## Design

- A separate, specifically approved provisioning authority must verify a real customer's ownership of the intended tenant and customer account using auditable evidence; the provisioning step is **not implemented**. No automatic association by a browser-supplied email, phone number, customer ID or IdP subject is allowed.
- The proposed isolated Essentials private-staging D1 schema records a single immutable issuer + HMAC-subject association per customer, a separate opaque consent subject ID, owner/proof metadata, expiry and irreversible revocation. It is an unexecuted candidate migration; do not bind it to production Finance, customer CRM or billing.
- The read-only resolver requires exactly the configured HTTPS issuer, an authenticated token subject already verified by the #2694 pinned IdP path, a nonextractable HMAC-SHA256 key, tenant/customer/quotation IDs and a host callback verifying **current** authoritative customer-account ownership. It signs a canonical issuer/subject pair to compute the database lookup tag; it does not store or query plaintext IdP subject.
- Current Finance/customer ownership is a separate trusted callback. The database row alone is an administratively recorded association, not independent proof of identity. The callback must reject revoked links, superseded/deleted customers and cross-tenant mapping.
- The returned result is only an opaque consent subject ID on strict success; no account creation or subject reassignment endpoint exists.
- All exceptions, invalid formats, missing active records, expired links or failed host ownership checks deny access.

## Security and privacy restrictions

An HMAC lookup tag must use a separately governed, isolated staging key held outside the user agent and application logs; do not use an unkeyed subject digest for lookup. Subject tags must not be copied across tenants. Key rotation, revocation and remapping need an independently approved migration and recovery procedure.

The currently proposed #2696 atomic consent trigger **does not yet recheck customer identity mapping**, so its staging SQL is **not authorized for execution** as a real consent service. A separate exact-source patch must make identity link presence/revocation part of the guarded atomic commit. Avoid a separate read-then-write race. Consent issuance must also independently prove provider identity and customer ownership.

## Verification

Offline Node tests cover pinned issuer, nonextractable HMAC key, correct opaque result, tenant/customer mismatch, revoked/expired link, changed mapping, missing current customer ownership and read failure. Python in-memory SQLite executes the exported production-source SELECT against the candidate schema and checks uniqueness, cross-tenant access, irreversible revocation and deletion denial.

**No deployment, D1 migration/execution, new Worker, route, account linking, real customer data processing or live Thebe Desk activation.** Independent thusico exact-SHA source review, required CI and later separate operational approvals are mandatory.
