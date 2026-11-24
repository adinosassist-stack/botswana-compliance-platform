// Staging-only directory. No production router imports; synthetic data only.
const valid=x=>typeof x==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(x);
const reply=(status,body)=>Response.json(body,{status,headers:{"cache-control":"no-store","x-robots-tag":"noindex, nofollow"}});
const fail=(status,error)=>reply(status,{ok:false,error});
export async function conversationThreadDirectory({request,env,readSession,id=()=>crypto.randomUUID()}={}){
 if(env?.APP_ENV!=="staging"||env?.DEPLOYMENT_ENV!=="staging"||env?.DEPLOYMENT_PROFILE!=="conversation-staging"||env?.CONVERSATION_HISTORY_STAGING_ENABLED!=="true")return fail(404,"not_found");
 if(!env.CONVERSATION_STAGING_ORIGIN||new URL(request.url).origin!==env.CONVERSATION_STAGING_ORIGIN)return fail(403,"origin_mismatch");
 if(!["GET","POST"].includes(request.method))return fail(405,"method_not_allowed");
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
   const result=await env.DB.prepare("SELECT c.id,c.created_at,c.updated_at FROM thebe_conversations_rehearsal c JOIN thebe_conversation_members_rehearsal m ON m.tenant_id=c.tenant_id AND m.conversation_id=c.id WHERE c.tenant_id=? AND m.user_id=? AND m.active=1 AND c.status='active' AND m.role IN ('owner','admin','member','viewer') ORDER BY c.updated_at DESC,c.id DESC LIMIT 51").bind(tenantId,userId).all();
   if(result?.success!==true||!Array.isArray(result.results))return fail(503,"storage_unavailable");
   return reply(200,{ok:true,items:result.results.slice(0,50),truncated:result.results.length>50});
  }
  if(session.csrfVerified!==true||request.headers.get("origin")!==env.CONVERSATION_STAGING_ORIGIN)return fail(403,"csrf_required");
  if(request.body!==null)return fail(400,"body_not_supported");
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
