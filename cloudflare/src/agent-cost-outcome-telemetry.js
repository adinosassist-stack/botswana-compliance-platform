// V317 provider-neutral shadow cost-to-outcome telemetry.
// This module records measurement evidence only. It MUST NOT grant execution
// authority, activate budgets, reserve spend, or treat missing usage as zero.
export const AGENT_COST_TELEMETRY_VERSION="2026-10-09.v1";
export const AGENT_COST_TELEMETRY_EVENT="COST_OUTCOME_SHADOW";

const MAX_DURATION_MS=86_400_000;
const MAX_RETRIES=100;
const text=(value,max=160)=>String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const identifier=value=>typeof value==="string"&&text(value,160).length>0;
const safeNonNegative=value=>Number.isSafeInteger(value)&&value>=0;
const safeSigned=value=>Number.isSafeInteger(value);
const supplied=value=>value!==undefined&&value!==null;
const rows=result=>Array.isArray(result?.results)?result.results:Array.isArray(result)?result:[];

function estimateBwpMinor(inputTokens,outputTokens,pricing){
  if(!pricing||typeof pricing!=="object"||Array.isArray(pricing))return {ok:true,amountMinor:null};
  const inputRate=pricing.inputBwpMinorPerMillion;
  const outputRate=pricing.outputBwpMinorPerMillion;
  if(!supplied(inputRate)&&!supplied(outputRate))return {ok:true,amountMinor:null};
  if(!safeNonNegative(inputRate)||!safeNonNegative(outputRate))return {ok:false,code:"cost_pricing_invalid"};
  const numerator=BigInt(inputTokens)*BigInt(inputRate)+BigInt(outputTokens)*BigInt(outputRate);
  const rounded=(numerator+500_000n)/1_000_000n;
  if(rounded>BigInt(Number.MAX_SAFE_INTEGER))return {ok:false,code:"cost_estimate_overflow"};
  return {ok:true,amountMinor:Number(rounded)};
}

function valueEvidence({estimatedValueMinor,verifiedValueMinor}={}){
  if(supplied(verifiedValueMinor)){
    if(!safeSigned(verifiedValueMinor))return {ok:false,code:"cost_value_invalid"};
    return {ok:true,state:"verified",amountMinor:verifiedValueMinor};
  }
  if(supplied(estimatedValueMinor)){
    if(!safeSigned(estimatedValueMinor))return {ok:false,code:"cost_value_invalid"};
    return {ok:true,state:"estimated",amountMinor:estimatedValueMinor};
  }
  return {ok:true,state:"unknown",amountMinor:null};
}

