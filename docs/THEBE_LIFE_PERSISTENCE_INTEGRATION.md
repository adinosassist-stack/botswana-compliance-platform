# Thebe Life / bounded persistence integration

Status: offline code only, not a production route or deployed migration.

1. Use only server-side authenticated session user ID for `sessionUserId`. Never accept a user ID from query strings, JSON, cookies containing unsigned assertions, client Life flags, or HTML attributes.
2. Obtain the current Life entitlement through a verified backend authorization service before invoking the read or write adapters.
3. D1 reader authorizes membership before querying and scopes every ledger SELECT to the household. D1 writer additionally places the active owner/adult membership predicate inside the INSERT statement to avoid membership check/write time-of-check/time-of-use gaps.
4. Deduplicate retries by client-generated entry ID under the household composite primary key. A collision is **not** proof the same event was created; never return success on `changes:0`.
5. Transfers are classified separately from external income and spending. No payout, bank transfer or reconciliation is enabled.
6. Before activation, validate D1 query-plan performance, upgrade/migration rollback, rate limits, CSRF and Origin, session expiry, data retention, multi-member visibility, audit trails and cross-household access.
7. Implement a **separate** authenticated HTTP boundary; do not directly expose these internal modules to browsers or mount navigation based on client authorization booleans.
8. Proposed schema `docs/sql/thebe-life-d1-proposal.sql` is not a runnable production migration. Production database schema and migration lineage must be reviewed independently.
9. Tests: `node --test tests/thebe-life-d1-reader.test.mjs tests/thebe-life-d1-writer.test.mjs tests/thebe-life-workspace-adapter-static.test.mjs`.
