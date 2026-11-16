import {getAgentApprovalHistoryForPrincipal} from "./agent-approval-history-controller.js";

// Framework-neutral HTTP boundary; NOT mounted to any route.
// All guards are mandatory, supplied by the existing server auth stack.
// No client-provided identity, feature flag, kill switch or tenant is trusted.
export async function handleAgentApprovalHistoryHttp({
 request,principal,pool,guards,featureEnabled=false,killSwitch=false
}={}){
 const fail=(status,code)=>Object.freeze({status,body:Object.freeze({ok:false,code,items:Object.freeze([]),readOnly:true})});
 if(featureEnabled!==true||killSwitch!==false)return fail(404,"agent_history_disabled");
 if(!request||request.method!=="GET")return fail(405,"method_not_allowed");
 if(!principal||principal.authenticated!==true)return fail(401,"unauthenticated");
 if(!guards||typeof guards.verifySession!=="function"||typeof guards.verifyTenantMembership!=="function"||
 typeof guards.verifyOrigin!=="function"||typeof guards.checkRateLimit!=="function"||typeof guards.verifyAuditAvailability!=="function")return fail(503,"security_guards_unavailable");
 try{
  const context={request,principal};
  if(await guards.verifySession(context)!==true)return fail(401,"invalid_session");
  if(await guards.verifyTenantMembership(context)!==true)return fail(403,"tenant_forbidden");
  if(await guards.verifyOrigin(context)!==true)return fail(403,"origin_forbidden");
  if(await guards.checkRateLimit(context)!==true)return fail(429,"rate_limited");
  if(await guards.verifyAuditAvailability(context)!==true)return fail(503,"audit_unavailable");
  const body=await getAgentApprovalHistoryForPrincipal({principal,pool,featureEnabled,killSwitch,limit:20});
  return Object.freeze({status:body.ok?200:503,body});
 }catch{return fail(503,"security_guard_failed");}
}
