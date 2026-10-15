-- Additional integrity constraints for governance approvals.
-- Separate migration so existing deployments can apply incrementally.
create unique index if not exists agent_approvals_tenant_nonce_unique
  on agent_action_approvals(tenant_id, nonce);
do $
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_approval_consumed_only_if_approved'
      and conrelid = 'agent_action_approvals'::regclass
  ) then
    alter table agent_action_approvals
      add constraint agent_approval_consumed_only_if_approved
      check (consumed_at is null or status = 'approved');
  end if;
end $;
create index if not exists agent_action_audit_approval_idx
  on agent_action_audit(approval_id) where approval_id is not null;
