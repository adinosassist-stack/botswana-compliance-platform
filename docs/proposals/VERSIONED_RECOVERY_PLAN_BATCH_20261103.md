# Thebe Desk — consolidated versioned recovery plan batch

**Status: REVIEW ONLY, NO RESTORE AUTHORITY.** This change combines the independently reviewed private backup receipt and distinct-empty-restore-target contracts into a deterministic, no-network, no-write recovery plan.

## Two private production backup candidates

| Run | Key | Size | Verification state |
| --- | --- | ---: | --- |
| 41709222476 | `candidates/41709222476/1/production-d1.sql` | 3,224,706 bytes | Protected export/roundtrip succeeded; no independent SHA-256/bookmark acceptance |
| 41710740133 | `candidates/41710740133/1/production-d1.sql` | 3,225,845 bytes | Protected export/roundtrip succeeded; no independent SHA-256/bookmark acceptance |

Both exist in private R2 bucket `bw-compliance-ops-backups`; no bucket object-lock rules were returned. Neither candidate should be selected by size, run ID or R2 ETag alone. The actual protected workflow **Step Summary (not its job log)** must be reviewed for SHA-256, export bookmark, export source SHA and provenance. Both prepare jobs succeeded (#41709222476 and #41710740133); their accessible job logs show the receipt was written to \`$GITHUB_STEP_SUMMARY\` from a private temporary JSON file, but do not themselves expose an independently verified SHA-256/bookmark. Never fabricate receipt fields. Privileged independent byte rehash and retention approval are required.

## Restore-target constraint

The existing historic restore D1 `07c1aaeb-215a-4f01-80b6-a5e0ebedfcd8` has **572 schema objects** and cannot be reused for a fresh import. The empty rehearsal application D1 `c5c232a8-8fe7-440c-81ba-021a44fd3fdd` is not a restore target. Do not drop, reset, overwrite or repurpose either.

**Provisioning update (2026-11-03, separately executed after original PR #2129 merged):** The user approved the single previously proposed candidate target. A distinct D1 was created in Cloudflare account `ddd23cab31928a4bb3d4998df9b26d1d`:

- Name `bw-compliance-os-ops-restore-candidate-20261103`
- UUID `be15acba-ba16-4704-9498-e296a164b3a2`
- Read replication disabled at creation.
- Post-creation D1 GET inventory: **9 databases**, exact UUID/name present.
- Actual read-only catalog SQL `SELECT COUNT(*) AS object_count FROM sqlite_schema WHERE substr(name,1,7) != 'sqlite_' AND name != '_cf_KV'`: **object_count=0**, **rows_written=0**, **changes=0**.
- Account's four listed Worker settings each returned successfully and none references the new UUID: `bw-compliance-os`, `bw-compliance-os-ops-rehearsal`, `bw-billing-staging`, `bw-general-ai-staging`. This does not independently prove all API-token, service, or externally accessible paths are isolated.
- Cloudflare evidence checkpoint: [issue #1950 comment](https://github.com/adinosassist-stack/botswana-compliance-platform/issues/1950#issuecomment-6614844443).

**Provisioned is not restore-authorized.** An independent reviewer must still verify target access boundaries, currently empty schema, current exact main head, private backup receipt SHA-256/bookmark, retention/RPO policy, owner and independent recovery approvals, and a new protected versioned-input workflow. Do not use the legacy populated restore D1 or application rehearsal D1. Do not place actual customer records or private backup receipt contents in repository files.

## Consolidated no-write plan

`scripts/plan-versioned-recovery-offline.mjs` reads an operator-private JSON input with EXACTLY `candidate`, `target`, `policy` and `review`.

- `candidate`: use the strict `validateCandidateReceipt` schema from `scripts/qualify-private-pop-backup-evidence-offline.mjs`; **never** substitute an ETag for `sha256`, invent an export bookmark or commit customer records.
- `target`: use the `qualifyIsolatedRestoreTarget` schema from `scripts/qualify-pop-isolated-restore-target-offline.mjs`; independently verify Cloudflare metadata, an empty D1 catalog, zero rows written and a representative Worker-binding inventory. The validator cannot prove all account access paths were enumerated.
- `policy`: `maximumRpoMinutes`, `retentionDays`, and traceable references for retention policy review, storage access, restore isolation and representative sample evidence. These are **operator assertions only**, not observed enforced policies.
- `review`: distinct owner and independent reviewer identifiers, their traceable references and exact current reviewed main SHA.

Run `node scripts/plan-versioned-recovery-offline.mjs /path/to/private-plan.json` only in a restricted operator environment. The output contains a deterministic SHA-256 digest of selected evidence claims, target/source identities and an explicit HOLD. Input content is **not** copied into Actions artifacts or logs. Do not commit a populated input file.

The backup's export source SHA is an historical point-in-time identity. It intentionally need not equal the later reviewed current-main SHA: conflating these would reject legitimate older recovery points. The exact export bookmark must anchor later recovery comparisons, rather than comparing restored counts with a moving production database.

## Required independent actions

1. Review and select one backup by verified private SHA-256, bookmark, RPO and data-integrity evidence. Obtain explicit owner and independent reviewer approval.
2. Approve R2 protection, retention duration, lifecycle/deletion/rotation, scope and restoration operator. Zero object-lock rules currently means no enforced immutability.
3. The new separate private, empty, unbound restore D1 is provisioned as stated above. Independently re-verify zero user-schema objects, zero rows written, all account Worker bindings, access tokens and alternate access paths before accepting the new target; preserve the existing historical 572-object restore.
4. Design and independently approve a new **protected, globally serialized versioned-input restore workflow**. Do not alter the old fixed `approved-d1-backup.sql` path or rewrite candidate objects. Abort on partial target state and do not auto-retry writes.
5. Run an authorized isolated recovery rehearsal, tenant-isolation and authenticated business acceptance, matching the export bookmark. Record actual recovery duration, rollback controls and sanitized evidence.
6. Only separately authorize production POP 070/071 schema writes after full recovery acceptance. POP uploads, advanced AI exports and payments based solely on customer references stay disabled; bank receipt must be independently verified for subscription activation.
7. Qualify core-first release with POP frozen through exact-SHA manifest, BF-07, protected deployment and postdeployment checks.

No production/restore D1 writes, Cloudflare object or lock mutation, release change, deployment, credential access or environment approval are authorized or executed by this consolidated PR. Tracking: #1950.
