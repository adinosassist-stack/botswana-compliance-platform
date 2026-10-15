-- Additional integrity constraints for governance approvals.
-- Separate migration so existing deployments can apply incrementally.
create unique index if not exists agent_approvals_tenant_nonce_unique
  on agent_action_approvals(tenant_id, nonce);
alter table agent_action_approvals
  add constraint agent_approval_consumed_only_if_approved
  check (consumed_at is null or status = 'approved');
create index if not exists agent_action_audit_approval_idx
  on agent_action_audit(approval_id) where approval_id is not null;
