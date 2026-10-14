import {loadReliabilityAdvisorSummary} from "./agent-reliability-telemetry-adapter.js";
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
// Caller MUST supply the authenticated worker session, never client-supplied role or tenant.
export async function handleReliabilityAdvisorRequest(request,{auth,env}={}){
  const url=new URL(request.url);
  if(url.pathname!=="/api/ai/operator/reliability"||request.method!=="GET")return respond({error:"not_found"},404);
  if(!auth?.tenant_id)return respond({error:"unauthorized"},401);
  if(!/^[a-zA-Z0-9_.:-]{1,100}$/.test(String(auth.tenant_id)))return respond({error:"unauthorized"},401);
  if(auth.role!=="owner")return respond({error:"forbidden"},403);
  if(String(env?.THEBE_AGENT_RELIABILITY_ADVISOR_ENABLED||"").toLowerCase()!=="true")return respond({error:"not_found"},404);
  const raw=url.searchParams.get("days");
  if(raw!==null&&!/^(?:[1-9]|[1-8][0-9]|90)$/.test(raw))return respond({error:"invalid_window"},400);
  const result=await loadReliabilityAdvisorSummary(env,String(auth.tenant_id),{windowDays:raw===null?7:Number(raw)});
  return result.available?respond({ok:true,...result}):respond({error:"advisor_unavailable"},503);
}
