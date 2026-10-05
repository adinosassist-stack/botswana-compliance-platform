export const AGENT_RESPONSIBILITY_VERSION="2026-10-05.v285";
export const RESPONSIBILITY_WORKSPACES=Object.freeze(["owner","finance","property","people","compliance","market","operations"]);
export const RESPONSIBILITY_STATUSES=Object.freeze(["draft","active","paused","completed","cancelled"]);
export const RESPONSIBILITY_AUTONOMY_CEILING=Object.freeze({OBSERVE:0,PREPARE:1,BOUNDED_INTERNAL:2});

const clean=(value,max)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const list=(value,maxItems=32,maxLen=120)=>Array.isArray(value)?[...new Set(value.map(v=>clean(v,maxLen)).filter(Boolean))].slice(0,maxItems):[];

export function normalizeResponsibility(input={}){
  const workspace=clean(input.workspace,32).toLowerCase();
  const scheduleKind=clean(input.scheduleKind||"manual",24).toLowerCase();
  const autonomy=Number(input.autonomyCeiling??RESPONSIBILITY_AUTONOMY_CEILING.PREPARE);
  return Object.freeze({
    title:clean(input.title,160),
    objective:clean(input.objective,1200),
    workspace:RESPONSIBILITY_WORKSPACES.includes(workspace)?workspace:null,
    autonomyCeiling:Number.isInteger(autonomy)&&autonomy>=0&&autonomy<=2?autonomy:null,
    scheduleKind:["manual","event","interval"].includes(scheduleKind)?scheduleKind:null,
    scheduleSpec:scheduleKind==="manual"?null:clean(input.scheduleSpec,240)||null,
    toolScope:Object.freeze(list(input.toolScope)),
    dataScope:Object.freeze(list(input.dataScope)),
    budgetMinor:input.budgetMinor==null?null:Number(input.budgetMinor)
  });
}

export function validateResponsibility(input={}){
  const value=normalizeResponsibility(input),errors=[];
  if(!value.title)errors.push("title_required");
  if(!value.objective)errors.push("objective_required");
  if(!value.workspace)errors.push("workspace_invalid");
  if(value.autonomyCeiling==null)errors.push("autonomy_ceiling_invalid");
  if(!value.scheduleKind)errors.push("schedule_kind_invalid");
  if(value.scheduleKind!=="manual"&&!value.scheduleSpec)errors.push("schedule_spec_required");
  if(value.budgetMinor!=null&&(!Number.isSafeInteger(value.budgetMinor)||value.budgetMinor<0))errors.push("budget_invalid");
  return Object.freeze({ok:errors.length===0,value,errors:Object.freeze(errors)});
}

export function responsibilityCanRequestAction({responsibility,actionKey,toolKey,executionRequested=false}={}){
  if(!responsibility||String(responsibility.status)!=="active")return Object.freeze({allowed:false,code:"responsibility_not_active"});
  const ceiling=Number(responsibility.autonomyCeiling??responsibility.autonomy_ceiling??-1);
  if(!Number.isInteger(ceiling)||ceiling<0||ceiling>2)return Object.freeze({allowed:false,code:"responsibility_ceiling_invalid"});
  if(executionRequested&&ceiling<RESPONSIBILITY_AUTONOMY_CEILING.BOUNDED_INTERNAL)return Object.freeze({allowed:false,code:"responsibility_execution_not_permitted"});
  const tools=responsibility.toolScope||responsibility.tool_scope||[];
  if(toolKey&&!tools.includes(toolKey))return Object.freeze({allowed:false,code:"responsibility_tool_out_of_scope"});
  if(!clean(actionKey,120))return Object.freeze({allowed:false,code:"responsibility_action_required"});
  return Object.freeze({allowed:true,code:executionRequested?"responsibility_allows_guard_evaluation":"responsibility_allows_proposal"});
}

// This module is intentionally non-authoritative. An allow result means only that
// the request may proceed to Thebe's existing deterministic Runtime Guard.
// It can never grant execution by itself.
