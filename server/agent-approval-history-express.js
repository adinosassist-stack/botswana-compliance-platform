// Optional read-only Express wiring. Never registered by default.
// Host must supply real session, tenant, origin, rate-limit and audit guards.
import {handleAgentApprovalHistoryHttp} from "./agent-approval-history-http-adapter.js";
export function registerAgentApprovalHistoryExpress({
 app,enabled=false,killSwitch=false,sessionAuth,tenantMembership,originCheck,
 rateLimit,auditAvailable,getDatabase
}={}){
 if(enabled!==true||killSwitch===true)return false;
 if(!app||typeof app.get!=="function"||
 [sessionAuth,tenantMembership,originCheck,rateLimit,auditAvailable,getDatabase].some(fn=>typeof fn!=="function"))
  throw new TypeError("agent_history_security_dependencies_required");
 app.get("/api/agent/approval-history",sessionAuth,async(req,res)=>{
  const a=req.auth;
  const principal=a&&{
   authenticated:true,tenantId:a.tenant_id,actorId:a.user_id,actorRole:a.role
  };
  const guards={
   verifySession:async()=>Boolean(a?.id&&a?.tenant_id&&a?.user_id),
   verifyTenantMembership:async()=>(await tenantMembership(req,a))===true,
   verifyOrigin:async()=>(await originCheck(req))===true,
   checkRateLimit:async()=>(await rateLimit(req,a))===true,
   verifyAuditAvailability:async()=>(await auditAvailable(req,a))===true
  };
  try{
   const result=await handleAgentApprovalHistoryHttp({
    request:{method:req.method},principal,pool:getDatabase(req),guards,
    featureEnabled:true,killSwitch:false
   });
   return res.status(result.status).set({
    "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"
   }).json(result.body);
  }catch{
   return res.status(503).set({"Cache-Control":"no-store"}).json({
    ok:false,code:"agent_history_unavailable",items:[],readOnly:true
   });
  }
 });
 return true;
}
