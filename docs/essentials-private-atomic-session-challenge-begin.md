# Essentials private atomic challenge creation and encrypted session binding

**SOURCE ONLY · UNMOUNTED · NO STAGING SQL EXECUTION · NO LIVE CUSTOMER LOGIN OR CONSENT**

## Fixed failure mode

The previous source-only `oneTimeConsentStore.begin()` plus `sessionChallengeBinding.bindSessionChallenge()` ran in two independent D1 operations. If the second step failed, an unbound, pending quotation challenge could remain and block further attempts. PR #2706 replaces that two-operation journey **only for a future separately authorized isolated staging host** with a single `db.batch()` of three prepared SQL statements.

Cloudflare's documented D1 `batch()` method executes a SQL transaction and rolls back the entire statement sequence on SQL error. However a guarded `INSERT ... SELECT` that inserts **zero rows is not an SQL error**. This is why the third mandatory statement is an unconditional insertion into a new immutable `essentials_private_atomic_session_begins` audit table with a BEFORE INSERT trigger that **RAISE(ABORT)** if the exact challenged quote, encrypted binding, current actor session, active grant and unchanged nonce/timestamps are not present and valid. The error rolls back the challenge INSERT, binding INSERT and audit INSERT together.

## Transaction and credentials

1. A trusted host supplies a separately authenticated tenant actor, the SHA-256 of its opaque session cookie and a frozen quotation ID. `authorizeHostSession` and `loadActiveSession` must independently confirm tenant/role/branch/grant authorization. Browser-supplied principal or grant information is never sufficient.
2. The adapter reads the current accepted, unconsented frozen quote as a preflight to acquire the correct customer identity for AES-GCM additional authenticated data. The batch's SQL **rechecks** quote state and all authoritative joins; no preflight result alone can authorize the write.
3. An independent cryptographically strong random 256-bit OIDC nonce and unique challenge ID are generated. The original nonce is encrypted under a **nonextractable AES-GCM-256 host key**, with a fresh 96-bit IV and authenticated metadata binding session, tenant, actor, quotation, customer, challenge, nonce hash and time limits. A unique IV index also enforces nonreuse for all rows in the isolated binding table. The raw nonce is not stored in D1.
4. The first statement uses the existing #2696 guarded challenge INSERT. The second uses the existing #2705 guarded session-bind INSERT. The third inserts an audit assertion guarded by an ABORTing trigger. This is one call to `db.batch`, not a sequential set of `run()` calls. A missing or mismatched first or second insert causes a SQL error and all-or-nothing rollback. Duplicate attempts and expired/revoked sessions or quotes remain denied.
5. The return value contains only an opaque challenge ID and effective shorter expiry. A trusted host must call the already reviewed encrypted `loadSessionChallenge` interface to recover the nonce before initiating OIDC. The nonce legitimately appears in the IdP authorization redirect URL; authorization URLs, cookies, CSRF values and tokens must be redacted from host/proxy logs and never become identity proof.

The audit record is immutable and must be subject to a separately approved privacy retention policy. The implementation does not run a cleanup job or configure encryption keys, user invitations, IdP, Workers or D1 bindings.

## Offline verification and limits

Node tests use a real nonextractable AES-GCM key and validate three-statement batch shape, correct authenticated metadata and nonce encryption/decryption, actor/grant/quote denial, missing DB and fail-closed error behavior. The in-memory SQLite test loads **all five actual candidate schemas** and executes the four SQL constants exported by the JavaScript source in a single explicit transaction. It proves three committed rows on success; failed quote/actor, expired or revoked session, wrong nonce, omitted binding, duplicate encrypted IV and replay leave **zero orphan rows**, including the pending challenge. These tests do **not** prove the code has been deployed to D1.

**Still missing:** real provider registration, real authenticated customer and independent customer-to-quotation account ownership, protected session/CSRF/IdP HTTP host, verified frozen terms UI and explicit consent, key custody and rotation, migration/backups, production privacy retention, negative E2E staging execution and separated owner and `thusico` approvals. Privileged direct D1 writers remain a trust risk without protected binding/access controls.

Protected source merge requires passing exact-SHA CI and independent formal `thusico` GitHub review. Any actual isolated D1 schema creation, Worker version/deployment, IdP credentials and real user data operation need **new exact-resource/exact-SQL owner and independent reviewer authorizations and recovery evidence**. Production release remains distinct. No live site or production Finance changes are in this PR.

Cloudflare D1 batch reference: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch
