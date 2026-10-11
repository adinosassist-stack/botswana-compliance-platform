import {buildOwnerAttentionProjection} from "./owner-attention.js";
import {DEFAULT_RUNTIME_MARKET_CODE,marketBusinessDate,runtimeMarketProfile} from "./market-profile.js";

const DAILY_BRIEF_PATH="/api/daily-brief";
const RUNS_PATH="/api/agentic/runs";
const OUTCOMES_PATH="/api/agentic/outcomes";
const BUSINESS_CONTEXT_PATH="/api/business-context/brief";

function readPathRequest(request,path){
  const url=new URL(request.url);
  url.pathname=path;
  url.search="";
  const headers=new Headers(request.headers);
  headers.set("accept","application/json");
  return new Request(url.toString(),{method:"GET",headers,redirect:"manual"});
}

async function readJsonSource(response){
  if(!response)return {available:false,value:null,reason:"source_unavailable"};
  if(!response.ok)return {available:false,value:null,reason:`http_${response.status}`};
  const type=String(response.headers.get("content-type")||"").toLowerCase();
  if(!type.includes("application/json"))return {available:false,value:null,reason:"invalid_content_type"};
  try{return {available:true,value:await response.clone().json(),reason:null}}
  catch{return {available:false,value:null,reason:"invalid_json"}}
}

function clean(value,max=240){
  return String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
}

async function fetchJsonSource(coreFetch,request,env,ctx){
  try{return await readJsonSource(await coreFetch(request,env,ctx))}
  catch(error){return {available:false,value:null,reason:`fetch_failed:${clean(error?.message||error,120)||"source_exception"}`}}
}

function knownCount(value){
  if(value===null||value===undefined||value==="")return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?Math.floor(n):null;
}

function proposalsFrom(runs){return Array.isArray(runs?.proposals)?runs.proposals:[]}
function outcomesFrom(outcomes){return Array.isArray(outcomes?.items)?outcomes.items:[]}
function proposalId(item){return clean(item?.id||item?.proposal_id||item?.proposalId,160)}
function outcomeProposalId(item){return clean(item?.proposal_id||item?.proposalId,160)}
function proposalStatus(item){return clean(item?.status||"pending",40).toLowerCase()||"pending"}
function sourceRefs(item,id){
  const explicit=Array.isArray(item?.sourceRefs)?item.sourceRefs:Array.isArray(item?.source_refs)?item.source_refs:[];
  return [...new Set([...explicit.map(value=>clean(value,120)).filter(Boolean),`agentic_proposal:${id}`])];
}
function proposalTitle(item,fallback){return clean(item?.title||item?.summary||item?.action||item?.goal||fallback,220)||fallback}
function proposalSeverity(item){return clean(item?.severity||item?.risk||item?.riskLevel||item?.risk_level||"medium",24)||"medium"}
function proposalRoute(item){return clean(item?.actionRoute||item?.action_route||item?.target||"agentic",180)||"agentic"}
function proposalUpdatedAt(item){return item?.updatedAt||item?.updated_at||item?.decision_at||item?.decidedAt||item?.decided_at||item?.createdAt||item?.created_at||null}

function validRunsShape(value){
  return Array.isArray(value?.proposals)&&value.proposals.every(item=>proposalId(item));
}
function validOutcomesShape(value){
  return Array.isArray(value?.items)&&value.items.every(item=>outcomeProposalId(item));
}
function validDailyShape(value){
  return !!value&&typeof value==="object"&&Array.isArray(value.topActions)&&knownCount(value?.status?.openWork)!==null;
}

function approvalRows(runs){
  return proposalsFrom(runs).filter(item=>proposalStatus(item)==="pending").map(item=>{
    const id=proposalId(item);
    return {
      sourceType:"agentic_proposal",
      sourceId:id,
      title:proposalTitle(item,"Agent approval required"),
      owner:item?.owner||item?.reviewer||null,
      dueAt:item?.dueAt||item?.due_at||item?.expiresAt||item?.expires_at||null,
      severity:proposalSeverity(item),
      truthState:"review",
      evidenceState:Array.isArray(item?.sourceRefs)&&item.sourceRefs.length?"referenced":"recorded",
      sourceRefs:sourceRefs(item,id),
      recommendedAction:clean(item?.recommendedAction||item?.recommendation||"Review the proposal and its evidence before deciding.",320),
      actionRoute:proposalRoute(item),
      updatedAt:proposalUpdatedAt(item),
      status:"pending",
      detail:clean(item?.detail||item?.reason,500)||null
    };
  });
}

