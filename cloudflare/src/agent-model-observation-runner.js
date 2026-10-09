import {preflightAgentObservation} from "./agent-observation-preflight.js";
import {evaluateReadRuntime} from "./agent-read-tools.js";
import {reserveAgentCost,settleAgentCost,releaseAgentCost} from "./agent-cost-reservations.js";

// Internal orchestration only. Adapters must be supplied by server code, never
// by an HTTP caller. This module does not expose a route or enable providers.
const minor=n=>Number.isSafeInteger(n)&&n>=0;
const id=s=>typeof s==="string"&&s.trim().length>0&&s.length<=120;
const deny=(code,extra={})=>({ok:false,code,executionAllowed:false,...extra});
function price(inputTokens,outputTokens,pricing){
  if(!minor(inputTokens)||!minor(outputTokens)||!pricing||
    !minor(pricing.inputBwpMinorPerMillion)||pricing.inputBwpMinorPerMillion===0||
    !minor(pricing.outputBwpMinorPerMillion)||pricing.outputBwpMinorPerMillion===0)return null;
  const amount=(BigInt(inputTokens)*BigInt(pricing.inputBwpMinorPerMillion)+
    BigInt(outputTokens)*BigInt(pricing.outputBwpMinorPerMillion)+999999n)/1000000n;
  return amount<=BigInt(Number.MAX_SAFE_INTEGER)?Number(amount):null;
}

export async function runAgentModelObservation({env,auth,input,adapters}={}){
  if(String(env?.AGENT_MODEL_EXECUTION_ENABLED??"").trim()!=="1")return deny("model_execution_disabled");
  if(!id(auth?.tenant_id)||!id(auth?.user_id)||!["owner","manager"].includes(auth?.role))return deny("model_actor_forbidden");
  if(!input||typeof input!=="object"||Array.isArray(input)||!id(input.runId)||
    typeof input.prompt!=="string"||!input.prompt.trim())return deny("model_input_invalid");
  if(Object.hasOwn(input,"models"))return deny("caller_model_catalog_forbidden");
  // Snapshot request identity and content before the first asynchronous boundary.
  auth=Object.freeze({tenant_id:auth.tenant_id,user_id:auth.user_id,role:auth.role});
  input=Object.freeze({runId:input.runId.trim(),prompt:input.prompt,actionKey:input.actionKey,
    taskClass:input.taskClass,budgetUsd:input.budgetUsd,requiredRegion:input.requiredRegion});
  const promptBytes=new TextEncoder().encode(input.prompt).byteLength;
  if(promptBytes>16384)return deny("model_input_too_large");
  let models;
  try{models=JSON.parse(String(env.AGENT_APPROVED_MODELS_JSON||"[]"))}catch{return deny("model_catalog_unavailable")}
  if(!Array.isArray(models)||models.length>100||new Set(models.map(m=>m?.id)).size!==models.length)return deny("model_catalog_unavailable");
  const decision=preflightAgentObservation({tenantId:auth.tenant_id,actorId:auth.user_id,
    actionKey:input.actionKey,taskClass:input.taskClass,models,budgetUsd:input.budgetUsd,
    requiredRegion:input.requiredRegion??null,payloadBytes:promptBytes});
  if(!decision.ok)return deny(decision.reason);
  let runtime=evaluateReadRuntime(decision.actionKey,{env,auth});
  if(runtime.allowed!==true||runtime.executionAllowed!==false)return deny(runtime.code);
  const model=models.find(m=>m.id===decision.modelId);
  if(model.externalProcessingApproved!==true)return deny("model_processing_not_approved");
  if(!id(model.provider)||!adapters||!Object.hasOwn(adapters,model.provider)||typeof adapters[model.provider]!=="function")return deny("model_adapter_unavailable");
  const invoke=adapters[model.provider];
  if(!Number.isSafeInteger(model.maxOutputTokens)||model.maxOutputTokens<1||model.maxOutputTokens>8192||
    !Number.isSafeInteger(model.inputTokenOverhead)||model.inputTokenOverhead<1||model.inputTokenOverhead>4096)return deny("model_pricing_invalid");
  // Reserve a conservative input-byte bound plus operator-configured overhead
  // and the full output ceiling. No currency conversion or provider prices are hard-coded.
  const estimate=price(promptBytes+model.inputTokenOverhead,model.maxOutputTokens,model.pricing);
  if(estimate===null)return deny("model_pricing_invalid");
  const identity={tenantId:auth.tenant_id,actorTenantId:auth.tenant_id,agentId:"thebe",reservationId:crypto.randomUUID()};
  let reserved;
  try{reserved=await reserveAgentCost(env,{...identity,runId:input.runId.trim(),estimatedCostMinor:estimate})}
  catch{return deny("model_cost_storage_unavailable")}
  if(reserved.allowed!==true)return deny(reserved.code);
  // Controls may change while the asynchronous reservation is being written.
  runtime=evaluateReadRuntime(decision.actionKey,{env,auth});
  if(runtime.allowed!==true||runtime.executionAllowed!==false){
    const released=await releaseAgentCost(env,identity);
    return deny(runtime.code,{reservationId:identity.reservationId,costStatus:released.allowed?"released":"reconciliation_required"});
  }
  let response,timer;
  const controller=new AbortController();
  const configuredTimeout=Number(env.AGENT_MODEL_TIMEOUT_MS??30000);
  const timeoutMs=Number.isFinite(configuredTimeout)?Math.max(1000,Math.min(30000,configuredTimeout)):30000;
  try{
    response=await Promise.race([
      invoke({tenantId:auth.tenant_id,actorId:auth.user_id,runId:input.runId.trim(),
        model:model.id,prompt:input.prompt,maxOutputTokens:model.maxOutputTokens,signal:controller.signal}),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("model_timeout"))},timeoutMs)})
    ]);
  }catch{return deny("model_provider_unavailable",{reservationId:identity.reservationId,costStatus:"reconciliation_required"})}
  finally{clearTimeout(timer)}
  const usage=response?.usage;
  const actual=price(usage?.inputTokens,usage?.outputTokens,model.pricing);
  if(actual===null)return deny("model_usage_unavailable",{reservationId:identity.reservationId,costStatus:"reconciliation_required"});
  const settled=await settleAgentCost(env,{...identity,actualCostMinor:actual,provider:model.provider,model:model.id,
    inputTokens:usage.inputTokens,outputTokens:usage.outputTokens});
  if(settled.allowed!==true)return deny(settled.code,{reservationId:identity.reservationId,costStatus:"reconciliation_required"});
  if(typeof response.text!=="string"||!response.text.trim()||new TextEncoder().encode(response.text).byteLength>262144)
    return deny("model_output_invalid",{reservationId:identity.reservationId,costStatus:"settled",actualCostMinor:actual});
  return {ok:true,code:"model_observation_completed",executionAllowed:false,outputVerified:false,
    modelId:model.id,text:response.text,reservationId:identity.reservationId,costStatus:"settled",actualCostMinor:actual};
}
