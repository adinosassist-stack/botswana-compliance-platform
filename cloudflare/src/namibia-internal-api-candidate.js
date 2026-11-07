// Internal Namibia HTTP adapter candidate. DELIBERATELY NOT mounted in worker.js.
// Auth is server-derived from the existing session provider, never request headers/body.
// A future route must additionally prove binding isolation and entitlement before wiring.
import {authenticate,originAllowed,csrfAllowed,readJson,requestBodyErrorStatus} from "./agentic-authority-core.js";
import {
 createNamibiaEntityDraft,createNamibiaEvidenceMetadata,createNamibiaCalendarDraft,
 listNamibiaEvidenceMetadata,listNamibiaCalendarDrafts,listNamibiaAuditEvents
} from "./namibia-compliance-candidate-store.js";
import {marketActivationReadiness} from "./market-profile.js";
import {checkNamibiaIsolatedEnvironment} from "./namibia-isolation-preflight.js";
export const NAMIBIA_INTERNAL_API_VERSION="2026-11-07.v1";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 "content-type":"application/json; charset=utf-8","cache-control":"no-store",
 "x-content-type-options":"nosniff","vary":"Cookie"}});
const fixedPaths=Object.freeze({
 "POST /internal/namibia/entities":createNamibiaEntityDraft,
 "POST /internal/namibia/evidence":createNamibiaEvidenceMetadata,
 "POST /internal/namibia/calendar":createNamibiaCalendarDraft,
 "GET /internal/namibia/evidence":listNamibiaEvidenceMetadata,
 "GET /internal/namibia/calendar":listNamibiaCalendarDrafts,
 "GET /internal/namibia/audit":listNamibiaAuditEvents
});
const publicFlag=value=>value==="1";
const literal=(value,max)=>typeof value==="string"&&value.trim()===value&&value.length>0&&value.length<=max?value:null;
function rejectUntrustedIdentity(body){
 if(!body||typeof body!=="object"||Array.isArray(body))return false;
 const forbidden=["tenant_id","tenantId","user_id","userId","role","marketCode","authenticated","csrf_token","session"];
 return forbidden.some(key=>Object.hasOwn(body,key));
}
// Explicit sealed dependencies: no caller may pass in an arbitrary auth substitute.
// Actual authentication comes from existing server-side session tables.
export async function handleNamibiaInternalCandidate(request,env){
 if(!publicFlag(env?.NAMIBIA_INTERNAL_API_REHEARSAL_ENABLED)||
    env?.NAMIBIA_INTERNAL_API_MODE!=="isolated_candidate"||
    !env?.NA_CANDIDATE_DB||!env?.DB||!env?.SESSION_SECRET||
    !checkNamibiaIsolatedEnvironment(env).ok||
    marketActivationReadiness("NA").ready)return json({error:"namibia_internal_api_disabled"},404);
 const url=new URL(request.url);
 let configuredOrigin;
 try{configuredOrigin=new URL(env.PUBLIC_ORIGIN).origin}catch{return json({error:"internal_origin_not_configured"},503)}
 if(url.origin!==configuredOrigin)return json({error:"origin_mismatch"},403);
 const path=url.pathname.replace(/\/+$/,"")||"/";
 const key=request.method.toUpperCase()+" "+path;
 const action=fixedPaths[key];
 if(!action)return json({error:"not_found"},404);
 if(!originAllowed(request,env))return json({error:"origin_forbidden"},403);
 // Existing session DB is trusted. Never infer tenant/market from request values.
 let auth;
 try{auth=await authenticate(request,env)}catch{return json({error:"authentication_unavailable"},503)}
 if(!auth)return json({error:"unauthorized"},401);
 if(!["owner","manager"].includes(String(auth.role||"").toLowerCase()))return json({error:"forbidden"},403);
 // This is a staging-only allowlist, maintained server-side, never passed from HTTP.
 const allow=String(env.NA_CANDIDATE_TENANT_ALLOWLIST||"").split(",").map(x=>x.trim()).filter(Boolean);
 if(!allow.includes(String(auth.tenant_id)))return json({error:"tenant_not_enabled"},403);
 const principal={tenant_id:auth.tenant_id,user_id:auth.user_id,role:String(auth.role).toLowerCase(),marketCode:"NA"};
 if(request.method==="POST"){
   if(!csrfAllowed(request,auth))return json({error:"csrf_required"},403);
   if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type")||""))return json({error:"json_content_type_required"},415);
   let body;
   try{body=await readJson(request)}catch(e){return json({error:e.message},requestBodyErrorStatus(e))}
   if(rejectUntrustedIdentity(body))return json({error:"client_identity_override_forbidden"},400);
   const result=await action(env.NA_CANDIDATE_DB,principal,body);
   return result.ok?json(result.value,201):json({error:result.error},400);
 }
 if(url.searchParams.size!==1||!url.searchParams.has("entityRef"))return json({error:"invalid_query"},400);
 const entityRef=literal(url.searchParams.get("entityRef"),64);
 if(!entityRef)return json({error:"invalid_entity_reference"},400);
 const result=await action(env.NA_CANDIDATE_DB,principal,entityRef);
 return result.ok?json(result.value):json({error:result.error},400);
}
