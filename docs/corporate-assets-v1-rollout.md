# Corporate Assets V1 — guarded schema batch

Status: **code-only, not deployed**. The additive PostgreSQL migration is `db/migrations/20261101_corporate_assets_v1.sql`.

## Coverage
Company-scoped asset register (fleet, IT hardware, machinery, office furniture, other), branch and custodian details, monetary acquisition/book values in BWP, maintenance events, insurance policies and expiry indexes. Child records reference the composite `(company_id,id)` parent key to prevent cross-company linking. Serial numbers are unique per company when present.

## Security and deployment boundary
The migration enables and forces row-level security, revokes public privileges, and deliberately defines **no permissive policies**. The tables therefore fail closed until a separately reviewed authenticated tenant-context design and app-role grants are implemented. Database owners and superusers still need separate access controls; never use privileged DB connections for tenant traffic. Add audited services, authorization policies, input validation, authenticated API routes, tests for cross-tenant data access, and migration/rollback qualification before launch.

This is **PostgreSQL SQL**, not Cloudflare D1 syntax. Do not execute against production `bw-compliance-os`; first determine which configured PostgreSQL environment owns `companies(id UUID)` and rehearse on isolated staging. Ensure the existing table's key type and schema match, and inspect migrations for collisions.

## Finance
15% annual depreciation is a configurable placeholder assumption, **not** a Botswana statutory tax allowance. No automatic journal entries or book-value recalculation are performed. Accounting depreciation and tax treatment require their own approved effective-dated policies.

## Qualification
`node --test tests/corporate-assets-v1-static.test.mjs` checks schema boundaries. A PostgreSQL migration execution test plus real app-role RLS tests must be added before approval for staging activation.
