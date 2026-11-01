# Read-only backup integrity gate

This qualification reads only the exact reviewed SQL and real R2 sample under candidates/41348652986/2/ in the private backup bucket. Their reviewed SHA-256 hashes are pinned in source. It neither exports production again, changes any remote database, promotes approved keys, nor restores data.

After independent exact-head review and merge, dispatch on exact current main with QUALIFY_PRIVATE_BACKUP_CANDIDATES through operations-rehearsal. Existing independent reviewer, main-only and shared manual-rehearsal serialization remain mandatory. Uses the separate private backup credential, never widens the working preflight token.

Runner verifies candidate bytes against the pinned hashes, strict UTF-8, size limits and existing inspectBackup policy. It executes SQL only in an in-memory SQLite database, extension loading disabled, checks integrity/foreign keys and requires tenant/user data plus the six baseline recovery tables. SQL, row values, source-object keys and arbitrary exception messages are not logged. Output includes only hashes, aggregate sizes/table count and qualification verdicts. No backup Actions artifact or persistent runner SQL file is created.

The existing inspector rejects filesystem-oriented SQL tokens before execution; it is not a general SQL sandbox. Run only independently reviewed first-party backup bytes in this protected disposable runner with bounded timeout. Tests exercise real SQLite failures, not only string contracts.

R2 sample: a real 7,034-byte UTF-8 text/plain evidence object was copied privately and roundtrip verified. Its candidate hash is pinned; it proves only that sample's byte integrity, not every object/metadata relationship. SQL hash verification does not itself prove production provenance, retention guarantees or RPO/RTO.

Observed backup bucket lifecycle has only the default seven-day unfinished multipart-abort rule, not an object expiration rule. Bucket lock rules are empty. No immutable retention guarantee is claimed; no lifecycle/lock change is made.

Passing this gate still requires thusico's independent evidence review and traceable approval before any promotion to approved-d1-backup.sql / approved-r2-sample.bin or protected restore. Keep production migrations, uploads, payment activation and launch acceptance separately gated.
