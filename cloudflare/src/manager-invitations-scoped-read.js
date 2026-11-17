// #2578: explicitly scoped, read-only manager APIs. Private staging only.
// Never expose existing workspace APIs to invited managers until ALL business routes
// implement tenant+location row-level authorization. No writes here.
const reply=(status,payload)=>new Response(JSON.stringify(payload),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'
}});
function scope(identity){
 if(!identity||identity.role!=='manager'||typeof identity.tenantId!=='string'||!identity.tenantId||
   typeof identity.userId!=='string'||!identity.userId)throw new Error('forbidden');
 return {tenantId:identity.tenantId,userId:identity.userId};
}
export function createManagerScopedReadHttp({db}={}){
 if(!db||typeof db.prepare!=='function')throw new TypeError('d1_binding_required');
 return async function(req,identity){
  const path=new URL(req.url).pathname;
  if(req.method!=='GET'||!['/api/workspace/managers/my-locations','/api/workspace/managers/my-reports'].includes(path))
   return reply(404,{error:'not_found'});
  let actor;
  try{actor=scope(identity);}catch{return reply(403,{error:'forbidden'});}
  try{
   // Always revalidate membership and the accepted invitation. Do not trust
   // stale session values or a display branch string.
   const member=await db.prepare("SELECT 1 ok FROM memberships m JOIN workspace_manager_invites i ON i.tenant_id=m.tenant_id AND i.accepted_by_user_id=m.user_id AND i.status='accepted' WHERE m.tenant_id=? AND m.user_id=? AND m.role='manager' AND m.status='active' LIMIT 1").bind(actor.tenantId,actor.userId).first();
   if(!member?.ok)return reply(403,{error:'forbidden'});
   if(path==='/api/workspace/managers/my-locations'){
    const r=await db.prepare("SELECT l.id,l.name,l.code,l.town FROM workspace_manager_location_grants g JOIN operating_locations l ON l.id=g.location_id AND l.tenant_id=g.tenant_id AND l.active=1 WHERE g.tenant_id=? AND g.manager_user_id=? AND g.status='active' ORDER BY l.name,l.id LIMIT 50").bind(actor.tenantId,actor.userId).all();
    return reply(200,{ok:true,locations:r.results||[]});
   }
   const r=await db.prepare("SELECT r.id,r.location_id,r.report_date,r.work_summary,r.wins,r.blockers,r.incidents,r.next_plan,r.needs_attention,r.submitted_at FROM daily_employee_reports r JOIN workspace_manager_location_grants g ON g.tenant_id=r.tenant_id AND g.location_id=r.location_id AND g.manager_user_id=? AND g.status='active' JOIN operating_locations l ON l.tenant_id=r.tenant_id AND l.id=r.location_id AND l.active=1 WHERE r.tenant_id=? ORDER BY r.report_date DESC,r.submitted_at DESC,r.id DESC LIMIT 50").bind(actor.userId,actor.tenantId).all();
   return reply(200,{ok:true,reports:r.results||[]});
  }catch{return reply(503,{error:'scoped_access_unavailable'});}
 };
}
