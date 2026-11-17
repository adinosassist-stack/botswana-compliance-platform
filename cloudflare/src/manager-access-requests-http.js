import {provisionManagerAccessD1} from './manager-access-provisioning.js';
// Registered users request manager access; tenant owner reviews, NEVER auto-grants.
// Private staging candidate only. Caller supplies canonical authenticated session, CSRF, rate limit.
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9-]{1,128}$/.test(x);
const guard=sql=>`SELECT CASE WHEN (${sql}) THEN 1 ELSE abs(-9223372036854775808) END AS permitted`;
export function createManagerAccessRequestsHttp({db,origin,authenticate,verifyCsrf,rateLimit,newId=()=>crypto.randomUUID()}={}){
 if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function'||!origin||new URL(origin).protocol!=='https:'||
  [authenticate,verifyCsrf,rateLimit,newId].some(x=>typeof x!=='function'))throw new TypeError('dependencies_required');
 return async req=>{
  const path=new URL(req.url).pathname;
  const submit=path==='/api/workspace/managers/access-requests'&&req.method==='POST';
  const locations=path==='/api/workspace/managers/request-locations'&&req.method==='GET';
  const mine=path==='/api/workspace/managers/access-requests/mine'&&req.method==='GET';
  const inbox=path==='/api/workspace/managers/access-requests/inbox'&&req.method==='GET';
  const decide=path==='/api/workspace/managers/access-requests/decide'&&req.method==='POST';
  const provision=path==='/api/workspace/managers/access-requests/provision'&&req.method==='POST';
  if(!submit&&!mine&&!inbox&&!decide&&!locations&&!provision)return json(404,{error:'not_found'});
  if(new URL(req.url).origin!==origin)return json(403,{error:'origin_denied'});
  if((submit||decide||provision)&&req.headers.get('origin')!==origin)return json(403,{error:'origin_denied'});
  const principal=await authenticate(req);
  if(!principal||!validId(principal.tenantId)||!validId(principal.userId))return json(401,{error:'unauthenticated'});
  if((submit||decide||provision)&&!(await verifyCsrf(req,principal)))return json(403,{error:'csrf_denied'});
  if(!(await rateLimit(req,(decide||provision)?'manager_request_review':'manager_request_self_service')))return json(429,{error:'rate_limited'});
  const owner=inbox||decide||provision;
  if(owner&&principal.role!=='owner')return json(403,{error:'owner_required'});
  if((submit||mine||locations)&&!['reviewer','auditor'].includes(principal.role))return json(403,{error:'ineligible_role'});
  let body={};
  if(submit||decide||provision){
   if(!String(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return json(415,{error:'invalid_content_type'});
   const size=Number(req.headers.get('content-length')||0);
   if(!Number.isFinite(size)||size>1024)return json(413,{error:'request_too_large'});
   try{
    const bytes=new Uint8Array(await req.arrayBuffer());
    if(bytes.length>1024)return json(413,{error:'request_too_large'});
    body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!body||typeof body!=='object'||Array.isArray(body))throw Error('bad_json');
   }catch{return json(400,{error:'invalid_request'});}
  }
  const {tenantId,userId}=principal;
  try{
   if(locations){
    const active=await db.prepare("SELECT 1 ok FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' AND role IN ('reviewer','auditor')").bind(tenantId,userId).first();
    if(!active?.ok)return json(403,{error:'membership_required'});
    const rows=await db.prepare("SELECT id,name,town FROM operating_locations WHERE tenant_id=? AND active=1 ORDER BY name,id LIMIT 100").bind(tenantId).all();
    return json(200,{ok:true,locations:rows.results||[]});
   }
   if(submit){
    if(Object.keys(body).some(k=>!['locationId','reason'].includes(k))||!validId(body.locationId)||
      (body.reason!==undefined&&(typeof body.reason!=='string'||body.reason.length>500)))return json(400,{error:'invalid_request'});
    const id=newId();if(!validId(id))return json(503,{error:'request_unavailable'});
    await db.batch([
     db.prepare(guard(`EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' AND role IN ('reviewer','auditor')) AND EXISTS(SELECT 1 FROM operating_locations WHERE tenant_id=? AND id=? AND active=1)`)).bind(tenantId,userId,tenantId,body.locationId),
     db.prepare("INSERT INTO workspace_manager_access_requests(id,tenant_id,requester_user_id,location_id,reason) VALUES(?,?,?,?,?)").bind(id,tenantId,userId,body.locationId,(body.reason||'').trim())
    ]);
    return json(201,{ok:true,id,status:'pending',message:'Manager access requested; approval and provisioning required'});
   }
   if(mine){
    const active=await db.prepare("SELECT 1 ok FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' AND role IN ('reviewer','auditor')").bind(tenantId,userId).first();
    if(!active?.ok)return json(403,{error:'membership_required'});
    const rows=await db.prepare("SELECT id,location_id,status,created_at,reviewed_at FROM workspace_manager_access_requests WHERE tenant_id=? AND requester_user_id=? ORDER BY created_at DESC LIMIT 20").bind(tenantId,userId).all();
    return json(200,{ok:true,requests:rows.results||[]});
   }
   const membership=await db.prepare("SELECT 1 ok FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' AND role='owner'").bind(tenantId,userId).first();
   if(!membership?.ok)return json(403,{error:'owner_required'});
   if(inbox){
    const rows=await db.prepare("SELECT r.id,r.location_id,r.reason,r.status,r.created_at,u.email requester_email FROM workspace_manager_access_requests r JOIN users u ON u.id=r.requester_user_id WHERE r.tenant_id=? ORDER BY r.created_at DESC LIMIT 100").bind(tenantId).all();
    return json(200,{ok:true,requests:rows.results||[]});
   }
   if(provision){
    if(Object.keys(body).join(',')!=='requestId'||!validId(body.requestId))return json(400,{error:'invalid_request'});
    const result=await provisionManagerAccessD1(db,{tenantId,ownerId:userId,requestId:body.requestId});
    return json(200,result);
   }
   if(Object.keys(body).sort().join(',')!=='decision,requestId'||!validId(body.requestId)||!['approve','reject'].includes(body.decision))return json(400,{error:'invalid_request'});
   const next=body.decision==='approve'?'approved_for_provisioning':'rejected';
   await db.batch([
    db.prepare(guard(`EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' AND role='owner') AND EXISTS(SELECT 1 FROM workspace_manager_access_requests r JOIN memberships m ON m.tenant_id=r.tenant_id AND m.user_id=r.requester_user_id WHERE r.tenant_id=? AND r.id=? AND r.status='pending' AND m.status='active' AND m.role IN ('reviewer','auditor'))`)).bind(tenantId,userId,tenantId,body.requestId),
    db.prepare("UPDATE workspace_manager_access_requests SET status=?,reviewed_by_user_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=? AND status='pending'").bind(next,userId,tenantId,body.requestId)
   ]);
   // Approval is a REVIEW decision only. Never update memberships, sessions, grants or invite status here.
   return json(200,{ok:true,status:next,managerActive:false});
  }catch{
   return json(409,{error:'request_unavailable'});
  }
 };
}
