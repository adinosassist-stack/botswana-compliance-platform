CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_finance_observation_checkpoint_event
ON audit_events(tenant_id,event_type,entity_id)
WHERE entity_type='agent_observation_checkpoint'
  AND event_type IN ('AGENT_FINANCE_OBSERVATION_VERIFIED','AGENT_FINANCE_OBSERVATION_RECOVERED');
