# Proposed opt-in backup freshness observer — does NOT schedule backup exports

## Intent
The protected D1 backup creator is manual-only. This proposal adds a separate **read-only** GitHub Actions watchdog, scheduled for minutes 7 and 37 of each hour, to check whether the most recent *listed private R2 SQL candidate* is older than 90 minutes (warning) or 120 minutes (stale). Its report always remains a HOLD for sustained recovery qualification; object last-modified timestamps do not prove D1 export/bookmark validity or restore acceptance.

## Activation gate — disabled by default
The workflow's scheduled job skips unless an operator deliberately sets repo variable `BACKUP_CADENCE_OBSERVER_ENABLED=true`; it also requires repo variable `BACKUP_MONITOR_ACCOUNT_ID=ddd23cab31928a4bb3d4998df9b26d1d` and a **NEW dedicated** GitHub secret `BACKUP_R2_READONLY_TOKEN`. The existing backup/restore credentials MUST NOT be reused. Before configuring, independent reviewer and owner must evaluate token access to read-only R2 metadata for only `bw-compliance-ops-backups`, secret scope, token expiry/rotation, and who can update these GitHub variables. Restrict workflow editing to main-production-governance. Never copy any token into an issue or log.

This source change **does not** create tokens, variables, environments or a write-capable schedule. With the activation var absent/false, cron only runs offline tests and no Cloudflare request. Manual dispatch defaults to DO_NOT_RUN and is also gated by the same var and token. The only remote calls in the observation script are two GETs for bucket lock and candidate listing; GitHub read-only main-SHA check is performed before the credential step.

## Alert and limitations
For an enabled observer, a warning/stale/failed metadata check produces a failing Actions run; an operator must arrange a separate, existing notification/escalation channel and investigate. Success only means metadata newer than 90 minutes: `rpoQualified=false` remains unconditional. GitHub scheduled jobs may be delayed or dropped, so this observer is not a guaranteed low-latency incident pager. Exhaustiveness depends on the R2 listing response and will fail closed on advertised truncation. Use an external uptime/CI-run health monitor to detect absent runs, and independent receipts to prove sustained <=120 minute RPO.

## Separate write-capable operating design
Real recurring exports require a separately reviewed operation with D1 export and R2 object upload permissions, isolated credential custody, 30-day object retention/overwrite refusal evidence, successful GET-after-PUT checksum and bookmark receipts, tenant/FK restore qualification, incident escalation, and rollback/partial-failure policy. Do NOT turn the manual approval-gated `private-production-backup-candidate.yml` into an unattended write runner or use this observer as authority to do so. Production release, POP, billing and general AI exports remain disabled pending release approvals.
