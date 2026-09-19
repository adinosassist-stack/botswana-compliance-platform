# Backup & Restore — V78 v1.21.68

## Primary Cloudflare profile
A production backup is complete only when **both D1 metadata/state and R2 evidence bytes** are independently recoverable. Do not treat D1 Time Travel alone as the backup plan, and do not treat an R2 object copy without database linkage as sufficient.

### D1 export and verification
From the project root, using the reviewed Wrangler version:

```bash
npx wrangler@4.135.0 d1 export bw-compliance-os --remote --config cloudflare/wrangler.toml --output ./backups/d1-YYYYMMDD-HHMM.sql
node scripts/verify-d1-export.mjs ./backups/d1-YYYYMMDD-HHMM.sql --require-data
node --no-warnings scripts/verify-d1-restore.mjs ./backups/d1-YYYYMMDD-HHMM.sql --require-data
node --no-warnings scripts/d1-recovery-drill.mjs ./backups/d1-YYYYMMDD-HHMM.sql ./backups/d1-recovery-drill-YYYYMMDD-HHMM.json
sha256sum ./backups/d1-YYYYMMDD-HHMM.sql > ./backups/d1-YYYYMMDD-HHMM.sql.sha256
```

The shape verifier fails if the export is implausibly small or is missing critical schema for tenants, sessions, workspace state, audit history, evidence, deletion controls, authentication rate limits, or control-replacement governance. The restore verifier then executes the SQL in an isolated in-memory SQLite database, runs integrity and foreign-key checks, verifies critical tables, and (for a production export) requires tenant and user data. The shape verifier streams the export instead of loading it all into memory. The local restore verifier is intentionally capped at 256 MiB; larger backups must be restored into an isolated D1 database and verified there rather than forcing a huge in-memory local restore. Keep the SQL export and checksum **outside the live D1 database and outside the deployment ZIP**.

### R2 evidence backup
Preserve private evidence independently with object keys, tenant prefixes, sizes, content types and integrity metadata. Use an account-supported versioning/replication/export process appropriate to the retention policy. A D1 export does not contain R2 evidence bytes.

At minimum, the backup inventory must let an operator prove that each sampled approved evidence record can be mapped to the intended private R2 object and that quarantined/infected evidence remains blocked after restoration.

### Isolated recovery drill
Never restore a drill over production.

1. Create an isolated non-production D1 database and private evidence bucket.
2. Import the verified D1 export into the isolated D1 database.
3. Restore or copy the corresponding R2 evidence set into the isolated bucket.
4. Deploy the same application release against the isolated bindings.
5. Run the recovery acceptance checks below.
6. Record the export checksum, restored release, drill date, operator, failures and remediation.

### Recovery acceptance
A recovery drill passes only if the isolated environment can:
- authenticate a designated test user;
- load the correct tenant workspace and reject a different tenant;
- read audit/control history and preserve audit-chain verification state;
- resolve an authorized approved/clean evidence record to the correct R2 object;
- keep quarantined, infected or unapproved evidence blocked;
- preserve deletion requests and legal holds;
- report the current schema through `/api/ready`;
- preserve public Passport/reporter bearer-link expiry/revocation behavior.

## Optional Node/PostgreSQL profile
If the alternate Node profile is used, retain encrypted managed backups plus independent `pg_dump`, checksum verification and isolated restore tests. `scripts/verify-backup.sh` verifies that a PostgreSQL dump restores into a disposable database and contains the expected minimum schema. Evidence storage must still be backed up independently of PostgreSQL.

### Cross-layer D1 ↔ R2 evidence verification
After producing an R2 object inventory for the backup/restore target, verify that every live evidence object referenced by the restored D1 export is present:

```bash
node --no-warnings scripts/verify-evidence-r2-inventory.mjs ./backups/d1-YYYYMMDD-HHMM.sql ./backups/r2-object-keys.txt
```

The inventory may be newline-delimited object keys or JSON containing an array/`keys`/`objects`/`items`. The verifier restores the D1 export in isolation, derives both `object_key` and `clean_object_key` for evidence whose storage has not been deleted, and fails if any required R2 object is absent. Extra R2 objects are reported but do not block recovery because they may be unrelated or pending lifecycle cleanup.
