// Reference SQLite-compatible adapter for an explicitly transactional connection.
// Not wired to production. The caller MUST provide a connection with BEGIN
// IMMEDIATE / COMMIT / ROLLBACK semantics and exclusive ownership per transaction.
export function createSqliteAgentBudgetAdapter(connection) {
 if(!connection||typeof connection.exec!=="function"||typeof connection.prepare!=="function") throw new TypeError("SQLite connection required");
 let tail=Promise.resolve();
 async function executeTransaction(fn) {
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
 return {
  transaction(fn) {
   if(typeof fn!=="function") return Promise.reject(new TypeError("transaction callback required"));
   const current=tail.then(()=>executeTransaction(fn));
   tail=current.then(()=>undefined,()=>undefined);
   return current;
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
// Transactions through this adapter are serialized per connection. The caller
// must exclusively own the connection; direct external queries are not serialized.
// Real multi-connection staging race tests are mandatory before use.
