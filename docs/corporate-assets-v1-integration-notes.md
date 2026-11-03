# Corporate Assets integration boundaries

This branch contains isolated, framework-neutral modules. No production routes are registered and no database migrations are authorized.

## Required server wiring
- Resolve the company and user from a trusted session, never from request JSON, URL or query parameters.
- Apply the existing session authorization and rate limiting before invoking `createAssetsListsHttp`.
- Supply an authorized PostgreSQL query adapter with per-tenant RLS context; a service-role connection that bypasses RLS is not acceptable.
- Register only GET routes `/api/assets`, `/api/assets/maintenance`, `/api/assets/insurance` behind the default-off feature flag.
- Return JSON response bodies and headers unchanged, including `cache-control: no-store`.
- Enable the three panels only when authenticated, tenant-authorized, and feature-enabled.
- Never claim live functionality based on the UI mock or unit test fixtures.
- Do not connect write operations before CSRF, actor permissions, transaction-scoped RLS, audit immutability and staging checks are complete.

## Known compatibility details
- Proposed asset table uses `asset_name`, `asset_category`, `assigned_branch`, `current_book_value_bwp`.
- Maintenance uses `asset_maintenance_logs.service_date` and `cost_bwp`.
- Insurance uses `asset_insurance_policies.insurer` and `coverage_end`.
- PostgreSQL NUMERIC values are returned as strings by some drivers and mapped to numbers by the readers.
- The audit-events schema remains a review-only proposal with forced RLS and no permissive policies.
