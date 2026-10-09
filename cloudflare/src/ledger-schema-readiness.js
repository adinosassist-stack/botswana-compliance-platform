import manifest from "../../scripts/manifests/agent-cost-schema.json" with {type:"json"};

// Readiness only; no accounting writes, budget provisioning or model activation.
const required=manifest.objects.map(item=>`('${item.type}','${item.name}')`).join(',');
const sql=`WITH required(type,name) AS (VALUES ${required})
SELECT 1 ok,
 (SELECT COUNT(*) FROM agent_cost_budgets) budget_count,
 (SELECT COUNT(*) FROM agent_cost_reservations) reservation_count,
 (SELECT COUNT(*) FROM agent_cost_events) event_count,
 (SELECT COUNT(*) FROM agent_cost_purge_authorizations) purge_count
WHERE NOT EXISTS (SELECT 1 FROM required r WHERE NOT EXISTS
 (SELECT 1 FROM sqlite_master s WHERE s.type=r.type AND s.name=r.name))`;
export async function ledgerSchemaReady(env){
  try{return (await env.DB.prepare(sql).first())?.ok===1}catch{return false}
}
