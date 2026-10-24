-- DESIGN DRAFT ONLY. NOT A MIGRATION. NEVER APPLY TO PRODUCTION.
-- Requires db/schema.sql and employee-dispatch-proposal-review-postgres.sql
-- in an isolated disposable PostgreSQL database.
--
-- A membership role is not the same as people.workflow.approve permission.
-- This explicit, deny-by-default grant is permission EVIDENCE ONLY.
-- No trusted grant issuer/writer, RLS, application permission policy or
-- authenticated reviewer provenance is implemented by this draft.
create table employee_dispatch_reviewer_permission_grants (
  tenant_id uuid not null,
  reviewer_user_id uuid not null,
  permission text not null check (permission = 'people.workflow.approve'),
  enabled boolean not null default false,
  granted_by_user_id uuid not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (tenant_id, reviewer_user_id, permission),
  foreign key (tenant_id, reviewer_user_id)
    references memberships (tenant_id, user_id),
  foreign key (tenant_id, granted_by_user_id)
    references memberships (tenant_id, user_id),
  check (not enabled or revoked_at is null)
);
create index employee_dispatch_reviewer_permission_active_idx
  on employee_dispatch_reviewer_permission_grants (tenant_id, reviewer_user_id)
  where enabled = true and revoked_at is null;

-- This table MUST NOT become the source of production permission grants until
-- a separately reviewed authenticated, tenant-scoped issuer workflow, revocation
-- auditing, least-privilege DB grants and row-level security are enforced.
-- The related read-only probe intentionally does not implement
-- isAuthorizedReviewer and cannot be plugged into the dispatch queue.
