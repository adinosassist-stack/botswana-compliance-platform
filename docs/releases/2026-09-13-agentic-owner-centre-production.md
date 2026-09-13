# Governed agentic Owner Command Centre production release

Deployment-only marker for the reviewed Stage 1 agentic Owner Command Centre UI.

Promoted behavior:
- View governed agent plans and persisted recommendations in the existing Owner Command Centre.
- Generate a new bounded plan from current tenant-scoped workspace signals.
- Show confidence, generation mode, risk, authority, status and source references.
- Owner may record approval; owner or manager may reject.

Safety boundary remains unchanged:
- Approval records intent only and performs no execution.
- No `/api/agentic/execute` route exists.
- Payments, transfers, payroll changes, legal filings/signatures, authoritative journal mutation and employment termination remain outside autonomous authority.
- Production schema remains `045_v80_agentic_foundation.sql`; this release has no database migration.
