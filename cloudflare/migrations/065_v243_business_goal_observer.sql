-- V243: dedicated canonical observer for governed business-goal checks.
-- This migration grants no execution authority and adds no external action capability.
PRAGMA foreign_keys=ON;

INSERT OR IGNORE INTO agent_registry(
  agent_id,canonical_name,actor_type,purpose,risk_tier,authority_state,execution_capable,owner_scope
) VALUES(
  'SYS-BIZ-OBS-001','business_goal_observer','system_observer',
  'Governed read-only business goal observation','low','active',0,'platform'
);

CREATE TRIGGER IF NOT EXISTS trg_business_goal_no_duplicate_insert
BEFORE INSERT ON agent_persistent_tasks
WHEN NEW.status IN ('active','paused')
  AND NEW.trigger_kind='scheduled'
  AND json_valid(NEW.trigger_spec_json)
  AND json_extract(NEW.trigger_spec_json,'$.templateKey') IN (
    'protect_cash','grow_sales','stay_compliant','watch_operations','protect_property','morning_brief'
  )
  AND EXISTS(
    SELECT 1 FROM agent_persistent_tasks t
    WHERE t.tenant_id=NEW.tenant_id
      AND t.status IN ('active','paused')
      AND t.trigger_kind='scheduled'
      AND json_valid(t.trigger_spec_json)
      AND json_extract(t.trigger_spec_json,'$.templateKey')=json_extract(NEW.trigger_spec_json,'$.templateKey')
  )
BEGIN
  SELECT RAISE(ABORT,'duplicate_business_goal');
END;

CREATE TRIGGER IF NOT EXISTS trg_business_goal_no_duplicate_update
BEFORE UPDATE OF tenant_id,status,trigger_kind,trigger_spec_json ON agent_persistent_tasks
WHEN NEW.status IN ('active','paused')
  AND NEW.trigger_kind='scheduled'
  AND json_valid(NEW.trigger_spec_json)
  AND json_extract(NEW.trigger_spec_json,'$.templateKey') IN (
    'protect_cash','grow_sales','stay_compliant','watch_operations','protect_property','morning_brief'
  )
  AND EXISTS(
    SELECT 1 FROM agent_persistent_tasks t
    WHERE t.id<>NEW.id
      AND t.tenant_id=NEW.tenant_id
      AND t.status IN ('active','paused')
      AND t.trigger_kind='scheduled'
      AND json_valid(t.trigger_spec_json)
      AND json_extract(t.trigger_spec_json,'$.templateKey')=json_extract(NEW.trigger_spec_json,'$.templateKey')
  )
BEGIN
  SELECT RAISE(ABORT,'duplicate_business_goal');
END;