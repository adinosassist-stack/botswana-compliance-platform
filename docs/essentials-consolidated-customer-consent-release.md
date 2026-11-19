# Thebe Desk Essentials — consolidated customer-consent release candidate

**One consolidated PR. Source-only, disabled by default, UNMOUNTED and UNEXECUTED. No public customer acceptance or live website change.**

This is a single coherent release batch on top of independently approved/merged PRs #2701–#2711. No more tiny PRs are required for the source-only customer-consent ledger. The actual operational release remains separately gated.

## Consolidated source components and intended journey

1. **Authoritative business freeze**: The trusted backend obtains an approved exact customer quotation, version/BWP amount and full contractual terms from its own authoritative source. #2711 creates quote bytes, separate immutable full-terms bytes and an audit proof in one guarded, atomic isolated-D1 batch. A quote without complete terms never becomes customer-reviewable.
2. **Independent external customer identity**: Real customer-specific invitation and registered confidential IdP Authorization Code + PKCE must establish the person's customer account, not an employee actor. The separate #2709 `__Host-thebe-customer` session has a strong cookie, independent CSRF, pinned RS256 signed IdP claims, current identity/ownership checks and independent expiry/revocation. It is currently an unmounted implementation **without** actual IdP, invitations, customer authentication host or real account proof.
3. **Full terms review**: #2710 GET requires current customer session; #2711's review store presents exact frozen quote and complete terms, SHA-256 verifies both, and stores a short-lived `offered` presentation bound to this session/tenant/customer/quote/digests/version/amount. A GET or `offered` row is NOT proof the customer read or accepted anything. The real customer UI and render/CSP/no-store headers are NOT built.
4. **Explicit authenticated acceptance**: #2710 separate customer-only same-origin POST checks origin, Fetch Metadata, CSRF, strict bounded JSON, active customer, exact quote AND terms digests/BWP amount/version and current review offer; returns a protected internal **request context**. It never accepts an employee cookie or browser-submitted identity/IdP JWT.
5. **New consolidated consent commit**: This PR's `createEssentialsPrivateConsolidatedCustomerConsent` calls the actual trusted #2710 `validateExplicitCustomerAcceptance` service directly and requires a **separate, current, independently verified real customer identity/ownership proof** and explicit host commitment authorization. It signs fixed-field canonical evidence with a **nonextractable HMAC-SHA256 server key**. The evidence stores immutable customer, quote and terms hash, exact total and version, session **hash**, identity-link/consent-subject hash, proof reference hash, decision/explicitness and acceptance timestamp. It stores neither raw cookies, JWTs, nonce, CSRF nor the actual IdP subject.
6. **Atomic final record**: In one isolated D1 `db.batch()` transaction, guarded SQL (a) consumes precisely one valid current customer review offer, (b) `INSERT ... SELECT`s one distinct **outside customer** consent record joined to current session, independently provisioned current identity link, accepted frozen quotation AND immutable contract terms, and (c) inserts an immutable audit assertion whose `BEFORE INSERT` trigger raises `ABORT` if either preceding write inserted zero rows or the exact lineage mismatches. SQL rollbacks protect the offer from being consumed without a consent record. One acceptance per quotation, replay, cross-tenant/customer/quotation/changed terms/version/price, revoked session/link/quote, missing identity proof and stale offer are denied.
7. **Integrity verification**: A protected internal reader validates SHA-256 over immutable JSON bytes and **cryptographically verifies the HMAC** against the current protected server key, checks all critical signed fields against the stored row, and reports the historical consent state. A future key-rotation/key-ID and archival verification policy must preserve legacy receipt verification.

### What the HMAC does and does not mean

The HMAC signature **authenticates the server's acceptance record**, not the outside customer's private signature, identity, actual reading, understanding, or legal enforceability. The stored signed event is only reliable if the real host and identity/consent source were independently verified at the moment of POST. Never describe this as completed real-world consent without those prerequisites. An arbitrary host callback returning `verified:true` is NOT proof. The host implementation must validate the identity provider's signed token, unique original invitation/nonce, actual current customer-to-quotation legal authority and reauthentication requirements, and retain accessible audit evidence.

### Technical verification

Node unit tests cover explicit intent, immutable evidence HMAC, read verification, no employee attribution, bounded trust context, mismatched identity/subject, stale authentication, interrupted D1 transactions, duplicate submissions, tampered receipt and missing host authorization. In-memory SQLite exercises the **actual exported JavaScript SQL** against all five source-only candidate schemas and tests complete (offer + consent + audit) commit or rollback, current issuer/account/session/terms/amount/version, replay/revocation and historical evidence. The test proves SQL logic in SQLite, not actual Cloudflare D1 configuration or live IdP.

### Holds before resource creation or real users

This **one PR is not a deployment authorization**. Remaining cross-functional gates are grouped as one operational launch batch, not new small source PRs:

- Qualified real customer invitation generation, delivery/possession proof, PKCE callback and IdP registration, JWKS/key rotation and confidential HTTPS host
- Actual customer-host UI showing accessible full terms and explicit accept/reject action, with `Cache-Control: private, no-store`, CSP, cookie/CSRF redaction and anti-abuse limits
- Independent, recorded customer account ownership and authorization (not merely the Thebe employee or IdP subject)
- Approved financial/contractual terms provenance and privacy/lawyer review, customer disavowal/revocation handling, archival HMAC key rotation, legal receipt handling and retention/backup/Time Travel deletion guarantees
- One **isolated private staging** D1/Worker configuration and real E2E negative tests with synthetic accounts, recovery drills, audit and owner+independent `thusico` exact-SHA approvals
- A **separate** protected production release decision after the verified staging journey succeeds

**No Cloudflare schema execution, Worker upload, live route, real customer identity/consent, production Finance writes, or production website changes are part of this source-only PR.** Do not bypass GitHub required checks, exact-head formal `thusico` review or independent staged resource approvals.
