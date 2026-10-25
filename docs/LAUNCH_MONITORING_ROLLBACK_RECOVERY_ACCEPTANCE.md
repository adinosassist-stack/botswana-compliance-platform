# Thebe Desk production monitoring and recovery acceptance (launch item 7)

Status: **qualification required**. This checklist is not evidence of a live alert, tested rollback, backup, or successful restore. Do not change production flags or release authority to satisfy it.

## Authority
- Use `release/production.json` and exact-SHA BF-07, Production deploy and post-deploy workflows described in `docs/LAUNCH_STATUS.md`.
- Cloudflare Worker + D1 + R2 is production. Node/Postgres is not a drop-in rollback target.
- Keep regulatory and autonomous execution gates unchanged. Do not deploy from this document.

## Monitoring acceptance
- [ ] Verify unauthenticated `/api/live`, `/api/health`, `/api/ready` with expected status and sanitized responses; monitor from an independent external vantage.
- [ ] Verify `/api/ops/diagnostics` rejects unauthenticated and unauthorized requests; only approved roles can view operational diagnostics.
- [ ] Confirm centralized Worker logs and alert routing with a named on-call owner and backup. Do not log credentials, tokens, signed URLs, or sensitive tenant payloads.
- [ ] Configure and test alerts for sustained 5xx, readiness failure, D1 read/write quota risk, scheduled_run_failed, repeated worker_request_failed, auth attack spikes, R2 failures, and sustained 429s. Record thresholds and alert delivery evidence.
- [ ] Verify current Cloudflare request, CPU, error, D1 row read/write and storage usage against paid/free limits. Record capacity headroom and upgrade trigger.

## Rollback acceptance
- [ ] Record current deployed release SHA, manifest source SHA, BF-07 seal, deployed Worker version and latest applied D1 migration from authoritative evidence.
- [ ] Identify last known-good *deployable* Worker artifact and documented Cloudflare rollback operation; confirm its compatibility with current D1 schema and R2 objects.
- [ ] Rehearse rollback on isolated staging, never on live customer traffic as a test. Verify auth, tenant isolation, workspace reads, and readiness afterward.
- [ ] No automatic D1 schema downgrade, deletion, destructive migration replay, or rollback to a schema-incompatible Worker. Escalate and use forward-fix if compatibility cannot be demonstrated.

## Recovery acceptance
- [ ] Confirm D1 backup/PITR capabilities and retention for the actual production database; record RPO and RTO approved by owner.
- [ ] Restore to a separate isolated database and validate data integrity, tenant boundaries, migration ledger, and representative application reads. Never overwrite production to test restore.
- [ ] Verify R2 evidence object recovery strategy and independent restore sample, including metadata/object consistency.
- [ ] Exercise failure scenarios: Worker 5xx spike, D1 unavailable/quota exhaustion, R2 failure, failed cron and bad deployment. Verify incident owner, escalation, customer communication and recovery evidence.
- [ ] Record test date, operator, exact SHA, redacted evidence links, result, unresolved risks and independent signoff.

## Release decision
**NO-GO for marking item 7 complete** until all relevant boxes have independent evidence. An existing runbook or green CI alone does not prove production monitoring, alert delivery, rollback, or recovery.
