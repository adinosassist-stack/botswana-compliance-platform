# Owner financial analytics — missing-evidence handling

This review-only batch hardens existing Owner Command Centre Analytics v1 without adding another dashboard.

The three top financial signals (30-day cash movement, overdue collections, 14-day supplier commitments) now display **Unavailable** when their essential numeric minor-unit fields are absent, malformed or non-integer. They do not claim zero cash movement, zero overdue invoices, healthy liquidity or adequate supplier coverage from missing evidence. The compact cash pulse displays a dash when unverified.

Valid zero minor-unit amounts remain valid values. Existing asset, sales, compliance, property and analysis panels are unchanged. Cash movement is never described as accounting profit. The business-context server remains authoritative and there is no model-generated accounting assertion.

Read-only UI only. No finance API, reconciliation execution, bank verification, money movement, subscription activation, schema migration, Cloudflare credentials or production deployment.

Review `node --test tests/owner-finance-evidence-clarity.test.mjs` and repository-required CI. Require independent `thusico` approval and requalification against exact-head source before protected merge. This does not close the backup/restore launch gate.
