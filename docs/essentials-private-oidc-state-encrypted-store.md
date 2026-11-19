# Essentials encrypted one-use OIDC authorization state — source-only qualification

**UNMOUNTED, PRIVATE-STAGING CANDIDATE. NO REAL CUSTOMER LOGIN, CLOUD RESOURCE OR D1 EXECUTION.**

This follows merged PR #2701's OIDC authorization-code + PKCE S256 handshake. That source required two host-owned callbacks — `persistAuthorizationAttempt` and `consumeAuthorizationAttempt` — but did not implement state persistence. This tranche supplies an isolated, default-disabled D1 adapter and a candidate SQL schema. It does **not** supply an actual IdP, customer session, hosted endpoints or operational access.

## Storage and cryptographic contract

- The parent OIDC flow generates a 256-bit random state and a separate 256-bit PKCE verifier. The new adapter stores only the SHA-256 state digest, opaque server-session digest, tenant actor, exact quotation/customer/challenge, nonce digest, pinned IdP issuer, client, redirect and token endpoint, plus timestamps and an **AES-GCM encrypted** verifier. It never stores the raw browser state, plaintext PKCE verifier or OAuth code.
- The encryption key must be a **nonextractable, host-held AES-GCM key** with encrypt/decrypt privileges. It must not reside in the isolated D1, browser, repository or logs. A fresh 96-bit IV is supplied by an approved cryptographically secure RNG for each state; IV uniqueness per key is mandatory. The authenticated encryption additional-data is the canonical ordered set of every identifying, routing and expiry field, so tampering with any field makes decryption fail.
- One guarded SQL `UPDATE ... WHERE state='pending' AND state/session digest match AND both caller and D1 millisecond clocks are within issuance/expiry RETURNING ...` consumes the state before returning the encrypted record for private decryption. A wrong session, expired/revoked state or replay returns no record. D1 must execute the statement atomically, not emulate it with a separate read and update.
- Database triggers prevent changing immutable metadata/verifier ciphertext, deleting rows or reverting a consumed/revoked attempt to pending. One pending attempt per server session/tenant/quote restricts parallel login ambiguity. The host must implement revocation of stale/aborted attempts and approved retention/cleanup policy **separately**; this source does not schedule deletion.
- The adapter's `consumeAuthorizationAttempt` returns plaintext codeVerifier **only inside the confidential host** after one-time consumption and AES-GCM verification. The parent #2701 flow independently checks session, customer challenge and nonce before exchanging the code, and **never accepts the returned ID token as identity**. It must still pass the pinned #2694 cryptographic ID-token, fresh-auth-time and exact frozen-consent checks.

## Tests and restrictions

A new Node adversarial suite tests AES-GCM tampering, state/session digest binding, one-time consume, wrong session, expired state, invalid metadata and D1 outage. An offline in-memory SQLite suite executes the actual exported JavaScript SQL to prove atomic UPDATE RETURNING, duplicate prevention, expiry, immutable ciphertext, one-time consumption and irreversible revocation. These run in the existing Essentials offline qualification workflow.

**Remaining prerequisites:** real IdP registration, provider trust and key rotation, confidential token-exchange transport, protected server session and D1 authority, persisted challenge/nonce link, secure customer ownership proof, customer-visible immutable quote terms and agreement, data privacy and retention, and private end-to-end staging qualification. Do not confuse successful synthetic tests with real customer authorization. SQLite cannot verify a customer's real IdP token and a privileged direct D1 writer can bypass host-level checks.

A protected source merge needs passing exact-head CI and independent `thusico` formal GitHub approval. Executing any staging SQL, provisioning an IdP or Worker and changing protected storage requires **new exact-resource/exact-SQL owner and independent reviewer approvals**, plus recovery verification. The live website and Finance production remain untouched.
