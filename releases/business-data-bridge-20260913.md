# Business data bridge release marker

Metadata-only release marker for the already-merged business data bridge.

- Feature main SHA: `3cd96568e05a3ce173b19f08977daa96819b68f9`
- Scope: preview-first CSV imports for quotations/opportunities, campaign spend, and owner-only financial scenario assumptions.
- No schema migration.
- No new external credentials.
- No changes to core decision formulas, auth, payments, or employee scoring.

Merge only after Recovery CI passes. The release merge commit should carry the explicit `[deploy]` marker so the exact resulting main SHA is requalified by Recovery CI and BF-07 before Cloudflare production promotion.
