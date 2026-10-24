-- TENANT ROLE ISOLATION REFERENCE (CI-ONLY). NOT A MIGRATION.
-- Requires all employee-dispatch PostgreSQL drafts, including the
-- deny-default RLS preview and grant activation draft, loaded beforehand.
-- These are two disposable test-only roles, not a production deployment model.
--
-- The role-to-tenant binding is owned by the database bootstrap role and
-- cannot be written by a tenant role. RLS checks current_user (authenticated
-- DB role), NEVER a writable custom setting such as app.tenant_id.
-- Production requires trusted DB principal provisioning/pooling, UUID schema
-- reconciliation, cross-tenant authorization proof, audited migrations and
-- separate independently reviewed release gates.
create role employee_dispatch_ci_tenant_a nologin noinherit nobypassrls;
create role employee_dispatch_ci_tenant_b nologin noinherit nobypassrls;

create table employee_dispatch_ci_role_tenants (
  role_name name primary key check (
    role_name in ('employee_dispatch_ci_tenant_a','employee_dispatch_ci_tenant_b')
  ),
  tenant_id uuid not null unique references tenants(id)
);

alter table employee_dispatch_ci_role_tenants enable row level security;
revoke all on employee_dispatch_ci_role_tenants from public;
grant select on employee_dispatch_ci_role_tenants
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b;
create policy employee_dispatch_ci_role_tenants_self
  on employee_dispatch_ci_role_tenants
  for select
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b
  using (role_name = current_user::name);

-- There are intentionally no INSERT/UPDATE/DELETE/TRUNCATE privileges on
-- any dispatch table or on the binding table for either tenant role.
grant select on employee_dispatch_proposal_versions
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b;
create policy ed_proposal_versions_tenant_select
  on employee_dispatch_proposal_versions
  for select
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b
  using (
    tenant_id = (
      select t.tenant_id::text
      from employee_dispatch_ci_role_tenants t
      where t.role_name = current_user::name
    )
  );

grant select on employee_dispatch_proposal_heads
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b;
create policy ed_proposal_heads_tenant_select
  on employee_dispatch_proposal_heads
  for select
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b
  using (
    tenant_id = (
      select t.tenant_id::text
      from employee_dispatch_ci_role_tenants t
      where t.role_name = current_user::name
    )
  );

grant select on employee_dispatch_proposal_reviews
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b;
create policy ed_proposal_reviews_tenant_select
  on employee_dispatch_proposal_reviews
  for select
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b
  using (
    tenant_id = (
      select t.tenant_id::text
      from employee_dispatch_ci_role_tenants t
      where t.role_name = current_user::name
    )
  );

grant select on employee_dispatch_reviewer_permission_grants
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b;
create policy ed_reviewer_permission_grants_tenant_select
  on employee_dispatch_reviewer_permission_grants
  for select
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b
  using (
    tenant_id = (
      select t.tenant_id
      from employee_dispatch_ci_role_tenants t
      where t.role_name = current_user::name
    )
  );

grant select on employee_dispatch_grant_issuance_audit
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b;
create policy ed_grant_issuance_audit_tenant_select
  on employee_dispatch_grant_issuance_audit
  for select
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b
  using (
    tenant_id = (
      select t.tenant_id
      from employee_dispatch_ci_role_tenants t
      where t.role_name = current_user::name
    )
  );

grant select on employee_dispatch_review_session_provenance
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b;
create policy ed_review_session_provenance_tenant_select
  on employee_dispatch_review_session_provenance
  for select
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b
  using (
    tenant_id = (
      select t.tenant_id::text
      from employee_dispatch_ci_role_tenants t
      where t.role_name = current_user::name
    )
  );

grant select on employee_dispatch_intents
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b;
create policy ed_intents_tenant_select
  on employee_dispatch_intents
  for select
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b
  using (
    tenant_id = (
      select t.tenant_id::text
      from employee_dispatch_ci_role_tenants t
      where t.role_name = current_user::name
    )
  );

grant select on employee_dispatch_admission_audit
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b;
create policy ed_admission_audit_tenant_select
  on employee_dispatch_admission_audit
  for select
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b
  using (
    tenant_id = (
      select t.tenant_id::text
      from employee_dispatch_ci_role_tenants t
      where t.role_name = current_user::name
    )
  );

grant select on employee_dispatch_grant_activation_audit
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b;
create policy ed_grant_activation_audit_tenant_select
  on employee_dispatch_grant_activation_audit
  for select
  to employee_dispatch_ci_tenant_a, employee_dispatch_ci_tenant_b
  using (
    tenant_id = (
      select t.tenant_id
      from employee_dispatch_ci_role_tenants t
      where t.role_name = current_user::name
    )
  );

-- PREVIEW ROLE CHECK: employee_dispatch_preview_reader is NOT included in
-- either policy, so it remains default-denied. The tenant roles are
-- deliberately NOLOGIN until the disposable CI test provisions random,
-- short-lived passwords and verifies real separate login sessions.
-- Privileged PostgreSQL owners/superusers can bypass this reference;
-- never run the application as an owner, superuser or BYPASSRLS principal.
