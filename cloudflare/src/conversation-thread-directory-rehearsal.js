// Staging-only directory. No production router imports; synthetic data only.
import {readGeneralAiJsonBody} from "./general-ai-request-body.js";

const valid=x=>typeof x==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(x);
const reply=(status,body)=>Response.json(body,{status,headers:{"cache-control":"no-store","x-robots-tag":"noindex, nofollow"}});
const fail=(status,error)=>reply(status,{ok:false,error});
const ownedActiveThread="tenant_id=? AND id=? AND status='active' AND EXISTS (SELECT 1 FROM thebe_conversation_members_rehearsal WHERE tenant_id=? AND conversation_id=? AND user_id=? AND role='owner' AND active=1)";

async function hasEmptyBody(request){
 if(request.body===null)return true;
 // Hosted Workers can represent a bodyless mutation as an empty stream.
 const reader=request.body.getReader();
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)return true;
   if(value.byteLength){
    await reader.cancel().catch(()=>{});
    return false;
   }
  }
 }catch{return false}
 finally{reader.releaseLock()}
}

export async function conversationThreadDirectory({request,env,readSession,id=()=>crypto.randomUUID()}={}){
 if(env?.APP_ENV!=="staging"||env?.DEPLOYMENT_ENV!=="staging"||env?.DEPLOYMENT_PROFILE!=="conversation-staging"||env?.CONVERSATION_HISTORY_STAGING_ENABLED!=="true")return fail(404,"not_found");
 const url=new URL(request.url);
 if(!env.CONVERSATION_STAGING_ORIGIN||url.origin!==env.CONVERSATION_STAGING_ORIGIN)return fail(403,"origin_mismatch");
 if(!["GET","POST","PATCH","DELETE"].includes(request.method))return fail(405,"method_not_allowed");
 if(env.CONVERSATION_STAGING_D1_ID!=="95c48030-0395-44cb-aa95-622beaf4efdf"||!env.DB?.prepare)return fail(503,"staging_database_identity_required");
 try{
  const marker=await env.DB.prepare("SELECT COUNT(*) AS marker_count, MIN(database_uuid) AS database_uuid FROM thebe_conversation_staging_identity").first();
  if(Number(marker?.marker_count)!==1||marker?.database_uuid!==env.CONVERSATION_STAGING_D1_ID)return fail(503,"staging_database_identity_required");
 }catch{return fail(503,"staging_database_identity_required")}
 let session;
 try{session=await readSession({request,env})}catch{return fail(401,"unauthenticated")}
 if(session?.authenticated!==true||session.active!==true||!valid(session.tenantId)||!valid(session.userId))return fail(401,"unauthenticated");
 const {tenantId,userId}=session;
 try{
  if(request.method==="GET"){
   const search=url.searchParams.get("q")?.trim()??"";
   if([...search].length>120||/[\u0000-\u001f\u007f-\u009f]/u.test(search))return fail(400,"invalid_search");
   const result=await env.DB.prepare("SELECT c.id,c.title,c.created_at,c.updated_at FROM thebe_conversations_rehearsal c JOIN thebe_conversation_members_rehearsal m ON m.tenant_id=c.tenant_id AND m.conversation_id=c.id WHERE c.tenant_id=? AND m.user_id=? AND m.active=1 AND c.status='active' AND m.role IN ('owner','admin','member','viewer') AND (?='' OR instr(lower(c.title),lower(?))>0) ORDER BY c.updated_at DESC,c.id DESC LIMIT 51").bind(tenantId,userId,search,search).all();
   if(result?.success!==true||!Array.isArray(result.results))return fail(503,"storage_unavailable");
   return reply(200,{ok:true,items:result.results.slice(0,50),truncated:result.results.length>50});
  }
  if(session.csrfVerified!==true||request.headers.get("origin")!==env.CONVERSATION_STAGING_ORIGIN)return fail(403,"csrf_required");
  if(request.method!=="PATCH"&&!await hasEmptyBody(request))return fail(400,"body_not_supported");
  if(request.method==="PATCH"||request.method==="DELETE"){
   const thread=url.searchParams.get("threadId");
   if(!valid(thread))return fail(400,"invalid_thread");
   let title;
   if(request.method==="PATCH"){
    if(request.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")return fail(415,"json_required");
    const body=await readGeneralAiJsonBody(request,2048);
    if(!body.ok)return fail(body.status,body.error);
    title=typeof body.value?.title==="string"?body.value.title.trim():"";
    if(!title||[...title].length>120||/[\u0000-\u001f\u007f-\u009f]/u.test(title)||Object.keys(body.value).length!==1)return fail(400,"invalid_title");
   }
   const values=[tenantId,thread,tenantId,thread,userId];
   const result=await (title===undefined
    ?env.DB.prepare(`UPDATE thebe_conversations_rehearsal SET status='deleted',updated_at=CURRENT_TIMESTAMP WHERE ${ownedActiveThread}`).bind(...values)
    :env.DB.prepare(`UPDATE thebe_conversations_rehearsal SET title=?,updated_at=CURRENT_TIMESTAMP WHERE ${ownedActiveThread}`).bind(title,...values)).run();
   if(result?.success!==true||!Number.isInteger(result.meta?.changes))return fail(503,"storage_unavailable");
   return result.meta.changes===1?reply(200,{ok:true,id:thread,...(title===undefined?{}:{title})}):fail(404,"not_found");
  }
  if(typeof env.DB.batch!=="function")return fail(503,"storage_unavailable");
  const thread=id();
  if(!valid(thread))return fail(503,"storage_unavailable");
  // D1 batch is transactional: no orphan thread if member insertion fails.
  const result=await env.DB.batch([
   env.DB.prepare("INSERT INTO thebe_conversations_rehearsal(tenant_id,id,created_by_user_id,status) VALUES(?,?,?,'active')").bind(tenantId,thread,userId),
   env.DB.prepare("INSERT INTO thebe_conversation_members_rehearsal(tenant_id,conversation_id,user_id,role,active) VALUES(?,?,?,'owner',1)").bind(tenantId,thread,userId)
  ]);
  if(!Array.isArray(result)||result.length!==2||result.some(x=>x?.success!==true||Number(x?.meta?.changes)!==1))return fail(503,"storage_unavailable");
  return reply(201,{ok:true,id:thread});
 }catch{return fail(503,"storage_unavailable")}
}
