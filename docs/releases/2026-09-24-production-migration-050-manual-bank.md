# Production migration 050 — manual bank subscriptions

This reviewed operator marker authorizes the existing guarded production migration `050_v115_manual_bank_subscriptions.sql`.

Scope:
- create `manual_payment_submissions`;
- create `manual_payment_events`;
- create the reviewed queue, tenant, and event indexes;
- preserve the existing application release and deployment artifact.

The migration runner is idempotent, verifies the reviewed migration blob, captures a Cloudflare D1 Time Travel bookmark before mutation, validates table shape and indexes, and runs `PRAGMA foreign_key_check` after application.

Authority: merge this PR with `[migrate-050]` in the exact main merge commit message. No Wrangler application deployment is authorized by this marker.

Retry authority: the first production workflow run for this reviewed migration was cancelled before a migration job was created. A subsequent merge carrying `[migrate-050]` reauthorizes the same idempotent migration and no application deployment.
