/**
 * PostgreSQL adapter for employee-owned workflow definitions.
 * Requires a separately reviewed migration:
 *
 * CREATE TABLE employee_ai_workflows (
 *   tenant_id text NOT NULL,
 *   owner_id text NOT NULL,
 *   workflow_id text NOT NULL,
 *   definition jsonb NOT NULL,
 *   updated_at timestamptz NOT NULL DEFAULT now(),
 *   PRIMARY KEY (tenant_id, owner_id, workflow_id)
 * );
 *
 * The database role must be restricted to the expected tenant-scoped operations.
 * No schema changes are applied by this module.
 */
export function createEmployeeWorkflowPostgresStore(pool) {
  if (!pool || typeof pool.query !== "function") throw new TypeError("invalid_pool");
  return {
    async saveOwned({ tenantId, ownerId, workflow }) {
      if (![tenantId, ownerId, workflow?.id].every(value => typeof value === "string" && value.trim())) throw new TypeError("invalid_scope");
      const result = await pool.query(
        `insert into employee_ai_workflows (tenant_id,owner_id,workflow_id,definition)
         values ($1,$2,$3,$4::jsonb)
         on conflict (tenant_id,owner_id,workflow_id)
         do update set definition=excluded.definition,updated_at=now()
         returning workflow_id`,
        [tenantId, ownerId, workflow.id, JSON.stringify(workflow)]
      );
      return result.rowCount === 1;
    },
    async listOwned({ tenantId, ownerId }) {
      if (![tenantId, ownerId].every(value => typeof value === "string" && value.trim())) throw new TypeError("invalid_scope");
      const result = await pool.query(
        `select tenant_id,owner_id,definition
         from employee_ai_workflows
         where tenant_id=$1 and owner_id=$2
         order by updated_at desc limit 100`,
        [tenantId, ownerId]
      );
      return result.rows.map(row => ({
        tenantId: row.tenant_id, ownerId: row.owner_id, workflow: row.definition
      }));
    }
  };
}
