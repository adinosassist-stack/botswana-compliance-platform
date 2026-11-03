# Protected read-only byte qualification for two versioned private R2 candidates

**Scope: independently compute a live private object's SHA-256 in a protected GitHub job; no restore authority.**

## Why

Older `private-backup-integrity.yml` validates a fixed historical prefix, not either newer D1 backup SQL object. The connected Cloudflare API currently exposes inventory metadata but not usable binary SQL bytes for independent digest verification. This path reads the bytes **only inside a gated GitHub Actions environment** and emits a sanitized digest, not data.

## Explicit allowed private objects

- `candidates/41709222476/1/production-d1.sql` — expected 3,224,706 bytes
- `candidates/41710740133/1/production-d1.sql` — expected 3,225,845 bytes

Neither key implies approval or freshness. The flow never chooses the larger or more recent candidate automatically. The source code rejects all other run IDs.

## Protected execution

After this PR is independently approved, merged and required checks are green, a designated operator may request a manual `workflow_dispatch` of `.github/workflows/versioned-r2-candidates-readonly.yml` from **exact current reviewed main** with an exact selected `candidate_run_id`, current 40-character `expected_sha`, and explicit `QUALIFY_PRIVATE_BACKUP_CANDIDATES` confirmation.

The no-secret preapproval job checks source/ref/revision against GitHub's live main. The `inspect` job is gated by the separately reviewed `operations-rehearsal` environment and must use its private backup read token. Its only remote operations are R2 GET for managed/custom domain settings and the exact candidate object. It enforces private access, known byte size, UTF-8 and in-memory SQLite integrity. No Cloudflare PUT/POST/DELETE, production D1 query, restore, Workers deployment, database migration or payment activation is performed. The normal PR CI runs mocks only.

The protected Step Summary reports exact object key, actual SHA-256 and size, table count and hashed counts, plus an explicit HOLD. No tenant data, SQL, credential or signed URLs are reported. A failure does not leak raw provider errors.

## Remaining independent requirements

- Locate and authenticate the **original historical protected preparation Step Summary** for each run, including source SHA, final `at_bookmark`, exact key, claimed SHA-256 and roundtrip evidence. Current exporter's improved receipt format does **not** retroactively reconstruct these fields.
- Independently compare the authenticated historical digest with the newly measured actual R2-object digest; authenticate any discrepancy instead of selecting by size.
- Approve and enforce owner-defined RPO and backup retention/object lock in separate, independently reviewed account change; zero lock rules have been observed.
- Approve an isolated **versioned input** restore workflow targeting only empty D1 `be15acba-ba16-4704-9498-e296a164b3a2`. Existing legacy restore script hardcodes `approved-d1-backup.sql` and the old `bw-compliance-os-ops-restore` target; this read-only job does not alter or authorize that path.
- Conduct tenant/security and business acceptance after authorized isolated restore; require separate production approval. Keep unfinished POP ingestion, advanced AI exports and unverified customer-reference subscription activation disabled.

**Success of this workflow alone does not grant backup provenance, immutability or release authority.**