export function buildAgentCostOutcomeTelemetry({
  tenantId,actorTenantId,runId,outcomeId=null,provider=null,model=null,
  inputTokens,outputTokens,pricing=null,verifiedCostMinor,
  durationMs=null,retryCount=0,fallbackFromProvider=null,
  estimatedValueMinor,verifiedValueMinor,source="agentic_run"
}={}){
  const deny=code=>Object.freeze({ok:false,code,version:AGENT_COST_TELEMETRY_VERSION});
  if(!identifier(tenantId)||!identifier(actorTenantId)||text(tenantId)!==text(actorTenantId))return deny("cost_telemetry_tenant_mismatch");
  if(!identifier(runId))return deny("cost_telemetry_run_required");
  if(supplied(outcomeId)&&!identifier(outcomeId))return deny("cost_telemetry_outcome_invalid");

  const hasInput=supplied(inputTokens),hasOutput=supplied(outputTokens);
  if(hasInput!==hasOutput)return deny("cost_usage_partial");
  if(hasInput&&(!safeNonNegative(inputTokens)||!safeNonNegative(outputTokens)))return deny("cost_usage_invalid");
  const usageState=hasInput?"known":"unknown";

  const normalizedDuration=supplied(durationMs)?durationMs:null;
  if(normalizedDuration!==null&&(!safeNonNegative(normalizedDuration)||normalizedDuration>MAX_DURATION_MS))return deny("cost_duration_invalid");
  if(!safeNonNegative(retryCount)||retryCount>MAX_RETRIES)return deny("cost_retry_count_invalid");

  const providerName=text(provider,100)||null;
  const modelName=text(model,100)||null;
  const fallbackFrom=text(fallbackFromProvider,100)||null;
  const fallbackUsed=!!fallbackFrom;

  let estimatedCostMinor=null;
  if(usageState==="known"){
    const estimate=estimateBwpMinor(inputTokens,outputTokens,pricing);
    if(!estimate.ok)return deny(estimate.code);
    estimatedCostMinor=estimate.amountMinor;
  }else if(pricing&&typeof pricing==="object"&&(supplied(pricing.inputBwpMinorPerMillion)||supplied(pricing.outputBwpMinorPerMillion))){
    if(!safeNonNegative(pricing.inputBwpMinorPerMillion)||!safeNonNegative(pricing.outputBwpMinorPerMillion))return deny("cost_pricing_invalid");
  }

  if(supplied(verifiedCostMinor)&&!safeNonNegative(verifiedCostMinor))return deny("cost_verified_amount_invalid");
  const costState=supplied(verifiedCostMinor)?"verified":estimatedCostMinor!==null?"estimated":"unknown";
  const costAmountMinor=costState==="verified"?verifiedCostMinor:estimatedCostMinor;

  const value=valueEvidence({estimatedValueMinor,verifiedValueMinor});
  if(!value.ok)return deny(value.code);
  let roiState="unknown",roiPct=null;
  if(costAmountMinor!==null&&costAmountMinor>0&&value.amountMinor!==null){
    roiState=costState==="verified"&&value.state==="verified"?"verified":"estimated";
    roiPct=Math.round((((value.amountMinor-costAmountMinor)/costAmountMinor)*100)*10)/10;
  }

  return Object.freeze({
    ok:true,
    version:AGENT_COST_TELEMETRY_VERSION,
    telemetryMode:"shadow",
    tenantId:text(tenantId,120),
    runId:text(runId,120),
    outcomeId:supplied(outcomeId)?text(outcomeId,120):null,
    provider:Object.freeze({name:providerName,model:modelName,fallbackUsed,fallbackFrom}),
    usage:Object.freeze({state:usageState,inputTokens:hasInput?inputTokens:null,outputTokens:hasOutput?outputTokens:null}),
    cost:Object.freeze({
      state:costState,currency:"BWP",amountMinor:costAmountMinor,
      estimatedAmountMinor:estimatedCostMinor,
      verifiedAmountMinor:supplied(verifiedCostMinor)?verifiedCostMinor:null,
      pricingBasis:estimatedCostMinor!==null?"supplied_bwp_minor_per_million_tokens":null
    }),
    runtime:Object.freeze({durationMs:normalizedDuration,retryCount}),
    value:Object.freeze({state:value.state,currency:"BWP",amountMinor:value.amountMinor}),
    roi:Object.freeze({state:roiState,percent:roiPct,basis:roiPct===null?null:"(value-cost)/cost"}),
    source:text(source,80)||"agentic_run",
    budgetEnforcement:false,
    executionAuthorityEffect:"none",
    containsPromptContent:false,
    containsCredentials:false
  });
}

export async function recordAgentCostOutcomeTelemetry(env,input={}){
  if(!env?.DB)return Object.freeze({ok:false,code:"cost_telemetry_store_unavailable"});
  const telemetry=buildAgentCostOutcomeTelemetry(input);
  if(!telemetry.ok)return telemetry;
  try{
    const run=await env.DB.prepare("SELECT id FROM agentic_runs WHERE id=? AND tenant_id=? LIMIT 1")
      .bind(telemetry.runId,telemetry.tenantId).first();
    if(!run)return Object.freeze({ok:false,code:"cost_telemetry_run_not_found"});
    if(telemetry.outcomeId){
      const outcome=await env.DB.prepare("SELECT id FROM agentic_outcomes WHERE id=? AND run_id=? AND tenant_id=? LIMIT 1")
        .bind(telemetry.outcomeId,telemetry.runId,telemetry.tenantId).first();
      if(!outcome)return Object.freeze({ok:false,code:"cost_telemetry_outcome_not_found"});
    }
    const actorUserId=identifier(input?.actorUserId)?text(input.actorUserId,160):null;
    const result=await env.DB.prepare(`INSERT INTO agentic_events(id,tenant_id,run_id,proposal_id,event_type,actor_user_id,detail_json)
      VALUES(?,?,?,NULL,?,?,?)`)
      .bind(crypto.randomUUID(),telemetry.tenantId,telemetry.runId,AGENT_COST_TELEMETRY_EVENT,actorUserId,JSON.stringify(telemetry)).run();
    const changes=Number(result?.meta?.changes??result?.changes??0);
    if(changes!==1)return Object.freeze({ok:false,code:"cost_telemetry_write_conflict"});
    return Object.freeze({ok:true,code:"cost_outcome_shadow_recorded",telemetry});
  }catch{
    return Object.freeze({ok:false,code:"cost_telemetry_write_failed"});
  }
}

