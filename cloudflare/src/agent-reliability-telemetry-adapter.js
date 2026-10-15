import {sanitizeAgentRun,evaluateAgentRuns} from "./agent-reliability-advisor.js";
import {AGENT_COST_TELEMETRY_VERSION} from "./agent-cost-outcome-telemetry.js";

// Read-only adapter for existing shadow telemetry. Never grants execution authority.
export function adaptShadowCostEvent(event, tenantId) {
  if (!event || event.version !== AGENT_COST_TELEMETRY_VERSION ||
      event.telemetryMode !== "shadow" || event.tenantId !== tenantId) return null;
  // Cost telemetry is NOT evidence of task success. Always mark outcome unverified.
  return sanitizeAgentRun({
    tenantId,actorTenantId:tenantId,traceId:event.runId,
    workflow:event.source,agentId:"thebe",outcome:"unverified",
    authorization:"unverified",inputTokens:event.usage?.inputTokens,
    outputTokens:event.usage?.outputTokens,costMinor:event.cost?.amountMinor
  });
}

export async function loadReliabilityAdvisorSummary(env, tenantId, {windowDays=7}={}) {
  if (!env?.DB || typeof tenantId !== "string" || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(tenantId) ||
      !Number.isSafeInteger(windowDays) || windowDays<1 || windowDays>90)
    return Object.freeze({available:false,reason:"reliability_advisor_unavailable"});
  try {
    // Migration 069 isolates shadow telemetry from governed agentic event types.
    const result=await env.DB.prepare(`SELECT detail_json FROM agent_cost_shadow_events
      WHERE tenant_id=? AND occurred_at>=datetime('now',?)
      ORDER BY occurred_at DESC LIMIT 500`)
      .bind(tenantId,`-${windowDays} days`).all();
    const rows=[];
    const seenRuns=new Set();
    for (const row of Array.isArray(result?.results)?result.results:[]) {
      if(typeof row?.detail_json!=="string"||row.detail_json.length>32768)continue;
      let event;
      try {event=JSON.parse(String(row.detail_json||""));}catch{continue;}
      const adapted=adaptShadowCostEvent(event,tenantId);
      if(adapted && !seenRuns.has(adapted.traceId)) {
        seenRuns.add(adapted.traceId);
        rows.push(adapted);
      }
    }
    return Object.freeze({available:true,mode:"advisor_only",windowDays,summary:evaluateAgentRuns(rows,tenantId),
      executionAuthorityEffect:"none",canMutate:false});
  } catch {
    return Object.freeze({available:false,reason:"reliability_advisor_unavailable"});
  }
}
