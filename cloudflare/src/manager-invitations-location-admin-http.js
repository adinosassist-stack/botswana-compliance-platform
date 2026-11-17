// #2578 — owner-managed location grants, staging-only host mount.
// Tenant and owner IDs are bound to canonical authenticated Worker session.
import {grantManagerLocationD1,revokeManagerLocationD1} from './manager-invitations-location-grants.js';
const respond=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'
}});
export function createManagerLocationAdminHttp({db,origin,authenticateOwner,verifyCsrf,rateLimit}={}){
 if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function'||[authenticateOwner,verifyCsrf,rateLimit].some(f=>typeof f!=='function'))
  throw new TypeError('dependencies_required');
 if(typeof origin!=='string'||!origin.startsWith('https://'))throw new TypeError('secure_origin_required');
 return async req=>{
  const pathname=new URL(req.url).pathname;
  const grant=pathname==='/api/workspace/managers/locations/grant'&&req.method==='POST';
  const revoke=pathname==='/api/workspace/managers/locations/revoke'&&req.method==='POST';
  if(!grant&&!revoke)return respond(404,{error:'not_found'});
  if(new URL(req.url).origin!==origin||req.headers.get('origin')!==origin)return respond(403,{error:'origin_denied'});
  const a=await authenticateOwner(req);
  if(!a||a.role!=='owner'||a.membershipStatus!=='active'||!a.tenantId||!a.userId)return respond(403,{error:'forbidden'});
  if(!(await verifyCsrf(req,a)))return respond(403,{error:'csrf_denied'});
  if(!(await rateLimit(req,'manager_location_admin')))return respond(429,{error:'rate_limited'});
  if(!String(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return respond(415,{error:'invalid_content_type'});
  const length=Number(req.headers.get('content-length')||0);
  if(!Number.isFinite(length)||length>2048)return respond(413,{error:'request_too_large'});
  let body;
  try{const bytes=new Uint8Array(await req.arrayBuffer());if(bytes.length>2048)return respond(413,{error:'request_too_large'});
   body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return respond(400,{error:'invalid_request'});}
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).sort().join(',')!=='locationId,managerId')return respond(400,{error:'invalid_request'});
  const {locationId,managerId}=body;
  if([locationId,managerId].some(x=>typeof x!=='string'||!/^[a-z0-9-]{1,128}$/i.test(x)))return respond(400,{error:'invalid_request'});
  try{
   const input={tenantId:a.tenantId,ownerId:a.userId,locationId,managerId};
   if(grant)await grantManagerLocationD1(db,input);
   else await revokeManagerLocationD1(db,input);
   return respond(200,{ok:true});
  }catch{return respond(400,{error:'action_unavailable'});}
 };
}
