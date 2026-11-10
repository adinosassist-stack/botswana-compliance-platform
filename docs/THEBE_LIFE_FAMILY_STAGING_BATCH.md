# Family staging qualification — isolated synthetic-only, not applied

This consolidated batch carries the passing in-memory SQLite isolation suite from superseded PR #2312 and a numbered D1 **candidate** schema at `cloudflare/migrations/life-staging/0001_initial.sql`. The candidate is compared byte-for-byte in SQLite schema semantics with the existing reviewed proposal, with tests for six Life tables and index structures.

**Do not apply migrations from this PR.** It is a review and CI qualification package only. The isolated `bw-life-staging` D1 database ID is `fa58bcb8-5871-4272-b3e8-c8cc2548dcd2`. Cloudflare database inspection showed no Life tables at baseline. No customer data is authorized.

After protected merge and independent `thusico` approval, take a baseline database bookmark/export, confirm actual account and D1 UUID, verify no public Worker routes or `workers.dev` exposure, separately authorize staging-only migration execution, and run synthetic D1 tests. Never use production, billing or POP bindings, secrets or databases.

No automatic migration workflow, Worker deployment, real-money transaction, user invitation, insurance processing, or public route is introduced here. Success in Node SQLite does not by itself qualify Cloudflare D1 runtime or tenant isolation.