function pendingOutcomeRows(runs,outcomes){
  const measured=new Set(outcomesFrom(outcomes).map(outcomeProposalId));
  return proposalsFrom(runs).filter(item=>proposalStatus(item)!=="pending").map(item=>{
    const id=proposalId(item);if(measured.has(id))return null;
    const status=proposalStatus(item);
    return {
      sourceType:"agentic_proposal_outcome",
      sourceId:id,
      title:proposalTitle(item,"Record proposal outcome"),
      owner:item?.owner||null,
      dueAt:item?.outcomeDueAt||item?.outcome_due_at||item?.dueAt||item?.due_at||null,
      severity:proposalSeverity(item),
      truthState:"review",
      evidenceState:"recorded",
      sourceRefs:sourceRefs(item,id),
      recommendedAction:"Record the verified outcome when durable evidence is available.",
      actionRoute:proposalRoute(item),
      updatedAt:proposalUpdatedAt(item),
      status:`outcome_pending_after_${status}`,
      detail:clean(item?.detail||item?.reason,500)||null
    };
  }).filter(Boolean);
}

function enrichDailyActions(daily){
  const rows=Array.isArray(daily?.topActions)?daily.topActions:[];
  return {
    ...daily,
    topActions:rows.map(item=>{
      const source=clean(item?.source||item?.sourceType||item?.kind||"daily_brief",80)||"daily_brief";
      const id=clean(item?.id||item?.sourceId||item?.key,160);
      if(!id)return null;
      const refs=Array.isArray(item?.sourceRefs)?item.sourceRefs:Array.isArray(item?.evidenceRefs)?item.evidenceRefs:[];
      return {...item,source,sourceId:id,sourceRefs:[...new Set([...refs.map(value=>clean(value,120)).filter(Boolean),`${source}:${id}`])]};
    }).filter(Boolean)
  };
}

function availability(available,reason,required){
  return {available:available===true,required,observedAt:new Date().toISOString(),reason:available?null:clean(reason,180)||"source_unavailable"};
}

function authoritativeCounts(projection,daily,approvals,outcomes,{dailyAvailable,approvalsAvailable,outcomesAvailable}={}){
  const action=dailyAvailable?knownCount(daily?.status?.openWork):null;
  const approvalCount=approvalsAvailable?approvals.length:null;
  const outcomeCount=outcomesAvailable?outcomes.length:null;
  const total=[action,approvalCount,outcomeCount].every(value=>value!==null)?action+approvalCount+outcomeCount:null;
  const urgent=dailyAvailable?knownCount(daily?.status?.urgent):null;
  const overdue=dailyAvailable?knownCount(daily?.status?.overdue):null;
  return Object.freeze({...projection.counts,action,approvals:approvalCount,outcomes:outcomeCount,total,urgent,overdue});
}

function shapeAvailability(source,validator){
  if(!source.available)return source;
  return validator(source.value)?source:{available:false,value:source.value,reason:"invalid_shape"};
}

function unavailableProjection(reason="daily_brief_unavailable"){
  const market=runtimeMarketProfile(DEFAULT_RUNTIME_MARKET_CODE);
  return buildOwnerAttentionProjection({
    generatedAt:new Date().toISOString(),
    businessDate:marketBusinessDate(),
    market,
    dailyBrief:null,
    businessBrief:null,
    approvals:[],
    outcomes:[],
    sourceAvailability:{
      dailyBrief:availability(false,reason,true),
      businessContext:availability(false,reason,false),
      approvals:availability(false,reason,true),
      outcomes:availability(false,reason,true)
    }
  });
}

function ownerAttentionResponse(dailyResponse,dailyPayload,ownerAttention,{status=dailyResponse?.status||200,statusText=dailyResponse?.statusText||""}={}){
  const headers=new Headers(dailyResponse?.headers||{});
  headers.delete("content-length");headers.delete("etag");
  headers.set("content-type","application/json; charset=utf-8");
  headers.set("cache-control","no-store");
  headers.set("x-thebe-owner-attention-version",String(ownerAttention.version||"unknown"));
  headers.set("x-thebe-owner-attention-state",String(ownerAttention.state||"unknown"));
  return new Response(JSON.stringify({...dailyPayload,ownerAttention}),{status,statusText,headers});
}

