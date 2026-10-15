/**
 * PostgreSQL storage adapter for authorizeAgentExecution.
 * The trusted tenantId must come from authenticated server context, never the model.
 * The caller must execute the protected action separately after authorization.
 */
export function createPostgresAgentApprovalStore(pool, tenantId) {
  if (!pool || typeof pool.connect !== "function" || typeof tenantId !== "string" || !tenantId.trim()) throw Error("invalid_agent_store_context");
  return {
    async transaction(fn) {
      if (typeof fn !== "function") throw Error("invalid_agent_transaction");
      const client = await pool.connect();
      if (!client || typeof client.query !== "function" || typeof client.release !== "function") {
        if (typeof client?.release === "function") {
          try { client.release(); } catch {}
        }
        throw Error("invalid_agent_database_client");
      }
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL statement_timeout = '5000ms'");
        await client.query("SET LOCAL lock_timeout = '2000ms'");
        const tx = {
          async getApproval(id) {
            const result = await client.query(
              `select id, tenant_id, actor_id, action, argument_digest, nonce, status, expires_at, consumed_at
               from agent_action_approvals where id=$1 and tenant_id=$2 for update`, [id, tenantId]);
            const row = result.rows[0];
            if (!row) return null;
            return {
              id: row.id, tenantId: row.tenant_id, actorId: row.actor_id,
              action: row.action, argumentDigest: row.argument_digest, nonce: row.nonce,
              status: row.status, expiresAt: new Date(row.expires_at).getTime(),
              consumed: row.consumed_at !== null
            };
          },
          async consumeApproval(id, nonce) {
            const result = await client.query(
              `update agent_action_approvals set consumed_at=now()
               where id=$1 and tenant_id=$2 and nonce=$3 and status='approved'
               and consumed_at is null and expires_at>now() returning id`,
              [id, tenantId, nonce]);
            return result.rowCount === 1;
          },
          async appendAudit(event) {
            if (!event?.tenantId || event.tenantId !== tenantId || !event.actorId) throw Error("audit_scope_invalid");
            await client.query(
              `insert into agent_action_audit
               (id,tenant_id,actor_id,action,argument_digest,approval_id,allowed,reason)
               values ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [event.id,tenantId,event.actorId,event.action,event.argumentDigest,event.approvalId,event.allowed,event.reason]);
          }
        };
        const result = await fn(tx);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally { client.release(); }
    }
  };
}
