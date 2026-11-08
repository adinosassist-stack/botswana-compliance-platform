# Private Queue live staging inventory — 2026-11-08

This document records **read-only observed configuration**, not a live Queue acceptance result. It does not authorize changes or live messages.

## Cloudflare account and resources

- Account: `ddd23cab31928a4bb3d4998df9b26d1d`
- Queue: `bw-general-ai-private-acceptance-queue`, ID `f22ef664047947afab5d2cedeb4ee534`
- Registered producers: **0**; registered consumers: **1**
- Consumer: `bw-general-ai-private-queue-acceptance`; batch size 1, max concurrency 1, max retries 0
- Consumer staging D1 binding: `PRIVATE_AI_NONCE_DB` → `71e2d394-7dec-4878-bdc8-afe8f73cf541`
- Consumer service binding: `STAGING_AI` → `bw-general-ai-staging`
- Observed Worker flags: `PRIVATE_AI_QUEUE_ACCEPTANCE_ENABLED=false`, `PRIVATE_AI_LEDGER_SCHEMA_QUALIFIED=false`, `PRIVATE_AI_LEDGER_ISOLATION_VERIFIED=false`

## Read-only D1 schema observation

The staging D1 `bw-general-ai-private-queue-nonce-staging` exposes the table:

```sql
CREATE TABLE ai_private_queue_nonce_claims (
 claim_hash TEXT PRIMARY KEY NOT NULL CHECK(length(claim_hash)=64),
 source_sha TEXT NOT NULL CHECK(length(source_sha)=40),
 claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

This schema was observed via a read-only `sqlite_master` query with zero changes. The database also contains the Cloudflare internal `_cf_KV` table. Schema presence does **not** prove isolated credentials, correct atomic behavior under concurrency, or independent reviewer acceptance.

## Open acceptance gates

1. Independent review of resource isolation, staging token scope and exact current source SHA.
2. Protected authorization for a **separate staging-only live test**, including a rollback window.
3. Verified staging-only producer, isolated test message and runtime consumer flags with rollback plan.
4. Live delivery/ack/duplicate/replay/failure/recovery evidence; `max_retries=0` requires explicit terminal failure handling.
5. Confirm consumer returned to inert disabled state and no public routes/production changes.
6. Separate customer-facing General AI production release approval.

**Status: NO-GO for live test or production activation until all relevant independent gates pass.**
