import { randomUUID } from "node:crypto";

/**
 * Persist an authorized execution intent. This never performs side effects.
 * Callers must supply an authorization record issued by the trusted backend.
 * Sensitive action workers remain disabled until approval and replay controls
 * are integrated end-to-end.
 */
export async function enqueueAgentIntent({ pool, tenantId, actorId, action, argumentDigest, authorizationId, idempotencyKey }) {
  if (![tenantId, actorId, action, argumentDigest, authorizationId, idempotencyKey].every(v => typeof v === "string" && v.trim())) {
    return { queued: false, reason: "invalid_intent" };
  }
  if (!/^[a-f0-9]{64}$/i.test(argumentDigest) || !/^[a-f0-9-]{36}$/i.test(authorizationId) || idempotencyKey.length > 200) {
    return { queued: false, reason: "invalid_intent" };
  }
  if (!pool || typeof pool.query !== "function") return { queued: false, reason: "storage_unavailable" };
  try {
    const result = await pool.query(
      `insert into agent_action_outbox
       (id, tenant_id, actor_id, action, argument_digest, authorization_id, idempotency_key)
       select $1,$2,$3,$4,$5,$6,$7
       where exists (
         select 1 from agent_action_audit
         where id=$6 and tenant_id=$2 and actor_id=$3 and action=$4
           and argument_digest=$5 and allowed=true and reason='authorized'
       )
       on conflict do nothing returning id`,
      [randomUUID(), tenantId, actorId, action, argumentDigest, authorizationId, idempotencyKey]
    );
    if (result.rows?.[0]?.id) return { queued: true, id: result.rows[0].id };
    return { queued: false, reason: "not_queued_or_duplicate" };
  } catch {
    return { queued: false, reason: "storage_unavailable" };
  }
}
