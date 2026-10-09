// Fail-closed policy for selecting a model for read-only agent tasks.
// This module does not call providers or authorize tool execution.
export const MODEL_ROUTER_POLICY_VERSION="2026-10-09.v1";
const TASK_CLASSES=Object.freeze(["classification","summary","analytics","reasoning"]);
export function selectAgentModel({taskClass,models=[],budgetUsd=0,requiredRegion=null}={}){
  if(!TASK_CLASSES.includes(taskClass))return {ok:false,reason:"unsupported_task_class"};
  if(!Number.isFinite(budgetUsd)||budgetUsd<=0)return {ok:false,reason:"invalid_budget"};
  if(!Array.isArray(models))return {ok:false,reason:"invalid_models"};
  if(models.length>100)return {ok:false,reason:"too_many_models"};
  if(requiredRegion!==null&&(typeof requiredRegion!=="string"||!requiredRegion.trim()))return {ok:false,reason:"invalid_region"};
  const eligible=models.filter(m=>m&&m.enabled===true&&typeof m.id==="string"&&m.id.trim().length>0&&m.id.length<=120&&
    Array.isArray(m.taskClasses)&&m.taskClasses.includes(taskClass)&&
    Number.isFinite(m.estimatedCostUsd)&&m.estimatedCostUsd>=0&&m.estimatedCostUsd<=budgetUsd&&
    Number.isFinite(m.evalPassRate)&&m.evalPassRate>=0.95&&m.evalPassRate<=1&&
    (requiredRegion===null||(Array.isArray(m.regions)&&m.regions.includes(requiredRegion))));
  eligible.sort((a,b)=>a.estimatedCostUsd-b.estimatedCostUsd||b.evalPassRate-a.evalPassRate||a.id.localeCompare(b.id));
  if(!eligible.length)return {ok:false,reason:"no_approved_model"};
  return {ok:true,modelId:eligible[0].id,estimatedCostUsd:eligible[0].estimatedCostUsd,policyVersion:MODEL_ROUTER_POLICY_VERSION};
}
