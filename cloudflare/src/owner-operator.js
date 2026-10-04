// Thebe Desk Owner Operator orchestration layer.
// Deterministic routing sits in front of specialist agents. Models may enrich
// explanations, but they do not select permissions or expand the action catalogue.

import { evaluateAgentAction, THEBE_AGENTS } from "./agent-policy.js";

export const OWNER_OPERATOR_VERSION = "2026-10-04.owner-operator-v1";

const ROUTES = Object.freeze({
  compliance: Object.freeze({ agentKey:"compliance", read:"compliance_status.read", prepare:"compliance_action_plan.prepare" }),
  finance: Object.freeze({ agentKey:"finance", read:"financial_position.read", prepare:"finance_brief.prepare" }),
  operations: Object.freeze({ agentKey:"operations", read:"daily_operations_summary.read", prepare:"daily_operations_brief.prepare" }),
  tender: Object.freeze({ agentKey:"tender", read:"tender_readiness.read", prepare:"tender_pack.prepare" }),
  management: Object.freeze({ agentKey:"management", read:"business_health.read", prepare:"management_brief.prepare" })
});

const DOMAIN_PRIORITY = Object.freeze(["compliance","finance","operations","tender","management"]);

function cleanDomain(value){const key=String(value||"").trim().toLowerCase();return ROUTES[key]?key:null}
function cleanIntent(value){return String(value||"").trim().toLowerCase()==="prepare"?"prepare":"read"}
function priorityScore(signal){
  const severity=String(signal?.severity||"").toLowerCase();
  const severityScore={critical:400,high:300,medium:200,low:100}[severity]||0;
  const overdue=signal?.overdue===true?80:0;
  const dueSoon=signal?.dueSoon===true?40:0;
  const evidenceGap=signal?.evidenceGap===true?25:0;
  const financialExposure=Math.min(Math.max(Number(signal?.financialExposure)||0,0),1_000_000)/100_000;
  return severityScore+overdue+dueSoon+evidenceGap+financialExposure;
}

export function routeOwnerOperatorWork({domain,intent="read",actorRole="owner",tenantScoped=false,strongAuth=false,approvalState="none"}={}){
  const normalizedDomain=cleanDomain(domain);
  if(!normalizedDomain)return Object.freeze({allowed:false,decision:"deny",code:"unknown_domain",reason:"Owner Operator only routes to registered specialist domains.",operatorVersion:OWNER_OPERATOR_VERSION});
  const route=ROUTES[normalizedDomain], normalizedIntent=cleanIntent(intent), actionKey=route[normalizedIntent];
  const policy=evaluateAgentAction({agentKey:route.agentKey,actionKey,actorRole,tenantScoped,strongAuth,approvalState,phase:"phase1"});
  return Object.freeze({ ...policy, operatorVersion:OWNER_OPERATOR_VERSION, domain:normalizedDomain, intent:normalizedIntent, specialist:Object.freeze({key:route.agentKey,label:THEBE_AGENTS[route.agentKey].label}), actionKey });
}

export function buildOwnerOperatorQueue(signals=[],context={}){
  const actorRole=String(context.actorRole||"owner").trim().toLowerCase();
  const tenantScoped=context.tenantScoped===true;
  if(!Array.isArray(signals)||!tenantScoped)return Object.freeze([]);
  const items=[];
  for(const signal of signals.slice(0,100)){
    const domain=cleanDomain(signal?.domain); if(!domain)continue;
    const intent=signal?.prepare===true?"prepare":"read";
    const route=routeOwnerOperatorWork({domain,intent,actorRole,tenantScoped:true,strongAuth:false,approvalState:"none"});
    if(!route.allowed)continue;
    items.push(Object.freeze({
      id:String(signal?.id||"").slice(0,128),
      domain,
      severity:String(signal?.severity||"unknown").toLowerCase(),
      title:String(signal?.title||"Needs attention").slice(0,180),
      reason:String(signal?.reason||"").slice(0,500),
      score:priorityScore(signal),
      specialist:route.specialist,
      actionKey:route.actionKey,
      decision:route.decision,
      humanReviewRequired:route.humanReviewRequired===true,
      externalSideEffect:false,
      status:route.decision==="prepare_only"?"ready_for_review":"ready_to_inspect"
    }));
  }
  return Object.freeze(items.sort((a,b)=>b.score-a.score||DOMAIN_PRIORITY.indexOf(a.domain)-DOMAIN_PRIORITY.indexOf(b.domain)).slice(0,25));
}

export function ownerOperatorCapabilities(){
  return Object.freeze({
    version:OWNER_OPERATOR_VERSION,
    mode:"governed_persistent_operator",
    domains:Object.freeze(Object.keys(ROUTES)),
    autonomous:Object.freeze(["detect","prioritise","route","read_authorised_data","prepare_bounded_drafts"]),
    approvalGated:Object.freeze(["external_side_effects","payments","government_filings","signatures","employment_termination","financing_acceptance"]),
    invariant:"The Owner Operator cannot grant itself permissions, bypass specialist policy, or execute external side effects in Phase 1."
  });
}
