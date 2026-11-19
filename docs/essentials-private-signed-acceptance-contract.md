# Essentials private quotation acceptance — issuer/verifier review contract

**Status:** Source-only design for isolated private staging. No issuer, live consent flow, Worker route, private staging deployment, finance write authorization or production activation.

## Why this exists

The Lovely quotation editor's `quotation_drafts` records are **editable documents**, with neither an authoritative customer acceptance event nor a trusted finance customer ID. Their draft staging source is separate from the isolated Essentials acceptance/draft D1. Treating a quotation's editable status or a browser-supplied `accepted=true` as acceptance would be unsafe.

This candidate verifier can be injected into `createEssentialsVerifiedAcceptanceWriter` only by a trusted private host. It **does not authenticate the customer's consent**. That remains a separately reviewed issuer-side capability.

## Receipt issuer requirements (not implemented)

1. Independently authenticate the actual customer and their explicit acceptance of the *frozen* quotation revision. Preserve auditable provenance and bind the customer to the correct tenant and finance-customer ID.
2. Hash the frozen accepted quotation document and the actual consent record with SHA-256, in lowercase hex; bind both digest values to the same immutable receipt. Use an issuer-held Ed25519 private signing key that **never** enters an Essentials Worker or browser.
3. Bind a unique `receiptId`, `tenantId`, `quotationId`, `customerId`, `quotationReference`, `acceptanceVersion`, integer `totalMinor`, `acceptedByUserId` (authorized tenant actor), `acceptedAt`, `issuedAt` and `expiresAt`.
4. Set `purpose="thebe.essentials.quotation-acceptance.v1"` and `issuer="thebe-private-quotation-consent-staging"`. Receipt expiry must be at most 10 minutes after issuance.
5. Produce a JSON payload with **exactly** the fields above (plus `consentSha256` and `quotationSha256`) sorted by key alphabetically, with `JSON.stringify` canonical serialization (no whitespace, extra keys or nested values). Sign the UTF-8 bytes of that serialization with Ed25519; emit the 64-byte signature as unpadded base64url (86 characters).
6. Provide a private, authenticated server-to-server receipt lookup. **Do not accept browser-provided signed receipts as the authoritative lookup.**
7. Provide a separate current-authority check that validates the *same* receipt ID, quote version, exact financial fields, both digests, and confirms acceptance has **not been revoked or superseded**. Fail closed if the authority is unreachable.
8. Explicitly verify whether customer consent and the tenant actor record are separate identities. `acceptedByUserId` is a tenant actor field in the current Essentials D1 schema, **not independently proven customer consent**.

## Verifier output and writer

`createEssentialsSignedAcceptanceVerifier` requires the issuer **public** key, server-side receipt lookup, current-authority callback and private-staging enable flag. It rejects unsigned/edited, expired, future, wrong-tenant, wrong-quotation, wrong-actor, revoked and unsupported receipts. Only then does it return the typed `verified:true` object consumed by `createEssentialsVerifiedAcceptanceWriter`.

The writer's guarded insert and the draft-replay guard operate on the **same isolated Essentials D1**. The editable quotation-drafts storage is a separate source: a valid receipt and current-authority check are mandatory. There is **no permission** to join/modify production Finance or copy customer data across environments.

## Required before a real staging deployment

- Independent threat-model review of receipt signing, customer-consent collection, revocation, key storage/rotation, quote revision freeze and cross-system identity mapping
- Actual trustworthy issuer implementation and private authorization, not a simulated `verified:true` callback
- Explicit account, environment, Worker, private route and D1 isolation evidence, recovery/rollback evidence and separate owner + `thusico` approval for any operational change
- End-to-end private tests with synthetic customer consent and authoritative quote revisions; negative tests for revoked, altered, cross-tenant and unavailable sources
- Separate production release decision, if ever requested

**Merging this source does not make quotations accepted, issue invoices, enable an HTTP endpoint, deploy Workers or change the live website.**
