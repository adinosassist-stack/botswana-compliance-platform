# Read-only production operations metadata

This collector advances the evidence checklist in
`LAUNCH_MONITORING_ROLLBACK_RECOVERY_ACCEPTANCE.md` without dashboard sign-in.
It does not complete operational item 7.

## Fixed scope

The collector uses the existing protected `production` environment credentials
for exactly five Cloudflare GET requests:

1. Exact production D1 metadata; verify UUID and name.
2. `bw-compliance-os` Worker script logging/observability settings.
3. Worker deployment history, with deployment/version UUIDs and traffic splits.
4. D1 Time Travel bookmark availability; the bookmark itself is omitted.
5. `bw-compliance-evidence` R2 bucket metadata; verify the bucket name.

The report excludes account/database IDs, bindings, secrets, raw provider errors,
logging destination identifiers, annotations, recovery bookmarks, tenant data,
log events and object contents. Missing optional logging fields are `null`
(unknown), not evidence that monitoring is configured or that alerts work.
There is no D1 query, export, restore, Worker deployment, R2 object access,
permission change or account configuration mutation. Redirects are rejected.

## Run after review and merge

Dispatch **Production Operations Metadata Evidence** from `main` with its exact
current 40-character SHA and `READ_ONLY_OPERATIONS_METADATA`. The workflow keeps
the existing production environment protections and fails if main advances
before collection. PRs run credential-free qualification only. There is no push/scheduled trigger, package installation or
credential setup. No staging credential is reused. Existing token permissions
must cover these metadata reads; a permission refusal is not authorization to
broaden access or expose the response body.
Failure diagnostics expose only the fixed request stage, HTTP status and bounded
numeric provider codes, allowing permission/authentication triage without raw errors.

Read the allowlisted job summary. A successful run establishes only the recorded
metadata at that time. The collector SHA identifies the inspection code; Worker
deployment/version IDs must still be linked to sealed release evidence.

Delivered test alerts with a named owner/backup, quota/capacity acceptance,
isolated compatible Worker rollback, D1 production-data restore, R2 sample
recovery, RPO/RTO and independent operational signoff remain required.

API references: [Worker settings and deployments](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/),
[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/),
and [Cloudflare API](https://developers.cloudflare.com/api/).
