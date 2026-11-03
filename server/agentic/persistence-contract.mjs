// Reference SQL for a future reviewed migration. NOT applied automatically.
// Workflow state and approval digest must be updated in one transaction with the audit event.
export const AGENT_WORKFLOW_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agent_workflows (
 tenant_id TEXT NOT NULL,
 workflow_id TEXT NOT NULL,
 objective TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('draft','validated','awaiting_approval','approved','executing','completed','failed','cancelled')),
 version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
 proposal_digest TEXT,
 approval_actor_id TEXT,
 approval_digest TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (tenant_id,workflow_id)
);
CREATE TABLE IF NOT EXISTS agent_workflow_events (
 event_id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 workflow_id TEXT NOT NULL,
 version INTEGER NOT NULL,
 actor_id TEXT NOT NULL,
 previous_state TEXT,
 next_state TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(tenant_id,workflow_id,version),
 FOREIGN KEY(tenant_id,workflow_id) REFERENCES agent_workflows(tenant_id,workflow_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_workflows_tenant_state ON agent_workflows(tenant_id,state);
CREATE INDEX IF NOT EXISTS idx_agent_events_tenant_workflow ON agent_workflow_events(tenant_id,workflow_id,version);
`;
export function workflowVersionUpdate({tenantId,workflowId,expectedVersion,nextState}={}){
 if(!tenantId||!workflowId||!Number.isSafeInteger(expectedVersion)||expectedVersion<0)throw new Error("INVALID_WORKFLOW_UPDATE");
 const states=["draft","validated","awaiting_approval","approved","executing","completed","failed","cancelled"];
 if(!states.includes(nextState))throw new Error("INVALID_WORKFLOW_STATE");
 return Object.freeze({
  sql:"UPDATE agent_workflows SET state = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND workflow_id = ? AND version = ?",
  params:[nextState,tenantId,workflowId,expectedVersion],
  expectedChanges:1
 });
}
