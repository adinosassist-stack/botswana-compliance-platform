-- Prevent inconsistent lease state before any worker is enabled.
do $governance$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_outbox_lease_state_valid'
      and conrelid = 'agent_action_outbox'::regclass
  ) then
    alter table agent_action_outbox
      add constraint agent_outbox_lease_state_valid
      check ((status = 'leased' and leased_until is not null)
         or (status <> 'leased' and leased_until is null));
  end if;
end $governance$;