function parseTelemetry(value){
  try{
    const parsed=JSON.parse(String(value||"{}"));
    return parsed?.version===AGENT_COST_TELEMETRY_VERSION&&parsed?.telemetryMode==="shadow"?parsed:null;
  }catch{return null}
}

export async function loadAgentCostOutcomeSummary(env,tenantId,{windowDays=7}={}){
  const tenant=text(tenantId,120);
  if(!env?.DB||!tenant||!Number.isSafeInteger(windowDays)||windowDays<1||windowDays>90){
    return Object.freeze({available:false,reason:"cost_outcome_telemetry_unavailable"});
  }
  try{
    const [eventResult,outcomeResult]=await Promise.all([
      env.DB.prepare(`SELECT run_id,detail_json,created_at FROM agentic_events
        WHERE tenant_id=? AND event_type=? AND created_at>=datetime('now',?)
        ORDER BY created_at DESC`).bind(tenant,AGENT_COST_TELEMETRY_EVENT,`-${windowDays} days`).all(),
      env.DB.prepare("SELECT DISTINCT run_id FROM agentic_outcomes WHERE tenant_id=?").bind(tenant).all()
    ]);
    const linkedRuns=new Set(rows(outcomeResult).map(row=>String(row?.run_id||"")).filter(Boolean));
    const telemetry=rows(eventResult).map(row=>parseTelemetry(row?.detail_json)).filter(Boolean);
    let knownUsage=0,unknownUsage=0,estimatedCostMinor=0,verifiedCostMinor=0,unknownCost=0;
    let durationMs=0,durationKnown=0,retries=0,providerFallbacks=0,outcomesLinked=0;
    const providers=new Set();
    for(const item of telemetry){
      if(item.usage?.state==="known")knownUsage+=1;else unknownUsage+=1;
      if(item.cost?.state==="estimated")estimatedCostMinor+=Number(item.cost.amountMinor||0);
      else if(item.cost?.state==="verified")verifiedCostMinor+=Number(item.cost.amountMinor||0);
      else unknownCost+=1;
      if(Number.isSafeInteger(item.runtime?.durationMs)){durationMs+=item.runtime.durationMs;durationKnown+=1}
      retries+=Number.isSafeInteger(item.runtime?.retryCount)?item.runtime.retryCount:0;
      if(item.provider?.fallbackUsed===true)providerFallbacks+=1;
      if(item.provider?.name)providers.add(String(item.provider.name));
      if(linkedRuns.has(String(item.runId||"")))outcomesLinked+=1;
    }
    return Object.freeze({
      available:true,
      version:AGENT_COST_TELEMETRY_VERSION,
      mode:"shadow",
      windowDays,
      events:telemetry.length,
      usage:Object.freeze({known:knownUsage,unknown:unknownUsage,missingMeansZero:false}),
      spend:Object.freeze({
        currency:"BWP",metered:false,budgetEnforcement:false,
        estimatedCostMinor,verifiedCostMinor,unknownCostEvents:unknownCost,
        aggregateActualMinor:null,reason:"shadow_telemetry_not_provider_billing_ledger"
      }),
      runtime:Object.freeze({durationKnownEvents:durationKnown,totalDurationMs:durationMs,totalRetries:retries,providerFallbacks}),
      providers:Object.freeze({observed:Object.freeze([...providers].sort()),count:providers.size}),
      outcomes:Object.freeze({linkedEvents:outcomesLinked,linkBasis:"run_id"}),
      telemetryCanMutate:false,
      telemetryCanGrantAuthority:false
    });
  }catch{
    return Object.freeze({available:false,reason:"cost_outcome_telemetry_unavailable"});
  }
}

export const __agentCostOutcomeTelemetryTest=Object.freeze({MAX_DURATION_MS,MAX_RETRIES,estimateBwpMinor,parseTelemetry});
