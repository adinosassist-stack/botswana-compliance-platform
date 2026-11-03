# Thebe Desk — Core-first launch freeze

**Status: proposed scope; not production deployment authorization.** Independent PR review, qualified exact-main CI, production recovery acceptance, and protected release/deployment permissions are still mandatory.

## Core release scope
Preserve already-qualified sign-in and tenant isolation, owner dashboard, core finance and provider-neutral reconciliation, existing AI business assistant without unreviewed autonomous operations, property/workspace core, registration safeguards, and documented read-only operational visibility. Production `PAYMENT_PROVIDER=none` means paid checkout is deferred; manual-payment references must never grant access. Existing core services should not be marked unhealthy simply because an unlaunched optional POP schema is missing.

## Frozen for the first core release
- **Advanced AI exports** (Word/PDF/PowerPoint generation): code may be reviewed offline but its server HTTP transport and Worker binding stay unmounted; production config pins `THEBE_AI_EXPORTS_ENABLED="false"`.
- **POP file ingestion/scan/owner document viewing**: production Worker unconditionally denies its staging upload route, and production config pins `POP_UPLOAD_STAGING_ENABLED="false"`. A future billing or staging feature cannot become a production POP route merely by changing a retained secret or environment variable.
- Unfinished external provider activation, advanced Gemini/General AI, new AI quota/retention/export automation, and new mobile APK work are outside this release. No new features, noncritical refactors or unrelated PR merges are part of this release batch.
- **Payment activation** remains subject to independently confirmed cleared funds in the Thebe Desk company bank account and a separate authorized owner approval.

## POP schema for this *specific* core-only release
The old packaged migration-tip policy requires all packaged migrations. This proposed scoped exception allows **deferring physical POP 070/071** only for the core-only release, **after** both static and rendered production configuration and Worker-route freeze checks pass in `scripts/qualify-core-only-release.mjs`. This changes a release-policy boundary, and must first be reviewed and merged by an independent reviewer. It does not claim POP tables exist, bypass a core schema check, or authorize POP upload activation. `/api/ready` must report physical POP status truthfully while core `schemaReady` retains its real meaning. No production SQL is changed by this proposal.

## Release acceptance still required
1. One independent approving review and green protected checks on the **exact** consolidated PR head. Protected branch ruleset remains active.
2. Approved backup retention/deletion and rotation policy; an up-to-date qualified recovery point meeting an explicitly approved RPO, plus tenant-isolation and rollback acceptance.
3. Proven exact-current-main core schema compatibility and fail-closed POP/advanced-export freeze, including rendered configuration checks at **both** preflight and production mutation boundaries.
4. Separately authorized **manifest-only promotion**, BF-07 seal, protected production environment review, and verified exact-SHA Cloudflare deployment.
5. Postdeploy exact-SHA recovery, registration, owner, finance, mobile, core AI, customer UI, and Phase 0 synthetic tenant-isolation tests. Hold or roll back if any critical test fails.

**Never** perform unreviewed production D1 migrations, enable POP/exports, or treat a customer-uploaded bank reference as funds clearance. Do not claim public launch until the authorized deployment and postdeploy acceptance are verified.
