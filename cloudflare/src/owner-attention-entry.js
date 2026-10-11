import base from "./release-governance-entry.js";
import {buildOwnerAttentionProjection} from "./owner-attention.js";
import {DEFAULT_RUNTIME_MARKET_CODE,marketBusinessDate,runtimeMarketProfile} from "./market-profile.js";

const DAILY_BRIEF_PATH="/api/daily-brief";
const RUNS_PATH="/api/agentic/runs";
const OUTCOMES_PATH="/api/agentic/outcomes";
const BUSINESS_CONTEXT_PATH="/api/business-context/brief";

function logicalRequestPath(request){
  try{
    const url=new URL(request.url);
    if(url.pathname==="/"){
      const tunneled=url.searchParams.get("__thebe_api_path");
      if(tunneled)return String(tunneled);
    }
    if(url.pathname.startsWith("/__thebe_api/"))return `/api/${url.pathname.slice("/__thebe_api/".length)}`;
    if(url.pathname==="/__thebe_api")return "/api";
    return url.pathname;
  }catch{return ""}
}

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

function knownCount(value){
  if(value===null||value===undefined||value==="")return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?Math.floor(n):null;
}

function proposalsFrom(runs){return Array.isArray(runs?.proposals)?runs.proposals:[]}
function outcomesFrom(outcomes){return Array.isArray(outcomes?.items)?outcomes.items:[]}
function proposalId(item){return clean(item?.id||item?.proposal_id||item?.proposalId,160)}
function proposalStatus(item){return clean(item?.status||"pending",40).toLowerCase()||"pending"}
function sourceRefs(item,id){
  const explicit=Array.isArray(item?.sourceRefs)?item.sourceRefs:Array.isArray(item?.source_refs)?item.source_refs:[];
  return [...new Set([...explicit.map(value=>clean(value,120)).filter(Boolean),`agentic_proposal:${id}`])];
}
function proposalTitle(item,fallback){return clean(item?.title||item?.summary||item?.action||item?.goal||fallback,220)||fallback}
function proposalSeverity(item){return clean(item?.severity||item?.riskLevel||item?.risk_level||"medium",24)||"medium"}
function proposalRoute(item){return clean(item?.actionRoute||item?.action_route||item?.target||"agentic",180)||"agentic"}
function proposalUpdatedAt(item){return item?.updatedAt||item?.updated_at||item?.decidedAt||item?.decided_at||item?.createdAt||item?.created_at||null}

function approvalRows(runs){
  return proposalsFrom(runs).filter(item=>proposalStatus(item)==="pending").map(item=>{
    const id=proposalId(item);if(!id)return null;
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
  }).filter(Boolean);
}

function pendingOutcomeRows(runs,outcomes){
  const measured=new Set(outcomesFrom(outcomes).map(item=>clean(item?.proposal_id||item?.proposalId,160)).filter(Boolean));
  return proposalsFrom(runs).filter(item=>proposalStatus(item)!=="pending").map(item=>{
    const id=proposalId(item);if(!id||measured.has(id))return null;
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
    topActions:rows.map((item,index)=>{
      const source=clean(item?.source||item?.sourceType||item?.kind||"daily_brief",80)||"daily_brief";
      const id=clean(item?.id||item?.sourceId||item?.key,160)||`priority-${index+1}`;
      const refs=Array.isArray(item?.sourceRefs)?item.sourceRefs:Array.isArray(item?.evidenceRefs)?item.evidenceRefs:[];
      return {...item,source,sourceId:id,sourceRefs:[...new Set([...refs.map(value=>clean(value,120)).filter(Boolean),`${source}:${id}`])]};
    })
  };
}

function availability(available,reason,required){
  return {available:available===true,required,observedAt:new Date().toISOString(),reason:available?null:clean(reason,180)||"source_unavailable"};
}

function authoritativeCounts(projection,daily,approvals,outcomes,{approvalsAvailable,outcomesAvailable}={}){
  const action=knownCount(daily?.status?.openWork);
  const approvalCount=approvalsAvailable?approvals.length:null;
  const outcomeCount=outcomesAvailable?outcomes.length:null;
  const total=[action,approvalCount,outcomeCount].every(value=>value!==null)?action+approvalCount+outcomeCount:null;
  const urgent=knownCount(daily?.status?.urgent);
  const overdue=knownCount(daily?.status?.overdue);
  return Object.freeze({...projection.counts,action,approvals:approvalCount,outcomes:outcomeCount,total,urgent,overdue});
}

async function ownerAttentionDailyBrief(request,env,ctx){
  const dailyResponse=await base.fetch(request,env,ctx);
  if(!dailyResponse.ok)return dailyResponse;
  const dailySource=await readJsonSource(dailyResponse);
  if(!dailySource.available)return dailyResponse;

  const [runsResponse,outcomesResponse,businessResponse]=await Promise.all([
    base.fetch(readPathRequest(request,RUNS_PATH),env,ctx),
    base.fetch(readPathRequest(request,OUTCOMES_PATH),env,ctx),
    base.fetch(readPathRequest(request,BUSINESS_CONTEXT_PATH),env,ctx)
  ]);
  const [runsSource,outcomesSource,businessSource]=await Promise.all([
    readJsonSource(runsResponse),readJsonSource(outcomesResponse),readJsonSource(businessResponse)
  ]);

  const daily=enrichDailyActions(dailySource.value||{});
  const approvals=runsSource.available?approvalRows(runsSource.value):[];
  const outcomeSourceAvailable=runsSource.available&&outcomesSource.available;
  const outcomes=outcomeSourceAvailable?pendingOutcomeRows(runsSource.value,outcomesSource.value):[];
  const businessBrief=businessSource.available?(businessSource.value?.brief||businessSource.value):null;
  const market=runtimeMarketProfile(DEFAULT_RUNTIME_MARKET_CODE);
  const sourceAvailability={
    dailyBrief:availability(true,null,true),
    businessContext:availability(businessSource.available,businessSource.reason,false),
    approvals:availability(runsSource.available,runsSource.reason,true),
    outcomes:availability(outcomeSourceAvailable,!runsSource.available?runsSource.reason:outcomesSource.reason,true)
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
  const ownerAttention=Object.freeze({...baseProjection,counts:authoritativeCounts(baseProjection,daily,approvals,outcomes,{approvalsAvailable:runsSource.available,outcomesAvailable:outcomeSourceAvailable})});
  const headers=new Headers(dailyResponse.headers);
  headers.delete("content-length");headers.delete("etag");
  headers.set("content-type","application/json; charset=utf-8");
  headers.set("cache-control","no-store");
  headers.set("x-thebe-owner-attention-version",String(ownerAttention.version||"unknown"));
  return new Response(JSON.stringify({...dailySource.value,ownerAttention}),{status:dailyResponse.status,statusText:dailyResponse.statusText,headers});
}

export default {
  async fetch(request,env,ctx){
    const path=logicalRequestPath(request);
    if(request.method==="GET"&&path===DAILY_BRIEF_PATH)return ownerAttentionDailyBrief(request,env,ctx);
    return base.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return base.scheduled(event,env,ctx)}
};

export const __ownerAttentionEntryTest=Object.freeze({
  approvalRows,
  authoritativeCounts,
  enrichDailyActions,
  knownCount,
  logicalRequestPath,
  pendingOutcomeRows,
  proposalId,
  proposalStatus,
  readJsonSource,
  readPathRequest
});
