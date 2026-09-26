export const FINANCE_WATCH_BUDGET_VERSION="2026-09-25.v1";
export function evaluateFinanceWatchBudget({toolCalls=0,externalActions=0,elapsedMs=0,maxToolCalls=4,maxElapsedMs=15000}={}){
 const reasons=[];if(Number(toolCalls)>maxToolCalls)reasons.push("tool_call_budget_exceeded");if(Number(externalActions)>0)reasons.push("external_action_forbidden");if(Number(elapsedMs)>maxElapsedMs)reasons.push("time_budget_exceeded");
 return Object.freeze({allowed:reasons.length===0,executionAllowed:false,reasons:Object.freeze(reasons),limits:Object.freeze({maxToolCalls,maxExternalActions:0,maxElapsedMs})});
}