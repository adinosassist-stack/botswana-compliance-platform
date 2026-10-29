// Reference SQLite-compatible adapter for an explicitly transactional connection.
// Not wired to production. The caller MUST provide a connection with BEGIN
// IMMEDIATE / COMMIT / ROLLBACK semantics and exclusive ownership per transaction.
export function createSqliteAgentBudgetAdapter(connection) {
 if(!connection||typeof connection.exec!=="function"||typeof connection.prepare!=="function") throw new TypeError("SQLite connection required");
 return {
  async transaction(fn) {
   connection.exec("BEGIN IMMEDIATE");
   let committed=false;
   try {
    const tx={
     get:async(sql,params)=>connection.prepare(sql).get(...params),
     run:async(sql,params)=>{
      const result=connection.prepare(sql).run(...params);
      return {changes:result.changes};
     },
     appendAudit:async event=>{
      connection.prepare("INSERT INTO agent_audit_event (tenant_id,agent_id,actor_id,request_id,event_type,occurred_at,details_json,digest) VALUES (?,?,?,?,?,?,?,?)")
       .run(event.tenantId,event.agentId,event.actorId,event.requestId,event.type,event.occurredAt,JSON.stringify(event.details),event.digest);
     }
    };
    const result=await fn(tx);
    connection.exec("COMMIT");
    committed=true;
    return result;
   } finally {
    if(!committed) connection.exec("ROLLBACK");
   }
  }
 };
}
export const agentAuditSchema=`
CREATE TABLE IF NOT EXISTS agent_audit_event (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 tenant_id TEXT NOT NULL, agent_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, request_id TEXT NOT NULL,
 event_type TEXT NOT NULL, occurred_at TEXT NOT NULL,
 details_json TEXT NOT NULL, digest TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_audit_tenant_time
 ON agent_audit_event(tenant_id,occurred_at);
`;
// IMPORTANT: connection must not be shared with other async operations during
// the transaction callback. Real staging race tests are mandatory before use.
