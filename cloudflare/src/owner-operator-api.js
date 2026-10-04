// HTTP adapter for the governed Owner Operator.
// Kept separate from worker.js so routing remains testable and reviewable.
import { buildOwnerOperatorQueue, ownerOperatorCapabilities, routeOwnerOperatorWork } from "./owner-operator.js";

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const allowedRole=(role,...roles)=>roles.includes(String(role||"").toLowerCase());

async function boundedJson(req,maxBytes){
  const declared=Number(req.headers.get("content-length")||0);if(declared>maxBytes)throw Object.assign(new Error("request_too_large"),{status:413});
  const text=await req.text();if(new TextEncoder().encode(text).byteLength>maxBytes)throw Object.assign(new Error("request_too_large"),{status:413});
  try{const value=JSON.parse(text||"{}");if(!value||typeof value!=="object"||Array.isArray(value))throw new Error();return value}catch{throw Object.assign(new Error("invalid_json"),{status:400})}
}

export function isOwnerOperatorPath(pathname){return String(pathname||"").startsWith("/api/ai/operator/")}

export async function handleOwnerOperatorRequest(req,{auth}={}){
  const url=new URL(req.url),role=String(auth?.role||"").toLowerCase();
  if(!auth?.tenant_id)return json({error:"unauthorized"},401);

  if(url.pathname==="/api/ai/operator/capabilities"&&req.method==="GET"){
    if(!allowedRole(role,"owner","manager","reviewer"))return json({error:"forbidden"},403);
    return json({ok:true,...ownerOperatorCapabilities()});
  }

  if(url.pathname==="/api/ai/operator/route"&&req.method==="POST"){
    if(!allowedRole(role,"owner","manager","reviewer"))return json({error:"forbidden"},403);
    try{
      const body=await boundedJson(req,4096);
      const result=routeOwnerOperatorWork({domain:body.domain,intent:body.intent,actorRole:role,tenantScoped:true,strongAuth:false,approvalState:"none"});
      return result.allowed?json({ok:true,...result}):json({ok:false,...result},result.code==="role_forbidden"?403:400);
    }catch(e){return json({error:e.message==="request_too_large"?"request_too_large":"invalid_json"},e.status||400)}
  }

  if(url.pathname==="/api/ai/operator/queue"&&req.method==="POST"){
    if(!allowedRole(role,"owner","manager"))return json({error:"forbidden"},403);
    try{
      const body=await boundedJson(req,32768);
      if(!Array.isArray(body.signals)||body.signals.length>100)return json({error:"invalid_signals",maxItems:100},400);
      return json({ok:true,operator:ownerOperatorCapabilities(),items:buildOwnerOperatorQueue(body.signals,{actorRole:role,tenantScoped:true})});
    }catch(e){return json({error:e.message==="request_too_large"?"request_too_large":"invalid_json"},e.status||400)}
  }
  return json({error:"not_found"},404);
}
