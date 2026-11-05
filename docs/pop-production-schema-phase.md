# POP production schema phase candidate

This is a review candidate, not migration authority or a working customer POP release.
It supplies the previously missing single-phase executor for the already pinned
070 and 071 SQL. No environment, token, approval, migration or upload is created
by merging these files. Never dispatch before independent review of this code.

## Acceptance before a write

1. Settle the reviewed main SHA. The caller, checked-out SHA, both authenticated
   issue records and current branch must match. SQL bytes must match the existing
   fixed phase digests in `qualify-pop-production-phase-offline.mjs`.
2. Configure `pop-production-migration`: exactly `thusico` as required reviewer,
   prevent self-review, no administrator bypass and exactly the `main` branch
   policy. The executor reads GitHub's current configuration and refuses missing
   or inaccessible policy. A newly auto-created, unprotected environment fails.
3. Store dedicated `POP_PRODUCTION_GITHUB_READ_TOKEN` with read-only repository
   contents/issues/Actions/environment-administration access, and a distinct
   `POP_PRODUCTION_CLOUDFLARE_TOKEN` for the fixed D1 and production Worker
   metadata readback. Inspect actual least-privilege scope independently. Never
   copy a broad deployment credential. The ordinary workflow token cannot
   necessarily inspect environment administration; a 403 is a HOLD, not a reason
   to remove the policy check. No secret is printed by the executor.
4. Independently accept a checksum-verified private backup receipt and successful
   isolated restore on that exact source, including retention, isolation and
   rollback. The executor checks successful authenticated run metadata and a
   backup no older than 120 minutes. It does **not** download or independently
   hash private backup bytes: the two named humans must actually inspect and
   accept the referenced receipt digest, target, recovery and retention evidence.
   A successful preflight is not a successful restore.
5. The owner and `thusico` each post their own record in issue #1950. These must
   match exactly apart from their authentic authors, expire within 24 hours of
   original creation, and explicitly authorize only one phase. Never author or
   rewrite another person's approval. Example structure (placeholders are invalid):

```text
THEBE_POP_PRODUCTION_PHASE_APPROVAL
{
  "scope": "ONE_POP_SCHEMA_PHASE_ONLY",
  "phase": "070",
  "sourceSha": "<reviewed current main SHA>",
  "sqlSha256": "<exact phase SQL digest>",
  "accountId": "ddd23cab31928a4bb3d4998df9b26d1d",
  "databaseId": "8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce",
  "backupRunId": "<successful exact-source backup run>",
  "backupReceiptSha256": "<independently accepted receipt SHA-256>",
  "restoreRunId": "<successful exact-source RESTORE_APPROVED_BACKUP run>",
  "recoveryAccepted": true,
  "expiresAt": "<explicit UTC expiry within 24 hours of creation>"
}
```

## Execution and failure

Dispatch the protected workflow with the reviewed SHA, one phase, the two real
comment IDs and explicit confirmation. The default is `DO_NOT_RUN`. Phase 070
requires complete absence of POP objects. Phase 071 requires complete original
070 columns and absence of every 071 addition. Partial/replayed phases stop.
Both author records, source, environment controls and disabled feature flags are
checked again before the single D1 migration request. The workflow serializes
with backup/restore work. There is no provider retry, automatic rollback,
speculative schema repair or production deployment.

After a provider timeout or partial failure, the result is **unknown**, not
permission to retry: inspect physical schema read-only and obtain a separately
reviewed recovery decision. Postchecks inspect columns, indexes and POP foreign
key violations. They are not a complete production-compatible schema digest or
customer-data preservation proof. A phase 070 success is not permission for 071;
071 needs its own approvals and current recovery acceptance.

## Remaining receipt rollout

Even successful 070 and 071 leave uploads disabled. Production HTTP intake,
private quarantine, scanner transport/signature verification, platform-owner
download, retention, customer UI, synthetic authenticated tenant tests and a
protected production activation release remain separate qualification. The
current staging-only endpoint must never be enabled by changing its staging flag.
Bank-transfer reference submissions and receipts cannot activate subscriptions;
matching company-bank funds remain the payment authority.

Local validation: `node --test tests/pop-production-phase-executor.test.mjs
tests/pop-production-phase-workflow.test.mjs tests/pop-production-phase-offline.test.mjs
tests/pop-production-readonly-preflight.test.mjs`. Tests use real local SQLite
and simulated provider boundaries only, never production credentials or resources.
