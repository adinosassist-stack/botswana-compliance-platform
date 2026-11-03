# POP versioned private backup — exact-evidence acceptance boundary

This file documents a **candidate receipt contract**, not a production restore or migration authorization.

## Current versioned candidate (physical R2 metadata independently seen)

- Protected GitHub Actions run: `41709222476`, run attempt `1`
- Source SHA at backup run: `a474d04678f6dfdec75507a8ee58058b2db3d1f2`
- Private bucket: `bw-compliance-ops-backups`
- Candidate key: `candidates/41709222476/1/production-d1.sql`
- Byte length: `3224706`
- R2 ETag from listing: `e0421f30a8b558fe884d0b779452ac24` (**NOT SHA-256**)
- Protected workflow `qualify` and `prepare` completed successfully.
- Candidate SHA-256 and D1 `exportBookmark` must be obtained from the protected run's step summary; **neither value is known in this document**. Never invent them, and do not paste private SQL, tenant records, bearer credentials or signed URLs.

## Safe offline receipt contract

An approved operator may construct a private receipt JSON containing exactly these fields:

```text
kind: private_production_backup_candidate
accountId: Cloudflare production account ID
databaseId: production D1 UUID
bucket: bw-compliance-ops-backups
sourceSha: the exact backup-run source SHA
runId: decimal run ID
attempt: decimal run attempt
candidateKey: candidates/RUN_ID/ATTEMPT/production-d1.sql
bytes: integer byte length
sha256: 64 lowercase hexadecimal characters from the protected receipt
exportBookmark: source export bookmark from the protected receipt
privateRoundtripVerified: true (only if verified by workflow)
```

Run `node scripts/qualify-private-pop-backup-evidence-offline.mjs /path/to/operator-private-receipt.json` locally. Optionally set `EXPECTED_MAIN_SHA` when binding to a reviewed source SHA. The script makes no network calls, does not see the object bytes, accepts **no additional fields**, never treats an ETag as a digest, and always returns `retentionApproved:false`, `restoreApproved:false`, `productionWriteAuthorized:false`.

This input must be stored privately with limited access. **Do not commit the actual receipt** to the repository if it contains operational bookmarks or private backup metadata. Report only a sanitized cryptographic digest and sign-off reference when a reviewer has inspected the evidence.

## Independent actions still required

1. Independently verify the R2 bytes' SHA-256 and match the exact export bookmark, source SHA, size, bucket/key and run/attempt.
2. Owner and reviewer approve RPO, retention duration, lock/lifecycle/rotation policy, storage isolation and access control. The backup bucket currently has zero object-lock rules; do not silently apply irreversible retention or change the legacy fixed approved keys.
3. Create a *separately reviewed* versioned-input promotion and **isolated non-production** restore plan. The existing `scripts/isolated-operations-rehearsal.mjs` still expects fixed `approved-d1-backup.sql` and `approved-r2-sample.bin`; this contract **does not** change that runner, copy/overwrite keys or cause restore writes.
4. Separately qualify tenant-isolation and point-in-time recovery against the approved export bookmark. Current live production may have changed.
5. POP production 070/071 requires its own specific owner write authorization, independent protected review, phase-scoped runner and post-migration checks; customer POP evidence never proves cleared bank funds.

Tracking: #1950. POP ingestion/scanning and advanced AI exports remain disabled under core-first scope.
