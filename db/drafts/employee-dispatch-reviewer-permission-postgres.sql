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
-- INSERT must start disabled and identify a distinct active tenant owner
-- as the recorded issuer. This validates database evidence but DOES NOT
-- authenticate the SQL caller or authorize a production grant writer.
create function employee_dispatch_guard_grant_insert()
returns trigger language plpgsql as $employee_permission$
declare
  valid_issuer boolean;
begin
  if new.enabled or new.revoked_at is not null or
     new.granted_by_user_id = new.reviewer_user_id then
    raise exception 'invalid_reviewer_grant_issuance' using errcode='23514';
  end if;
  select true into valid_issuer
    from memberships issuer
    join memberships reviewer
      on reviewer.tenant_id=issuer.tenant_id
     and reviewer.user_id=new.reviewer_user_id
   where issuer.tenant_id=new.tenant_id
     and issuer.user_id=new.granted_by_user_id
     and issuer.status='active' and issuer.role='owner'
     and reviewer.status='active'
   for share of issuer, reviewer;
  if valid_issuer is distinct from true then
    raise exception 'inactive_or_untrusted_grant_issuer' using errcode='23514';
  end if;
  return new;
end;
$employee_permission$;
create trigger employee_dispatch_reviewer_grant_insert_guard
  before insert on employee_dispatch_reviewer_permission_grants
  for each row execute function employee_dispatch_guard_grant_insert();

-- Hard-deleting grants would conceal recorded revocation and issuer lineage.
create function employee_dispatch_reject_grant_delete()
returns trigger language plpgsql as $employee_permission$
begin
  raise exception 'reviewer_permission_grant_immutable_history' using errcode='23514';
end;
$employee_permission$;
create trigger employee_dispatch_reviewer_grant_delete_guard
  before delete on employee_dispatch_reviewer_permission_grants
  for each row execute function employee_dispatch_reject_grant_delete();

-- Revocation is terminal: a revoked grant cannot be silently reenabled.
-- The grant identity and recorded issuer are immutable after creation.
create function employee_dispatch_guard_grant_update()
returns trigger language plpgsql as $employee_permission$
begin
  if old.revoked_at is not null then
    raise exception 'reviewer_permission_revocation_is_final' using errcode='23514';
  end if;
  if row(new.tenant_id,new.reviewer_user_id,new.permission,
         new.granted_by_user_id,new.granted_at)
     is distinct from
     row(old.tenant_id,old.reviewer_user_id,old.permission,
         old.granted_by_user_id,old.granted_at) then
    raise exception 'reviewer_permission_identity_immutable' using errcode='23514';
  end if;
  if new.revoked_at is not null and new.enabled then
    raise exception 'revoked_reviewer_permission_cannot_be_enabled'
      using errcode='23514';
  end if;
  return new;
end;
$employee_permission$;
create trigger employee_dispatch_reviewer_grant_update_guard
  before update on employee_dispatch_reviewer_permission_grants
  for each row execute function employee_dispatch_guard_grant_update();

create index employee_dispatch_reviewer_permission_active_idx
  on employee_dispatch_reviewer_permission_grants (tenant_id, reviewer_user_id)
  where enabled = true and revoked_at is null;

-- This table MUST NOT become the source of production permission grants until
-- a separately reviewed authenticated, tenant-scoped issuer workflow, revocation
-- auditing, least-privilege DB grants and row-level security are enforced.
-- The related read-only probe intentionally does not implement
-- isAuthorizedReviewer and cannot be plugged into the dispatch queue.
