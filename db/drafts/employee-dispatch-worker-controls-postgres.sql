-- DEVELOPMENT / DISPOSABLE CI ONLY. Not a production migration or activation API.
-- No production caller identity or operator authority is established by this draft.
create table employee_dispatch_worker_controls (
  tenant_id text primary key,
  revision bigint not null default 1 check (revision>0),
  feature_enabled boolean not null default false,
  kill_switch boolean not null default true,
  operator_stop boolean not null default true,
  changed_at timestamptz not null default clock_timestamp()
);
create table employee_dispatch_worker_control_events (
  tenant_id text not null references employee_dispatch_worker_controls(tenant_id),
  revision bigint not null check (revision>0),
  feature_enabled boolean not null,
  kill_switch boolean not null,
  operator_stop boolean not null,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id,revision)
);

create function employee_dispatch_guard_worker_controls()
returns trigger language plpgsql as $controls$
begin
  if tg_op='DELETE' then
    raise exception 'worker_controls_cannot_be_deleted' using errcode='23514';
  elsif tg_op='INSERT' then
    if new.revision<>1 or new.feature_enabled is distinct from false
       or new.kill_switch is distinct from true
       or new.operator_stop is distinct from true then
      raise exception 'worker_controls_must_start_disabled' using errcode='23514';
    end if;
  else
    if new.tenant_id<>old.tenant_id or new.revision<>old.revision
       or old.revision=9223372036854775807 then
      raise exception 'worker_control_revision_conflict' using errcode='23514';
    end if;
    new.revision:=old.revision+1;
  end if;
  new.changed_at:=clock_timestamp();
  return new;
end;
$controls$;
create trigger employee_dispatch_worker_controls_guard
  before insert or update or delete on employee_dispatch_worker_controls
  for each row execute function employee_dispatch_guard_worker_controls();

-- Capture state changes in the same transaction. This records state only,
-- not a verified operator identity; production operator authorization is HOLD.
create function employee_dispatch_audit_worker_controls()
returns trigger language plpgsql as $controls$
begin
  insert into employee_dispatch_worker_control_events
    (tenant_id,revision,feature_enabled,kill_switch,operator_stop)
  values (new.tenant_id,new.revision,new.feature_enabled,new.kill_switch,new.operator_stop);
  return null;
end;
$controls$;
create trigger employee_dispatch_worker_controls_audit
  after insert or update on employee_dispatch_worker_controls
  for each row execute function employee_dispatch_audit_worker_controls();

create function employee_dispatch_reject_worker_control_event_mutation()
returns trigger language plpgsql as $controls$
begin
  raise exception 'worker_control_event_immutable' using errcode='23514';
end;
$controls$;
create trigger employee_dispatch_worker_control_events_immutable
  before update or delete on employee_dispatch_worker_control_events
  for each row execute function employee_dispatch_reject_worker_control_event_mutation();

alter table employee_dispatch_worker_controls enable row level security;
alter table employee_dispatch_worker_control_events enable row level security;
revoke all on employee_dispatch_worker_controls,employee_dispatch_worker_control_events from public;
revoke all on function employee_dispatch_guard_worker_controls(),
  employee_dispatch_audit_worker_controls(),
  employee_dispatch_reject_worker_control_event_mutation() from public;
-- No grants to preview or tenant roles. CI uses its disposable database owner.
