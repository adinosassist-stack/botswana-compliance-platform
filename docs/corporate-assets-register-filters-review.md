# Corporate Assets register filters — review-only extension

The existing `listAssetRegister` reader supports optional exact-match `filters` for `category`, `branch`, and `status`, with a bounded limit (1–100). Existing calls with no filters retain the original SQL shape and return format. The authenticated host must derive `context.companyId` from the server session; this module never trusts a client tenant ID.

## Security properties
- The tenant condition `company_id=$1` is compulsory, including filtered queries.
- Field names come only from the code-owned allowlist; user values are PostgreSQL bound parameters, never SQL fragments.
- Unknown filter keys, non-string values, leading/trailing whitespace, controls, and lengths above 80 are rejected before database access.
- Read only: no mutations, database migrations, route activation, deployment, or client input plumbing are included.

## Operator review
Run `node --test tests/corporate-assets-register-filters.test.mjs tests/corporate-assets-list-readers.test.mjs` and the repository-required checks. Before enabling the corporate assets feature, independently qualify tenant RLS, authenticated HTTP admission and rate limits, staged schema and permission grants, mobile UI, and cross-tenant test coverage.

This change does **not** enable Corporate Assets or resolve Thebe Desk's blocked production launch and protected recovery qualifications.
