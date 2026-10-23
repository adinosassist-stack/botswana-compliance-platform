# Employee dispatcher: Cloudflare D1 integration gate

Status: **NOT IMPLEMENTED — execution OFF**. Companion to issue #1716 and `docs/employee-workflow-dispatcher-contract.md`.

## Verified repository state
- `cloudflare/src/employee-workflow-d1-store.js` implements owner-scoped workflow definition save/list, **not** dispatch.
- `db/drafts/employee-dispatch-outbox.sql` is a nonproduction SQLite reference and **not** an applied Cloudflare D1 migration.
- Existing admission, queue and worker-policy functions are policy/reference layers, not an authenticated Worker execution endpoint.
- Successful reference-adapter tests do not demonstrate D1 atomicity, deployed migration state or side-effect idempotency.

## Minimum implementation sequence
1. Inventory applied D1 migrations, production schema, People approval persistence, internal task/report schemas, and Worker route registration. Confirm backup/rollback path before drafting a migration.
2. Design immutable proposal revision and review provenance in trusted D1 tables. Enforce tenant scope and independent reviewer authority. Bind latest unrevoked approval to exact revision.
3. Add a reviewed forward-only migration for tenant-scoped dispatch intents, immutable audit events, unique idempotency, leases, bounded attempts and dead-letter state. Test upgrading existing databases, not only empty schemas.
4. Implement D1-compatible **atomic admission**: persisted review/revision authorization, intent creation and audit must succeed or fail together. Do not port Node/Postgres transaction callbacks to D1 without proving equivalent semantics.
5. Implement fenced worker execution for **internal.task.create** and **internal.report.draft** only. Internal effect, completion and audit must commit atomically with the current lease token. Revalidate policy immediately before committing.
6. Require explicit trusted booleans `featureEnabled === true`, `killSwitch === false`, `auditAvailable === true`; missing or malformed inputs deny. Default OFF in every environment.
7. Test tenant replay, stale/revoked approval, duplicate key conflicts, audit rollback, concurrent claims, expired lease fencing, crash/retry, max attempts, recovery and unauthorized Worker calls against a migrated D1-compatible database.
8. Independent review, exact-head CI, migration backup/restore evidence, staging authentication and authorization smoke tests, owner-authorized release qualification.

## Explicit exclusions
Payroll, money movement, financial posting, external messaging, regulatory filings, deletion and permission changes. Do not wire the reference dispatcher into a production route or schedule unattended jobs as part of qualification.

## Hold conditions
Any unverified production schema, missing reviewer provenance, unavailable atomic commit, ambiguous feature flag, failed audit insertion, unfenced side effect, or absent rollback evidence blocks activation.

## Identity binding discovery (23 October 2026)
The immutable employee proposal uses a JSON-array proposal_key, whereas the reference dispatch admission accepts only bounded ASCII proposal IDs. Production integration must retain the original tenant-scoped proposal key and revision hashes in trusted D1 storage, while using a distinct server-generated bounded dispatch ID. Do not weaken admission validation or interpret employee review approval as task execution authorization. The existing task preparation still requires a separate owner decision. Confirm this mapping in D1 integration tests before any adapter wiring.
