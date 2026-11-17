// #2578 private staging owner directory. Never returns activation tokens or hashes.
// Tenant identity comes from authenticated Worker session, not browser parameters.
const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff','referrer-policy':'no-referrer'
}});
export function createManagerOwnerDirectoryHttp({db}={}){
 if(!db||typeof db.prepare!=='function')throw new TypeError('d1_binding_required');
 return async(req,principal)=>{
  if(req.method!=='GET'||new URL(req.url).pathname!=='/api/workspace/managers/directory')
   return json(404,{error:'not_found'});
  if(!principal||principal.role!=='owner'||!principal.tenantId||!principal.userId)
   return json(403,{error:'forbidden'});
  try{
   const owner=await db.prepare("SELECT 1 ok FROM memberships WHERE tenant_id=? AND user_id=? AND role='owner' AND status='active' LIMIT 1").bind(principal.tenantId,principal.userId).first();
   if(!owner?.ok)return json(403,{error:'forbidden'});
   const invites=await db.prepare("SELECT i.id,i.email,i.branch_name branch,i.status,i.expires_at,i.created_at,i.accepted_by_user_id manager_user_id,m.status membership_status FROM workspace_manager_invites i LEFT JOIN memberships m ON m.tenant_id=i.tenant_id AND m.user_id=i.accepted_by_user_id AND m.role='manager' WHERE i.tenant_id=? ORDER BY i.created_at DESC,i.id DESC LIMIT 100").bind(principal.tenantId).all();
   const locations=await db.prepare("SELECT id,name,town FROM operating_locations WHERE tenant_id=? AND active=1 ORDER BY name,id LIMIT 100").bind(principal.tenantId).all();
   const grants=await db.prepare("SELECT g.manager_user_id,g.location_id,g.status FROM workspace_manager_location_grants g JOIN operating_locations l ON l.id=g.location_id AND l.tenant_id=g.tenant_id WHERE g.tenant_id=? AND l.active=1 ORDER BY g.manager_user_id,g.location_id LIMIT 300").bind(principal.tenantId).all();
   return json(200,{ok:true,invites:invites.results||[],locations:locations.results||[],grants:grants.results||[]});
  }catch{return json(503,{error:'directory_unavailable'});}
 };
}
