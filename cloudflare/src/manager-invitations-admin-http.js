// #2578: staging-only manager access administration adapter.
// The canonical Worker must supply an authenticated owner and verified CSRF.
import {revokeManagerInviteD1,suspendManagerMembershipD1} from './manager-invitations-revocation.js';
const reply=(code,body)=>new Response(JSON.stringify(body),{status:code,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const fail=(code,status)=>reply(status,{ok:false,error:code});
export function createManagerAccessAdminHttp({db,origin,authenticateOwner,verifyCsrf,rateLimit}={}){
 if(!db||typeof db.batch!=='function'||typeof db.prepare!=='function'||[authenticateOwner,verifyCsrf,rateLimit].some(fn=>typeof fn!=='function'))throw new TypeError('manager_admin_dependencies_required');
 if(typeof origin!=='string'||!/^https:\/\//.test(origin))throw new TypeError('secure_origin_required');
 return async req=>{
  const path=new URL(req.url).pathname;
  const cancel=path==='/api/workspace/managers/invitations/revoke'&&req.method==='POST';
  const suspend=path==='/api/workspace/managers/suspend'&&req.method==='POST';
  if(!cancel&&!suspend)return fail('not_found',404);
  if(new URL(req.url).origin!==origin||req.headers.get('origin')!==origin)return fail('origin_denied',403);
  const principal=await authenticateOwner(req);
  if(!principal||principal.role!=='owner'||principal.membershipStatus!=='active'||!principal.tenantId||!principal.userId)return fail('forbidden',403);
  if(!(await verifyCsrf(req,principal)))return fail('csrf_denied',403);
  if(!(await rateLimit(req,'manager_access_admin')))return fail('rate_limited',429);
  if(!String(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return fail('invalid_content_type',415);
  const size=Number(req.headers.get('content-length')||0);
  if(!Number.isFinite(size)||size>1024)return fail('request_too_large',413);
  let body;
  try{const bytes=new Uint8Array(await req.arrayBuffer());if(bytes.byteLength>1024)return fail('request_too_large',413);body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return fail('invalid_request',400)}
  if(!body||typeof body!=='object'||Array.isArray(body))return fail('invalid_request',400);
  if(Object.keys(body).length!==1||Object.keys(body)[0]!== (cancel?'inviteId':'managerUserId'))return fail('invalid_request',400);
  const id=String(cancel?body.inviteId:body.managerUserId||'');
  if(!/^[a-z0-9-]{1,128}$/i.test(id))return fail('invalid_request',400);
  try{
   const data={tenantId:principal.tenantId,actorId:principal.userId};
   if(cancel)await revokeManagerInviteD1(db,{...data,inviteId:id});
   else await suspendManagerMembershipD1(db,{...data,managerUserId:id});
   return reply(200,{ok:true});
  }catch{return fail('action_unavailable',400)}
 };
}
