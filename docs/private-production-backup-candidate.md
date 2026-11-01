# Private D1 backup candidate transport

Review candidate for #1950. No execution, stored backup or recovery is claimed by merging this change.

The owner authorized private production backup and isolated restore rehearsal. This workflow prepares only a D1 backup candidate. It does not import a database, copy a representative evidence object, promote approved inputs, enable features, or prove recovery. Export may briefly pause production queries; choose an appropriate operating window.

Independent thusico review of the exact head and the existing operations-rehearsal environment approval are required. Preserve main-only restrictions, prevent-self-review and no administrator bypass. Use exact current main and PREPARE_PRIVATE_PRODUCTION_BACKUP. All manual backup/rehearsal modes share the existing serialization group.

Configure a NEW dedicated PRIVATE_BACKUP_CLOUDFLARE_TOKEN in operations-rehearsal. Do not replace or expand the working read-only preflight credential or copy production deployment credentials. Independently qualify the minimum permissions needed for production D1 export, metadata inspection, and read/write of bw-compliance-ops-backups. Cloudflare resource-level restrictions must be verified rather than assumed; account-wide D1 reach is sensitive. Missing credentials fail before provider access. Token creation or access expansion requires separate review.

The script pins the account, production D1 and private destination bucket, rejects public bucket domains and exports all tables. Signed downloads accept only HTTPS provider R2 storage hosts, do not follow redirects, and never receive the API bearer credential. SQL is bounded to 25 MiB including streamed bodies. No SQL, signed URLs or provider error bodies are logged, and no backup is uploaded as an Actions artifact.

Candidates use candidates/RUN_ID/ATTEMPT/production-d1.sql, not approved-d1-backup.sql. An existing or unverifiable key stops upload; workflow serialization and exclusion of other writers remain necessary because GET-before-PUT is not an atomic conditional write. A private re-download must match SHA-256 before a sanitized receipt is emitted. A failed upload/verification may leave a private candidate; inspect before retry, never delete or overwrite automatically.

Before running, independently inspect all direct and indirect access paths to backup/restore storage and confirm retention, recovery operator and exclusive writers. The script checks bucket public domains, not every Worker binding, lifecycle rule, replication path or account principal. Receipt bookmark is export provenance, not a guaranteed PITR retention/expiry promise. Record provider retention separately.

Next: independently inspect candidate SQL integrity and actual data, record provenance/retention, copy and qualify a representative R2 sample without logging keys/content, approve both hashes, then promote exact reviewed bytes privately to fixed approved inputs. Only afterward may the separately protected RESTORE_APPROVED_BACKUP workflow run. No placeholder approval references, synthetic substitutes or production migration authority are introduced here.
