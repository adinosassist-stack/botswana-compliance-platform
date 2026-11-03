# POP fresh candidate — distinct isolated restore target admission

Review-only contract. No new D1 database has been provisioned by this change.

## Evidence already verified

- Current historical restore `bw-compliance-os-ops-restore` / `07c1aaeb-215a-4f01-80b6-a5e0ebedfcd8` contains **572** schema objects. It is **not empty** and must not be used for an initial import. Preserve historical recovery evidence.
- Rehearsal app D1 `bw-compliance-os-ops-rehearsal` / `c5c232a8-8fe7-440c-81ba-021a44fd3fdd` contains **0** objects but is designated for application rehearsal, **not a restore target**.
- Production `bw-compliance-os` / `8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce` must never be targeted.
- Fresh private SQL candidate `candidates/41709222476/1/production-d1.sql`, 3,224,706 bytes, was created by the independently approved protected run. The candidate's actual SHA-256 and export bookmark must still be independently captured from that workflow's step summary and verified; R2 ETag is not its SHA-256.

## Next protected recovery pathway

1. Owner and independent reviewer approve the costs and scope for a **new distinct private empty D1 restore target**, a specific naming convention, account/tenant access review, retention/RPO/rotation policy and recovery operator. Do not create new resources or assume authorization from this document.
2. Verify the new D1 UUID and name with Cloudflare metadata. Inventory schema via fixed read-only catalog query, check `rows_written=0`, require zero user schema objects, and independently review all Worker bindings and potential public access paths. Never infer all-account isolation from one worker's binding list.
3. Use `scripts/qualify-pop-isolated-restore-target-offline.mjs` through explicit source-reviewed inventory to catch wrong DB UUID, reused production/staging/rehearsal IDs, nonempty targets and listed Worker exposure. A green result **never authorizes an import**.
4. Obtain independent SHA-256 verification and bookmark provenance for the exact private versioned backup candidate and representative approved object; approve RPO and retention protection. No copy to legacy fixed `approved-d1-backup.sql` or overwrite of existing keys without separately reviewed migration.
5. Create an independently approved, human-dispatched, globally serialized **versioned-input isolated restore** workflow with explicit account and exact new database UUID pins, empty-target checks immediately before import, no replay after partial failure, approved checksums and independent protected environment reviewer. It must not access production for writes.
6. Run point-in-time structural and functional checks, privacy/tenant authorization, rollback and restored representative-object SHA-256; record sanitized proof. Compare restored data to the actual export bookmark, not moving live production.
7. A subsequent production POP 070 then 071 migration needs separate explicit owner **production-write** authorization and protected review. Customer POP uploads or references cannot independently verify bank settlement.

This batch is an offline safeguard and runbook only. It creates no Cloudflare resource, does not alter an existing restore target, does not use private backup bytes and does not activate POP, scanning, payments or exports.
