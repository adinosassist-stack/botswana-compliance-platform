# Regulatory v1.7 → v1.8 populated remote-staging rehearsal — authorization contract

Status: **DESIGN ONLY — NO STAGING WRITE AUTHORIZED.** Tracks #1788 and #1793.
Readiness workflow: `.github/workflows/regulatory-populated-rehearsal-readiness.yml`.
The merged PR #1816 checks synthetic-only local fixtures; it is **not** the populated remote Cloudflare D1 rehearsal.

## Required independent staging-write authorization

A future **separate pull request**, reviewed by someone other than its author, must implement a *new* workflow and an independently reviewed fixture-loader/import runner. Do not add Cloudflare credentials or a remote SQL execution path to the existing readiness workflow. The future write job must remain default-off and use the protected `regulatory-staging` environment, with an explicit typed staging-write confirmation distinct from `INITIALIZE_EMPTY_STAGING` and `READ_ONLY_STAGING_D1`.

The reviewer must approve the exact current `main` SHA, exact staging UUID and name, explicit nonmatching production UUID, the dedicated short-lived least-privilege token, no concurrent writer, and verified recoverability or an approved fresh staging database. Credential presence alone is not independent staging-write authorization.

No production database writes; no real tenant records. Synthetic-only fixture identifiers and test evidence must be clearly labeled. No automatic publication or source approval.

## Exact rehearsal phases

1. **Read-only identity and baseline:** independently authorize read-only queries on the named staging database. Confirm there are no unexpected existing source, snapshot, approval, obligation, or rule records. Stop on any unknown data or concurrent writer.
2. **Baseline evidence:** generate a minimal synthetic-only v1.7 fixture set that reproduces the checked-in local full-schema tests: two fictional tenants, open and completed historical VAT obligations, distinct schedules, legacy 25-day VAT draft/review rule, and synthetic source snapshot/reviewer variants. Never clone or hash production tenant records into staging.
3. **Separate write authorization:** approved fixture manifest, SHA, target, rollback/recovery plan, operator identity, concurrency protection and reviewer decision are prerequisites before invoking any D1 write.
4. **Staging-only fixture import:** perform bounded synthetic fixture writes only. Record exact counts and an immutable before-and-after comparison contract, and abort on unexpected records or changes.
5. **v1.8 guarded importer:** execute the real importer only after independent staging-write authorization. Stop on metadata drift before mutation. Protected source snapshots, checker reviews, registry and audit records must remain unchanged if a protected source would drift.
6. **History preservation:** confirm historical VAT due dates, two-tenant schedules and statuses are identical before and after import; legacy 25-day VAT stays in review (unless a separately reviewed historical fixture specifies another legal disposition); the 28-day proposal stays in draft. No automatic publication.
7. **Idempotent retry:** execute once more with fresh identity fencing and a read-only comparison. Zero unexpected new source, rule, approval or obligation changes. Verify foreign-key integrity and redact evidence.
8. **Independent signoff:** repeat the protected read-only attestor, retain bounded redacted artifacts and secure operator/reviewer acceptance. An aborted or failed rehearsal remains blocked rather than automatically retried.

## Stop conditions and scope

Stop on metadata drift, unexpected approval/publication, changed source snapshots, historical VAT due-date or schedule mutation, failed foreign-key checks, unreviewed fixture changes, concurrency or target mismatch, or missing independent authorization. Do not equate an empty database attestation with populated upgrade qualification. Production preflight, official legal source review, maker/checker decisions and production go/no-go remain separate gates.
