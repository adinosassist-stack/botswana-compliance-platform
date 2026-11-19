# Essentials private identity-bound atomic consent: source-only qualification

**UNMOUNTED. ISOLATED-STAGING MIGRATION CANDIDATE ONLY. NO DB EXECUTION OR CUSTOMER ACTIVATION.**

This source-only stage follows PRs #2694 (pinned OIDC verification candidate), #2696 (one-statement challenge/consent transaction), #2697 (private host session and CSRF boundary), and #2698 (read-only HMAC customer link resolver). Until this change, the final consent INSERT did not recheck the current customer identity link; a link could be revoked between OIDC subject lookup and write.

## Evidence propagation and final INSERT guard

- The private customer identity-link resolver now returns the immutable link ID and **keyed** issuer+subject HMAC-SHA256 lookup tag in addition to the opaque consent subject ID. Only a trusted HMAC key held outside a customer agent may compute this tag.
- The pinned-ID-token candidate requires a valid link ID and HMAC tag from the independently checked account-link callback and records them in the server-created immutable consent evidence bytes. The raw IdP subject and raw token remain outside stored evidence.
- The one-time consent adapter rejects missing or malformed identity-link provenance fields before writing, preserving the existing byte-digest check.
- The new additive SQL candidate `essentials_private_identity_bound_capture_STAGING_CANDIDATE.sql` adds a BEFORE INSERT trigger on the existing private capture-attestation ledger. It checks, **inside the same atomic outer consent INSERT**, that the identity-link row is ACTIVE, unexpired, not revoked, independently previously provisioned, and matches the exact tenant/customer, subject HMAC, issuer, link ID and consent subject ID contained in the immutable evidence. The existing AFTER INSERT guard then writes consent and consumes the challenge, rolling back every change if any guard rejects.

Migration order if separately authorized later: private frozen quote/consent authority schema, one-time challenge schema, private customer-identity link schema, then this identity-bound guard — all in **one separately approved isolated staging D1**. This PR does not perform that sequence.

## Offline test scope

Node tests cover evidence generation from a linked signed IdP subject and rejection of malformed/missing link metadata. A new synthetic Python SQLite test runs the actual exported JavaScript INSERT SQL against all four proposed schemas/triggers and checks:
- Correct linked identity can commit once, consuming its challenge;
- Revoked or expired identity links reject the transaction;
- Changed link ID, subject HMAC, issuer or consent subject ID reject;
- Invalid immutable consent JSON, missing link metadata, and out-of-time ownership proof reject;
- Failed guard leaves zero ledger and consent records, and the challenge remains pending;
- Replays remain denied.

## Explicit remaining trust limitations

**This is not a real customer-identity-and-consent service.** The source does not provision an IdP, authenticate live customers, issue protected sessions or invitations, implement account-link approval, present the real frozen quote/terms to customers, or execute any D1 migration. The private host's independently authoritative ownership callback still must confirm the actual Finance/customer relationship and revocation. The SQL trigger cannot independently authenticate a customer's real IdP session or a privileged direct SQL writer. No runtime Worker route or binding is mounted.

Moreover, **revoking the identity link after consent is committed must invalidate downstream signed receipt issuance and current receipt verification**, and that subsequent revocation enforcement is not completed here. Do not activate signed receipts or customer acceptance until it is implemented and independently reviewed.

Source merge (if approved) is not operational authorization. Exact-source independent `thusico` approval, all required CI and protected merge controls are required. Actual isolated staging SQL, routes, issuer key custody, IdP setup, data retention and recovery need fresh exact-file/exact-resource owner and independent reviewer approvals; production launch needs a separate decision.
