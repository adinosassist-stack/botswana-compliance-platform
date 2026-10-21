/**
 * Cloudflare D1 workflow configuration adapter.
 * Unlike the Node/Postgres adapter, this matches the production Worker DB API.
 * Requires an independently applied D1 schema migration before activation.
 */
export function createEmployeeWorkflowD1Store(db) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("invalid_d1");
  return {
    async saveOwned({ tenantId, ownerId, workflow }) {
      if (![tenantId, ownerId, workflow?.id].every(x => typeof x === "string" && x.trim())) throw new TypeError("invalid_scope");
      const result = await db.prepare(
        `INSERT INTO employee_ai_workflows (tenant_id,owner_id,workflow_id,definition)
         VALUES (?,?,?,?)
         ON CONFLICT(tenant_id,owner_id,workflow_id)
         DO UPDATE SET definition=excluded.definition,updated_at=CURRENT_TIMESTAMP`
      ).bind(tenantId,ownerId,workflow.id,JSON.stringify(workflow)).run();
      return result?.success === true;
    },
    async listOwned({ tenantId, ownerId }) {
      if (![tenantId, ownerId].every(x => typeof x === "string" && x.trim())) throw new TypeError("invalid_scope");
      const result = await db.prepare(
        `SELECT tenant_id,owner_id,definition FROM employee_ai_workflows
         WHERE tenant_id=? AND owner_id=? ORDER BY updated_at DESC LIMIT 100`
      ).bind(tenantId,ownerId).all();
      if (!result?.success || !Array.isArray(result.results)) throw new Error("d1_query_failed");
      return result.results.map(row => ({
        tenantId: row.tenant_id, ownerId: row.owner_id, workflow: JSON.parse(row.definition)
      }));
    }
  };
}
