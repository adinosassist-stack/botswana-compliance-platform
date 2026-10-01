import {validatePersistentTaskAllowedTools} from "./agent-tool-trust-registry.js";

export const BUSINESS_GOALS_VERSION="2026-10-01.v2";
const frozen=value=>Object.freeze(value);
const clean=(v,max=500)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);

export const BUSINESS_GOAL_TEMPLATES=frozen({
  protect_cash:frozen({label:"Protect cash",objective:"Protect the minimum cash buffer and surface material cash-flow pressure.",allowedTools:frozen(["financial_position.read","finance_data_quality.read","receivables_summary.read"])}),
  grow_sales:frozen({label:"Grow sales",objective:"Watch recorded receivables and aggregate operating signals and surface measurable follow-up opportunities.",allowedTools:frozen(["receivables_summary.read","daily_operations_summary.read"])}),
  stay_compliant:frozen({label:"Stay compliant",objective:"Watch recorded compliance status and surface material obligations that need owner attention.",allowedTools:frozen(["compliance_status.read"])}),
  watch_operations:frozen({label:"Watch operations",objective:"Watch daily operating signals and surface material exceptions without inferring employee intent or performance.",allowedTools:frozen(["daily_operations_summary.read"])}),
  protect_property:frozen({label:"Protect property",objective:"Watch business-health and financial-position pressure relevant to property decisions; asset and valuation records remain in Property.",allowedTools:frozen(["business_health.read","financial_position.read"])}),
  morning_brief:frozen({label:"Morning brief",objective:"Prepare a concise owner brief containing only material business exceptions and useful next steps.",allowedTools:frozen(["business_health.read","financial_position.read","finance_data_quality.read","receivables_summary.read","compliance_status.read","daily_operations_summary.read"])})
});

export function businessGoalTemplate(key){return BUSINESS_GOAL_TEMPLATES[clean(key,40)]||null}

export function buildBusinessGoalTask(body={}){
  const templateKey=clean(body.templateKey,40),template=businessGoalTemplate(templateKey);
  if(!template)return {error:"invalid_business_goal_template"};
  const trusted=validatePersistentTaskAllowedTools([...template.allowedTools]);
  if(!trusted.valid)return {error:trusted.code};
  const objective=clean(body.objective,500)||template.objective;
  const cadence=clean(body.cadence,40)||"daily";
  if(!["daily","weekly"].includes(cadence))return {error:"invalid_business_goal_cadence"};
  const requiredToolCalls=trusted.tools.length;
  const hasExplicitToolBudget=Object.prototype.hasOwnProperty.call(body,"maxToolCallsPerRun");
  const maxToolCallsPerRun=hasExplicitToolBudget
    ?Math.min(8,Math.max(1,Math.round(Number(body.maxToolCallsPerRun)||4)))
    :Math.min(8,Math.max(1,requiredToolCalls));
  return {payload:frozen({
    templateKey,label:template.label,objective,
    triggerKind:"scheduled",
    triggerSpec:frozen({cadence}),
    allowedTools:frozen(trusted.tools),
    riskPolicy:frozen({mode:"observe_recommend",externalActions:false,highImpactActions:"human_only"}),
    approvalPolicy:frozen({consequentialActions:"owner_required"}),
    budget:frozen({maxToolCallsPerRun,maxExternalActions:0}),
    executionAllowed:false
  })};
}
