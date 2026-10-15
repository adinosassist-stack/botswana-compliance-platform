// Pure, recommendation-only reliability evaluator. No tool invocation or writes.
const OUTCOMES = new Set(["success","denied","error","timeout","cost_limit"]);
const SAFE_KEY = /^[a-zA-Z0-9_.:-]{1,100}$/;
const safeKey = value => typeof value === "string" && SAFE_KEY.test(value) ? value : null;
const nonnegative = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

export function sanitizeAgentRun(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const tenantId = safeKey(input.tenantId);
  const actorTenantId = safeKey(input.actorTenantId);
  const traceId = safeKey(input.traceId);
  if (!tenantId || !actorTenantId || tenantId !== actorTenantId || !traceId) return null;
  const outcome = OUTCOMES.has(input.outcome) ? input.outcome : "unverified";
  // Explicit allowlist: never spread input or retain prompts, tool payloads or secrets.
  return Object.freeze({
    tenantId, actorTenantId, traceId,
    workflow: safeKey(input.workflow),
    agentId: safeKey(input.agentId),
    toolKey: safeKey(input.toolKey),
    outcome,
    authorization: input.authorization === "allow" ? "allow" : input.authorization === "deny" ? "deny" : "unverified",
    inputTokens: nonnegative(input.inputTokens),
    outputTokens: nonnegative(input.outputTokens),
    costMinor: nonnegative(input.costMinor)
  });
}

export function evaluateAgentRuns(rows, tenantId) {
  const scopedTenant = safeKey(tenantId);
  if (!scopedTenant) return Object.freeze({status:"unverified",total:0,recommendations:[]});
  const valid = (Array.isArray(rows) ? rows : []).map(sanitizeAgentRun).filter(r => r && r.tenantId === scopedTenant);
  const counts = {success:0,denied:0,error:0,timeout:0,cost_limit:0,unverified:0};
  let knownCostMinor = 0, missingCost = 0;
  for (const row of valid) {
    counts[row.outcome]++;
    if (row.costMinor === null) missingCost++;
    else knownCostMinor += row.costMinor;
  }
  const recommendations = [];
  if (counts.error || counts.timeout) recommendations.push("Review failed and timed-out workflows before enabling execution.");
  if (counts.denied) recommendations.push("Review denied actions for policy or prompt-injection attempts; do not loosen authorization automatically.");
  if (counts.cost_limit || missingCost) recommendations.push("Review cost limits and missing usage telemetry; do not estimate missing charges as zero.");
  if (counts.unverified) recommendations.push("Collect missing outcome evidence before treating results as successful.");
  return Object.freeze({status:valid.length && !counts.unverified && !missingCost ? "evaluated":"unverified",total:valid.length,counts,knownCostMinor,missingCost,recommendations});
}