async function ownerAttentionDailyBrief({request,env,ctx,coreFetch}){
  let dailyResponse;
  try{dailyResponse=await coreFetch(request,env,ctx)}
  catch(error){
    const reason=`fetch_failed:${clean(error?.message||error,120)||"daily_brief_exception"}`;
    return ownerAttentionResponse(null,{error:"daily_brief_unavailable"},unavailableProjection(reason),{status:503,statusText:"Service Unavailable"});
  }
  if(!dailyResponse.ok){
    if(dailyResponse.status===401||dailyResponse.status===403)return dailyResponse;
    if(dailyResponse.status>=500){
      const reason=`http_${dailyResponse.status}`;
      return ownerAttentionResponse(dailyResponse,{error:"daily_brief_unavailable"},unavailableProjection(reason));
    }
    return dailyResponse;
  }
  const dailySource=shapeAvailability(await readJsonSource(dailyResponse),validDailyShape);

  const runsRequest=readPathRequest(request,RUNS_PATH);
  const outcomesRequest=readPathRequest(request,OUTCOMES_PATH);
  const businessRequest=readPathRequest(request,BUSINESS_CONTEXT_PATH);
  const [rawRunsSource,rawOutcomesSource,businessSource]=await Promise.all([
    fetchJsonSource(coreFetch,runsRequest,env,ctx),
    fetchJsonSource(coreFetch,outcomesRequest,env,ctx),
    fetchJsonSource(coreFetch,businessRequest,env,ctx)
  ]);
  const runsSource=shapeAvailability(rawRunsSource,validRunsShape);
  const outcomesApiSource=shapeAvailability(rawOutcomesSource,validOutcomesShape);

  const daily=dailySource.available?enrichDailyActions(dailySource.value):null;
  const approvals=runsSource.available?approvalRows(runsSource.value):[];
  const outcomesAvailable=runsSource.available&&outcomesApiSource.available;
  const outcomes=outcomesAvailable?pendingOutcomeRows(runsSource.value,outcomesApiSource.value):[];
  const businessBrief=businessSource.available?(businessSource.value?.brief||businessSource.value):null;
  const market=runtimeMarketProfile(DEFAULT_RUNTIME_MARKET_CODE);
  const sourceAvailability={
    dailyBrief:availability(dailySource.available,dailySource.reason,true),
    businessContext:availability(businessSource.available,businessSource.reason,false),
    approvals:availability(runsSource.available,runsSource.reason,true),
    outcomes:availability(outcomesAvailable,!runsSource.available?runsSource.reason:outcomesApiSource.reason,true)
  };
  const baseProjection=buildOwnerAttentionProjection({
    generatedAt:daily?.generatedAt||new Date().toISOString(),
    businessDate:daily?.date||marketBusinessDate(),
    market,
    businessBrief,
    dailyBrief:daily,
    approvals,
    outcomes,
    sourceAvailability
  });
  const ownerAttention=Object.freeze({
    ...baseProjection,
    counts:authoritativeCounts(baseProjection,daily,approvals,outcomes,{
      dailyAvailable:dailySource.available,
      approvalsAvailable:runsSource.available,
      outcomesAvailable
    })
  });
  const dailyPayload=dailySource.value&&typeof dailySource.value==="object"&&!Array.isArray(dailySource.value)?dailySource.value:{};
  return ownerAttentionResponse(dailyResponse,dailyPayload,ownerAttention);
}

export {DAILY_BRIEF_PATH,ownerAttentionDailyBrief};
export const __ownerAttentionEntryTest=Object.freeze({
  approvalRows,
  authoritativeCounts,
  enrichDailyActions,
  fetchJsonSource,
  knownCount,
  outcomeProposalId,
  pendingOutcomeRows,
  proposalId,
  proposalStatus,
  readJsonSource,
  readPathRequest,
  shapeAvailability,
  unavailableProjection,
  validDailyShape,
  validOutcomesShape,
  validRunsShape
});
