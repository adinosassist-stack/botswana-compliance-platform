import assert from "node:assert/strict";
import fs from "node:fs";

const agent=fs.readFileSync("cloudflare/src/agentic-finance-reconciliation.js","utf8");
const entry=fs.readFileSync("cloudflare/src/agentic-entry.js","utf8");
const policy=fs.readFileSync("cloudflare/src/agent-policy.js","utf8");

assert.match(agent,/authenticate\(request,env\)/);
assert.match(agent,/roleAllowed\(auth,"owner","manager"\)/);
assert.match(agent,/originAllowed\(request,env\)/);
assert.match(agent,/csrfAllowed\(request,auth\)/);
assert.match(agent,/evaluateAgentRuntimeGuard/);
assert.match(agent,/tenantScoped:true/);
assert.match(agent,/actorTenantId:String\(auth\.tenant_id\)/);
assert.match(agent,/targetTenantId:String\(auth\.tenant_id\)/);
assert.match(agent,/runtimeKillSwitch\(env\)/);
assert.match(agent,/runtimeBudgetStatus\(env\)/);
assert.match(agent,/mode:"shadow"/);
assert.match(agent,/globalExecutionEnabled:false/);
assert.match(agent,/phase:"phase1"/);
assert.match(agent,/executionAllowed===true/);
assert.match(agent,/finance_prepare_guard_invariant_failed/);

for(const event of ["AGENT_FINANCE_RECONCILIATION_DENIED","AGENT_FINANCE_RECONCILIATION_STALE","AGENT_FINANCE_RECONCILIATION_PREPARED"])assert.match(agent,new RegExp(event));
assert.match(agent,/audit_ledger_unavailable/);
assert.match(agent,/approval:\{required:true,status:"not_requested",scope:"record_reconciliation"\}/);
assert.match(agent,/execution:\{performed:false,enabled:false,writesToFinanceCore:false,externalSideEffects:false\}/);
assert.doesNotMatch(agent,/WHATSAPP_ACCESS_TOKEN|OPENAI_API_KEY|api\.openai\.com|fetch\(/,"guarded finance route must not depend on provider secrets or external network calls");

assert.match(entry,/handleAgenticFinanceReconciliationRequest/);
const financeRoute=entry.indexOf("handleAgenticFinanceReconciliationRequest");
const taskRoute=entry.indexOf("handleAgenticTaskExecutionRequest({request,logicalPath,env})");
assert.ok(financeRoute>=0&&taskRoute>financeRoute,"guarded finance request must be routed before generic bounded task execution");

assert.match(policy,/"finance_reconciliation\.prepare"/);
assert.doesNotMatch(policy,/"finance_reconciliation\.prepare"[^\n]*boundedExecutionEnabled:true/);
assert.doesNotMatch(policy,/"finance_reconciliation\.prepare"[^\n]*externalSideEffect:true/);

console.log("v106 pass 3: finance guarded-route and audit adversarial PASS");
