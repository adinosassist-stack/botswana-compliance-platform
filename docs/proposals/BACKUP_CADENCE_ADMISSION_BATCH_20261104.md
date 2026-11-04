# Recurring private backup cadence — independent admission packet (offline only)

This batch adds a **pure deterministic gate and adversarial tests**, not a scheduled backup writer or approval. Its only successful result is `eligibleForSecurityReview=true`; `rpoQualified`, `restoreAuthorized`, `productionWriteAuthorized`, and `productionReleaseAuthorized` remain false even for a passing packet.

The proposed production backup scheduler must be designed and approved separately from the existing manual exact-main `private-production-backup-candidate.yml`. Never convert the protected manually approved workflow to unattended production writes. No identity, token, GitHub environment, Cloudflare binding or cron is provisioned here. Scheduled GitHub Actions and R2 metadata alone cannot prove RPO.

The reviewer-owned requirements are: minimum documented dedicated D1 export/R2 write credential, separate monitor identity, credential and lock-rule change authorities, exclusive/atomic object key ownership to resolve the existing GET-before-PUT race, export bookmark provenance and object integrity receipts, per-run SHA-256 private readback, retention duration and expiry, tested scheduler failure/escalation and recovery rollback. Keep any future writer disabled until this risk review and an independent guarded rollout.

The offline gate requests at least three strictly ordered, unique-key authenticated *claims* whose timestamps have <=120-minute observed gaps and a newest age <=120 minutes, plus recovery drills. This **does not cryptographically authenticate receipts**, prove a 24-hour/longer steady state, or authorize any restore. Do not synthesize fake `true` assertions to pass the gate. In real acceptance the verifier must independently collect signed receipts, prove uninterrupted operator and source auditability, confirm private R2 object lock non-overwrite/non-delete with the real identity, and assess a suitably long sustained cadence. Zero production data should appear in CI/logs.

Hold Release 590 #2182 as draft until independent owner and thusico reviews, accepted retention/access, distinct versioned restore approvals, one qualified isolated restore, BF-07 seal, and live literal-false POP/AI bindings. Payment references alone never activate subscriptions.

Run offline: `node --test tests/backup-cadence-admission.test.mjs`.
