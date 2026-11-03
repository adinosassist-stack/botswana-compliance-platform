# Thebe Desk — consolidated versioned recovery plan batch

**Status: REVIEW ONLY, NO RESTORE AUTHORITY.** This change combines the independently reviewed private backup receipt and distinct-empty-restore-target contracts into a deterministic, no-network, no-write recovery plan.

## Two private production backup candidates

| Run | Key | Size | Verification state |
| --- | --- | ---: | --- |
| 41709222476 | `candidates/41709222476/1/production-d1.sql` | 3,224,706 bytes | Protected export/roundtrip succeeded; no independent SHA-256/bookmark acceptance |
| 41710740133 | `candidates/41710740133/1/production-d1.sql` | 3,225,845 bytes | Protected export/roundtrip succeeded; no independent SHA-256/bookmark acceptance |

Both exist in private R2 bucket `bw-compliance-ops-backups`; no bucket object-lock rules were returned. Neither candidate should be selected by size, run ID or R2 ETag alone. The actual protected workflow Step Summary must be reviewed for SHA-256, export bookmark, export source SHA and provenance. Privileged independent byte rehash and retention approval are required.

## Restore-target constraint

The existing historic restore D1 `07c1aaeb-215a-4f01-80b6-a5e0ebedfcd8` has **572 schema objects** and cannot be reused for a fresh import. The empty rehearsal application D1 `c5c232a8-8fe7-440c-81ba-021a44fd3fdd` is not a restore target. Do not drop, reset, overwrite or repurpose either.

Provision a distinct, empty private D1 only after explicit owner approval of resource costs/scope and independent Cloudflare access-path isolation review. No new D1 is created by this PR.

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
3. Approve a separate private, empty, unbound restore D1, verify every access path and Worker binding; preserve the existing historical 572-object restore.
4. Design and independently approve a new **protected, globally serialized versioned-input restore workflow**. Do not alter the old fixed `approved-d1-backup.sql` path or rewrite candidate objects. Abort on partial target state and do not auto-retry writes.
5. Run an authorized isolated recovery rehearsal, tenant-isolation and authenticated business acceptance, matching the export bookmark. Record actual recovery duration, rollback controls and sanitized evidence.
6. Only separately authorize production POP 070/071 schema writes after full recovery acceptance. POP uploads, advanced AI exports and payments based solely on customer references stay disabled; bank receipt must be independently verified for subscription activation.
7. Qualify core-first release with POP frozen through exact-SHA manifest, BF-07, protected deployment and postdeployment checks.

No production/restore D1 writes, Cloudflare object or lock mutation, release change, deployment, credential access or environment approval are authorized or executed by this consolidated PR. Tracking: #1950.
