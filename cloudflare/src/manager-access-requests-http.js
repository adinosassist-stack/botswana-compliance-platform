import {createManagerRequestCodeD1,resolveManagerRequestCodeD1} from './manager-request-codes.js';
import {provisionManagerAccessD1} from './manager-access-provisioning.js';
// Registered users request manager access; tenant owner reviews, NEVER auto-grants.
// Private staging candidate only. Caller supplies canonical authenticated session, CSRF, rate limit.
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9-]{1,128}$/.test(x);
const guard=sql=>`SELECT CASE WHEN (${sql}) THEN 1 ELSE abs(-9223372036854775808) END AS permitted`;
export function createManagerAccessRequestsHttp({db,origin,authenticate,verifyCsrf,rateLimit,newId=()=>crypto.randomUUID(),provisioningEnabled=false}={}){
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
  const issueCode=path==='/api/workspace/managers/access-requests/business-code'&&req.method==='POST';
  if(!submit&&!mine&&!inbox&&!decide&&!locations&&!provision&&!issueCode)return json(404,{error:'not_found'});
  if(provision&&provisioningEnabled!==true)return json(404,{error:'not_found'});
  if(new URL(req.url).origin!==origin)return json(403,{error:'origin_denied'});
  if((submit||decide||provision||issueCode)&&req.headers.get('origin')!==origin)return json(403,{error:'origin_denied'});
  const principal=await authenticate(req);
  if(!principal||!validId(principal.tenantId)||!validId(principal.userId))return json(401,{error:'unauthenticated'});
  if((submit||decide||provision||issueCode)&&!(await verifyCsrf(req,principal)))return json(403,{error:'csrf_denied'});
  if(!(await rateLimit(req,(decide||provision||issueCode)?'manager_request_review':'manager_request_self_service')))return json(429,{error:'rate_limited'});
  const owner=inbox||decide||provision||issueCode;
  if(owner&&principal.role!=='owner')return json(403,{error:'owner_required'});
  if(locations&&!['reviewer','auditor'].includes(principal.role))return json(403,{error:'ineligible_role'});
  let body={};
  if(submit||decide||provision||issueCode){
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
    const external=typeof body.businessCode==='string'&&body.businessCode.length>0;
    if(Object.keys(body).some(k=>!['locationId','reason','businessCode'].includes(k))||(!external&&!validId(body.locationId))||
      (body.reason!==undefined&&(typeof body.reason!=='string'||body.reason.length>500)))return json(400,{error:'invalid_request'});
    if(!external&&!['reviewer','auditor'].includes(principal.role))return json(403,{error:'ineligible_role'});
    const resolved=external?await resolveManagerRequestCodeD1(db,{code:body.businessCode,requesterUserId:userId}):null;
    const targetTenant=resolved?.tenantId||tenantId, targetLocation=resolved?.locationId||body.locationId;
    const id=newId();if(!validId(id))return json(503,{error:'request_unavailable'});
    await db.batch([
     db.prepare(guard(external
       ?`EXISTS(SELECT 1 FROM users WHERE id=?) AND EXISTS(SELECT 1 FROM workspace_manager_request_codes c JOIN operating_locations l ON l.id=c.location_id AND l.tenant_id=c.tenant_id AND l.active=1 JOIN memberships m ON m.tenant_id=c.tenant_id AND m.user_id=c.created_by_user_id AND m.role='owner' AND m.status='active' WHERE c.tenant_id=? AND c.location_id=? AND c.code_hash=? AND c.revoked_at IS NULL AND c.consumed_at IS NULL AND julianday(c.expires_at)>julianday('now')) AND NOT EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND role IN ('owner','manager'))`
       :`EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' AND role IN ('reviewer','auditor')) AND EXISTS(SELECT 1 FROM operating_locations WHERE tenant_id=? AND id=? AND active=1)`
      )).bind(...(external?[userId,targetTenant,targetLocation,resolved.codeHash,targetTenant,userId]:[tenantId,userId,tenantId,targetLocation])),
     db.prepare("INSERT INTO workspace_manager_access_requests(id,tenant_id,requester_user_id,location_id,reason) VALUES(?,?,?,?,?)").bind(id,targetTenant,userId,targetLocation,(body.reason||'').trim()),
     ...(external?[db.prepare("UPDATE workspace_manager_request_codes SET consumed_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND location_id=? AND code_hash=? AND revoked_at IS NULL AND consumed_at IS NULL AND julianday(expires_at)>julianday('now')").bind(targetTenant,targetLocation,resolved.codeHash)]:[])
    ]);
    return json(201,{ok:true,id,status:'pending',message:'Manager access requested; approval and provisioning required'});
   }
   if(mine){
    const rows=await db.prepare("SELECT id,location_id,status,created_at,reviewed_at FROM workspace_manager_access_requests WHERE requester_user_id=? ORDER BY created_at DESC LIMIT 20").bind(userId).all();
    return json(200,{ok:true,requests:rows.results||[]});
   }
   const membership=await db.prepare("SELECT 1 ok FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' AND role='owner'").bind(tenantId,userId).first();
   if(!membership?.ok)return json(403,{error:'owner_required'});
   if(inbox){
    const rows=await db.prepare("SELECT r.id,r.location_id,r.reason,r.status,r.created_at,u.email requester_email FROM workspace_manager_access_requests r JOIN users u ON u.id=r.requester_user_id WHERE r.tenant_id=? ORDER BY r.created_at DESC LIMIT 100").bind(tenantId).all();
    return json(200,{ok:true,requests:rows.results||[]});
   }
   if(issueCode){
    if(Object.keys(body).join(',')!=='locationId'||!validId(body.locationId))return json(400,{error:'invalid_request'});
    const result=await createManagerRequestCodeD1(db,{tenantId,ownerId:userId,locationId:body.locationId});
    return json(201,result);
   }
   if(provision){
    if(Object.keys(body).join(',')!=='requestId'||!validId(body.requestId))return json(400,{error:'invalid_request'});
    const result=await provisionManagerAccessD1(db,{tenantId,ownerId:userId,requestId:body.requestId});
    return json(200,result);
   }
   if(Object.keys(body).sort().join(',')!=='decision,requestId'||!validId(body.requestId)||!['approve','reject'].includes(body.decision))return json(400,{error:'invalid_request'});
   const next=body.decision==='approve'?'approved_for_provisioning':'rejected';
   await db.batch([
    db.prepare(guard(`EXISTS(SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' AND role='owner') AND EXISTS(SELECT 1 FROM workspace_manager_access_requests r LEFT JOIN memberships m ON m.tenant_id=r.tenant_id AND m.user_id=r.requester_user_id JOIN users u ON u.id=r.requester_user_id WHERE r.tenant_id=? AND r.id=? AND r.status='pending' AND (m.user_id IS NULL OR (m.status='active' AND m.role IN ('reviewer','auditor'))))`)).bind(tenantId,userId,tenantId,body.requestId),
    db.prepare("UPDATE workspace_manager_access_requests SET status=?,reviewed_by_user_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=? AND status='pending'").bind(next,userId,tenantId,body.requestId)
   ]);
   // Approval is a REVIEW decision only. Never update memberships, sessions, grants or invite status here.
   return json(200,{ok:true,status:next,managerActive:false});
  }catch{
   return json(409,{error:'request_unavailable'});
  }
 };
}
