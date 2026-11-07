# General AI private Queue durable nonce ledger — candidate, UNMOUNTED

This independently reviewable module supplies the previously missing durable one-time-claim algorithm for the default-OFF private Queue design. The SQL schema is a candidate for a **new, isolated staging-only D1**; it is NOT part of any migration runner or Worker/queue binding. No cloud resource has been created or modified.

The adapter uses a D1 `INSERT OR IGNORE` with an immutable unique primary key over SHA-256(namespace + newline + approved SHA + newline + random nonce). It interprets `meta.changes === 1` as the sole accepted claim and `=== 0` as already used. Any missing/error/ambiguous D1 metadata fails closed. It never deletes a consumed nonce, including after a target invocation failure. No raw nonce is stored. It has no remote API, migration, delete/clear or production import.

## Mandatory gate before using any real database
- Independent review and separate owner approval of a **new dedicated staging-only D1** and schema application; never use the production D1 or the private AI authentication D1.
- Verify actual binding identity, least-privilege consumer access, budget, log retention and no public route; the `schemaQualified` boolean is only a caller assertion, NOT an authorization credential.
- Verify D1 `meta.changes` semantics with real isolated Cloudflare D1, including contention across separate Worker invocations and failure/retry behavior.
- Review nonce entropy, producer token scope, source SHA attestation and acceptance Queue governance separately.
- Durable claims consume storage; determine documented retention and archival policy before any writes. Do not delete live claims during an active qualification window.
- This does NOT wire the adapter into the Queue consumer, create Queue resources, deploy a Worker or allow a protected test dispatch. Such a wiring and provisioning batch needs independent approval and a protected environment.
- This does NOT test authenticated staging sessions, CSRF, tenant isolation, research provider calls, cost caps or production General AI. These are separate NO-GO gates.

## Evidence
Run `node --test tests/general-ai-private-queue-d1-ledger.test.mjs`. Five real in-memory SQLite tests pass locally, covering idempotency, shared-database contention, separate identities, strict scope, unknown response/failure paths. CI and `thusico` review on the exact PR head are additional requirements. No remote D1 transaction is claimed.
