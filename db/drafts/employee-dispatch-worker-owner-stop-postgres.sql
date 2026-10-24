-- DEVELOPMENT / DISPOSABLE CI ONLY. No production operator API or migration.
create table employee_dispatch_worker_owner_stops (
  tenant_id text not null,
  revision bigint not null,
  actor_user_id uuid not null references users(id),
  session_id uuid not null references sessions(id),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id,revision),
  foreign key (tenant_id,revision)
    references employee_dispatch_worker_control_events(tenant_id,revision)
);

create function employee_dispatch_guard_owner_stop_audit()
returns trigger language plpgsql as $stop$
begin
  if not exists (
    select 1 from employee_dispatch_worker_control_events e
      where e.tenant_id=new.tenant_id and e.revision=new.revision
        and e.feature_enabled=false and e.kill_switch=true and e.operator_stop=true
  ) then
    raise exception 'owner_stop_state_mismatch' using errcode='23514';
  end if;
  perform 1 from sessions s
    join users u on u.id=s.user_id
    join memberships m on m.tenant_id=s.tenant_id and m.user_id=s.user_id
    where s.id=new.session_id and s.tenant_id::text=new.tenant_id
      and s.user_id=new.actor_user_id and s.revoked_at is null
      and s.expires_at>clock_timestamp()
      and s.session_generation=u.session_generation
      and m.status='active' and m.role='owner'
    for share of s,u,m;
  if not found then
    raise exception 'owner_stop_authority_unavailable' using errcode='23514';
  end if;
  return new;
end;
$stop$;
create trigger employee_dispatch_owner_stop_audit_guard
  before insert on employee_dispatch_worker_owner_stops
  for each row execute function employee_dispatch_guard_owner_stop_audit();

create trigger employee_dispatch_owner_stop_audit_immutable
  before update or delete on employee_dispatch_worker_owner_stops
  for each row execute function employee_dispatch_reject_worker_control_event_mutation();
alter table employee_dispatch_worker_owner_stops enable row level security;
revoke all on employee_dispatch_worker_owner_stops from public;
revoke all on function employee_dispatch_guard_owner_stop_audit() from public;
-- No tenant/preview writer grants. A known session UUID is not proof of SQL
-- caller identity. Production principal binding and cleanup design remain HOLD.
