-- EMPLOYEE REVIEWER AUTHORIZATION BATCH — DESIGN / DISPOSABLE CI ONLY.
-- NOT a migration. Never apply to production. There is no API or worker here.
-- Requires db/schema.sql, reviewer-permission draft, and its authenticated
-- grant-issuance audit draft. This adds a second-person, session-bound
-- activation of an existing DISABLED grant. The grant issuer cannot activate.
create table employee_dispatch_grant_activation_audit (
  event_id uuid primary key,
  tenant_id uuid not null,
  reviewer_user_id uuid not null,
  permission text not null check (permission='people.workflow.approve'),
  activated_by_user_id uuid not null,
  activation_session_id uuid not null references sessions(id),
  event_type text not null check (event_type='employee.reviewer_grant.activated'),
  recorded_at timestamptz not null default now(),
  unique (tenant_id, reviewer_user_id, permission),
  foreign key (tenant_id, reviewer_user_id, permission)
    references employee_dispatch_reviewer_permission_grants
      (tenant_id, reviewer_user_id, permission),
  foreign key (tenant_id, activated_by_user_id)
    references memberships (tenant_id, user_id),
  check (activated_by_user_id <> reviewer_user_id)
);

-- Check canonical, still-current session and separate issuer/activator roles.
-- The lock prevents membership/session revocation racing an audit insert.
create function employee_dispatch_verify_activation_audit()
returns trigger language plpgsql as $employee_activation$
declare
  qualified boolean;
begin
  select true into qualified
    from employee_dispatch_reviewer_permission_grants g
    join memberships issuer
      on issuer.tenant_id=g.tenant_id and issuer.user_id=g.granted_by_user_id
    join memberships reviewer
      on reviewer.tenant_id=g.tenant_id and reviewer.user_id=g.reviewer_user_id
    join sessions s on s.id=new.activation_session_id
    join users u on u.id=s.user_id
    join memberships activator
      on activator.tenant_id=s.tenant_id and activator.user_id=s.user_id
   where g.tenant_id=new.tenant_id and g.reviewer_user_id=new.reviewer_user_id
     and g.permission=new.permission
     and g.enabled=false and g.revoked_at is null
     and issuer.status='active' and issuer.role='owner'
     and reviewer.status='active'
     and activator.status='active' and activator.role='owner'
     and activator.user_id<>g.granted_by_user_id
     and activator.user_id<>g.reviewer_user_id
     and s.user_id=new.activated_by_user_id
     and s.tenant_id=new.tenant_id
     and s.revoked_at is null and s.expires_at>now()
     and s.session_generation=u.session_generation
   for share of g,issuer,reviewer,s,u,activator;
  if qualified is distinct from true then
    raise exception 'unverified_reviewer_grant_activation' using errcode='23514';
  end if;
  return new;
end;
$employee_activation$;
create trigger employee_dispatch_activation_audit_guard
  before insert on employee_dispatch_grant_activation_audit
  for each row execute function employee_dispatch_verify_activation_audit();

-- Direct UPDATE enabled=true without matching same-grant activation evidence
-- cannot commit, even if a caller bypasses the draft Node service.
create function employee_dispatch_require_grant_activation_audit()
returns trigger language plpgsql as $employee_activation$
begin
  if not exists (
    select 1 from employee_dispatch_grant_activation_audit a
     where a.tenant_id=new.tenant_id
       and a.reviewer_user_id=new.reviewer_user_id
       and a.permission=new.permission
       and a.event_type='employee.reviewer_grant.activated'
  ) then
    raise exception 'employee_reviewer_activation_audit_required'
      using errcode='23514';
  end if;
  return null;
end;
$employee_activation$;
create constraint trigger employee_dispatch_activation_audit_required
  after update on employee_dispatch_reviewer_permission_grants
  deferrable initially deferred
  for each row
  when (new.enabled=true and old.enabled=false)
  execute function employee_dispatch_require_grant_activation_audit();

-- No temporary disable/reactivate loophole: disabling an enabled grant
-- requires terminal revocation, already irreversible in the base draft.
create function employee_dispatch_no_silent_grant_downgrade()
returns trigger language plpgsql as $employee_activation$
begin
  if old.enabled=true and new.enabled=false and new.revoked_at is null then
    raise exception 'active_reviewer_grant_requires_revocation'
      using errcode='23514';
  end if;
  return new;
end;
$employee_activation$;
create trigger employee_dispatch_grant_downgrade_guard
  before update on employee_dispatch_reviewer_permission_grants
  for each row execute function employee_dispatch_no_silent_grant_downgrade();

create function employee_dispatch_activation_audit_immutable()
returns trigger language plpgsql as $employee_activation$
begin
  raise exception 'employee_grant_activation_audit_immutable' using errcode='23514';
end;
$employee_activation$;
create trigger employee_dispatch_activation_audit_no_mutation
  before update or delete on employee_dispatch_grant_activation_audit
  for each row execute function employee_dispatch_activation_audit_immutable();

-- LIMITATIONS: This does NOT authenticate the SQL caller against the session
-- that is named by an audit row; a sufficiently privileged database writer
-- could forge session references. Least privilege, trusted application identity,
-- audited migration, RLS and execution kill switch still bar production use.
