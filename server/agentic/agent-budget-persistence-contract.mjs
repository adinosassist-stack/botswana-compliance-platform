// Read-only SQL descriptors for durable agent budget reservations.
// These statements are reference implementation only; no migration is applied.
// The production adapter MUST execute reserve and ledger insert in one transaction.
export const agentBudgetSchema = `
CREATE TABLE IF NOT EXISTS agent_budget_policy (
 tenant_id TEXT NOT NULL, agent_id TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0, stopped INTEGER NOT NULL DEFAULT 1,
 budget_minor INTEGER NOT NULL CHECK (budget_minor >= 0),
 spent_minor INTEGER NOT NULL DEFAULT 0 CHECK (spent_minor >= 0),
 version INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY (tenant_id, agent_id),
 CHECK (spent_minor <= budget_minor)
);
CREATE TABLE IF NOT EXISTS agent_budget_reservation (
 tenant_id TEXT NOT NULL, agent_id TEXT NOT NULL,
 request_id TEXT NOT NULL, cost_minor INTEGER NOT NULL CHECK (cost_minor >= 0),
 created_at TEXT NOT NULL,
 PRIMARY KEY (tenant_id, agent_id, request_id)
);`;
export function reservationStatements({tenantId,agentId,requestId,costMinor,expectedVersion,createdAt}) {
 if (![tenantId,agentId,requestId,createdAt].every(x=>typeof x==="string"&&x.length>0) ||
     !Number.isSafeInteger(costMinor)||costMinor<0 ||
     !Number.isSafeInteger(expectedVersion)||expectedVersion<0) throw new TypeError("invalid reservation");
 return {
  // First check request_id uniqueness. On duplicate return existing reservation,
  // never charge twice. The adapter must lock/serialize per tenant+agent.
  existing:{sql:"SELECT cost_minor FROM agent_budget_reservation WHERE tenant_id=? AND agent_id=? AND request_id=?",params:[tenantId,agentId,requestId]},
  debit:{sql:"UPDATE agent_budget_policy SET spent_minor=spent_minor+?, version=version+1 WHERE tenant_id=? AND agent_id=? AND version=? AND enabled=1 AND stopped=0 AND spent_minor <= budget_minor-?",params:[costMinor,tenantId,agentId,expectedVersion,costMinor]},
  record:{sql:"INSERT INTO agent_budget_reservation (tenant_id,agent_id,request_id,cost_minor,created_at) VALUES (?,?,?,?,?)",params:[tenantId,agentId,requestId,costMinor,createdAt]}
 };
}
// Never run these descriptors as independent auto-commit statements.
