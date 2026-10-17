-- Defense in depth: no sensitive execution intents may enter the database
-- even if application-level allowlist checks are accidentally bypassed.
do $governance$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_outbox_draft_actions_only'
      and conrelid = 'agent_action_outbox'::regclass
  ) then
    alter table agent_action_outbox
      add constraint agent_outbox_draft_actions_only
      check (action in ('invoice.draft', 'compliance.reminder.draft', 'reconciliation.suggest'));
  end if;
end $governance$;
