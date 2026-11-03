# Versioned backup candidates — restricted local-byte verification handoff

**Review-only, no restore authority.** This change closes the gap where the existing protected integrity runner examines only `candidates/41348652986/2/`, not the two newer private SQL backup candidates.

## Allowed candidate identity
- `candidates/41709222476/1/production-d1.sql`: exactly 3,224,706 bytes
- `candidates/41710740133/1/production-d1.sql`: exactly 3,225,845 bytes

Neither candidate is selected or approved by this change. In a separately authorized, restricted operator environment, obtain the **actual private workflow Step Summary receipt** and the **exact private SQL bytes** with least privilege. Do **not** copy receipt bytes, SQL data, signed URLs, bearer tokens or customer records into GitHub.

After independent provenance review, execute:
```bash
node scripts/verify-versioned-private-candidate-local.mjs /secure/private-receipt.json /secure/production-d1.sql
```

The CLI requires a strictly shaped receipt with exact account, production source database, candidate bucket/key and byte size. It checks local bytes against the receipt SHA-256, validates UTF-8 and imports SQL into an in-memory SQLite database to test integrity, referential consistency and required minimum schema. Output is sanitized: only exact key, byte count, digest, claimed provenance labels, schema/table counts digest and **HOLD**. It never returns SQL or tenant record values.

**Important:** A receipt supplied by an operator could be forged. Matching private SQL bytes to an operator-provided hash does not independently authenticate the GitHub Step Summary, export bookmark, original D1 export, retention policy or sample-object bytes. Output explicitly keeps those claims FALSE. A passing local verifier is not a protected restore workflow, not a retained backup, and not production write approval. The existing immutable 572-object historical restore is out of scope.

## Required follow-through
1. Independently confirm exact run/attempt/source SHA and the protected Step Summary SHA-256/export bookmark, including evidence that the reported hash came from the successful protected export workflow.
2. Privately rehash the selected immutable versioned R2 object against the authenticated receipt; do not confuse R2 ETag with SHA-256.
3. Approve RPO, R2 retention/immutability and access credentials, including audit of alternate API-token and Worker access paths. Current object-lock rules were observed at zero.
4. Independently approve a **new** globally serialized versioned-input restore workflow targeting only the empty D1 `be15acba-ba16-4704-9498-e296a164b3a2` after rechecking the empty schema. Abort on partial state, no retry after partial import; do not use historical populated D1 or legacy fixed backup path.
5. Verify tenant/privacy/business acceptance at the export bookmark and receive separate production-write and public release approval. Keep POP ingestion, AI exports and unverified payment activation disabled.

The CI runs only synthetic fixture bytes and has no production data or Cloudflare credentials.
