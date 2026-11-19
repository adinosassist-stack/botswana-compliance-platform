# Essentials private frozen-evidence reader — source-only qualification

**No deployment or D1 execution authorized.** This addition is stacked on PR #2691 (issuer plus protected consent authority store). All tests and data are synthetic.

## Scope

`server/essentials-private-frozen-evidence-reader.mjs` supplies two **unmounted** issuer callback candidates:

- `loadFrozenAcceptedQuotation`: one same-D1 joined read, requiring an accepted frozen quote and active consent with matching tenant, reference, customer, acceptance version, BWP minor-unit total, stored quotation digest and authenticated tenant actor ID; returns the immutable quotation bytes only when their SHA-256 equals the stored digest.
- `verifyRecordedCustomerConsent`: a **fresh** joined D1 read that revalidates the same fields and separately hashes the stored consent evidence bytes before returning the record needed by the isolated receipt issuer. It checks exact quote/customer/amount/hash values against the earlier call.

Both reject a missing, cross-tenant, revoked, mismatched, corrupt or malformed joined row. The module supports D1 BLOB representations of byte arrays but never passes unverified SQL bytes into the issuer. The issuer must still atomically recheck current quote and consent at **receipt commit** through the guarded adapter.

## Explicitly NOT proven

A row named `essentials_private_verified_consents` does **not** establish that an actual customer logged in, read and approved the frozen quotation. Matching SHA-256 digests establish only content integrity, **not identity, provenance or legal consent**. The `verified:true` return value refers to integrity of accepted rows under this mocked/controlled boundary; it must never be used as a substitute for customer authentication.

Still required before any staging execution: real independent customer-authenticated consent capture, tamper-evident provenance, issuer authorization and key custody, exact staging D1 schema and backup approval, trusted receipt store, real tenant/customer identity reconciliation, and end-to-end isolated private tests with revoked/replayed/failed actions.

## Tests

- Node unit and synthetic issuer-interoperability tests: `tests/essentials-private-frozen-evidence-reader.test.mjs`
- Real joined SQL semantics via offline SQLite: `tests/essentials_private_frozen_evidence_sqlite.py`
- Both added to protected Essentials offline CI.

No production Finance reads/writes, Worker upload, private-route activation, existing quotation-draft modification or staging migration are in scope.
