# Corporate Assets V1 — non-review execution checklist

Status: development-only. No production database writes or feature activation.

## Existing implementation
- Tenant-scoped PostgreSQL schema, maintenance and insurance records.
- Server service and read-only summary adapter.
- Default-off native Workspace panel.
- Static and unit tests in `tests/corporate-assets-v1-*.test.mjs`.

## Independent qualification before enabling customer traffic
1. Confirm which isolated PostgreSQL staging database contains `companies(id UUID)`; never apply PostgreSQL SQL to Cloudflare D1.
2. Rehearse migration and rollback against a disposable staging copy, capturing schema diff and test output.
3. Test a least-privilege non-owner application role with RLS enforced; deny all cross-tenant read, insert, update and delete attempts, including child records.
4. Add server-resolved tenant identity and authorization checks to each HTTP route; reject client-supplied tenant IDs.
5. Verify CSRF protections on mutations, rate limiting, pagination, validation, and immutable audit events.
6. Exercise asset create/edit/retire, assignment transfers, maintenance scheduling and insurance expiry with isolated fixtures.
7. Confirm no asset data is visible in disabled or unauthenticated Workspaces.
8. Run keyboard, mobile viewport, empty-state and screen-reader tests using the existing Workspace shell and charcoal AI dock.
9. Confirm depreciation is configurable accounting policy, not an asserted Botswana tax allowance.
10. Capture CI results and seek independent review before merge; deployment remains a separate authorized action.

## Acceptance scenarios
| Scenario | Expected |
|---|---|
| Tenant A lists Tenant B assets | Denied / zero disclosure |
| Tenant A links maintenance to Tenant B asset | Denied by composite tenant foreign key |
| Unauthenticated summary request | Denied |
| Feature flag disabled | No asset panel or API exposure |
| Invalid negative cost or future-inconsistent due date | Validation error |
| Insurance approaching expiry | Tenant-only due count |
| Database unavailable | Neutral unavailable state, no fabricated totals |
| Asset transferred between branches | Audited authorized transition |
| Asset written off | Historical record retained, no implicit ledger entry |

Do not mark these scenarios as passing until real test evidence exists.
