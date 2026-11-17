// Issue #2578: isolated HTTP adapter, deliberately NOT registered with worker.js.
// The host must authenticate the owner, validate CSRF and provide rate-limit enforcement.
// Never trust tenant, user or role from client payload.
import {normalizeManagerEmail} from './manager-invitations-foundation.js';
const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff','referrer-policy':'no-referrer'
}});
const fail=(code,status)=>json(status,{ok:false,error:code});
function safeOrigin(req,origin){
 if(typeof origin!=='string'||!origin.startsWith('https://'))return false;
 try{return new URL(req.url).origin===origin&&req.headers.get('origin')===origin;}
 catch{return false;}
}
export function createManagerInvitationsHttp({service,authenticateOwner,verifyCsrf,rateLimit,origin}={}){
 if(!service||typeof service.issue!=='function'||typeof service.activate!=='function'||
 [authenticateOwner,verifyCsrf,rateLimit].some(f=>typeof f!=='function'))throw new TypeError('invite_http_dependencies_required');
 if(!origin||new URL(origin).protocol!=='https:')throw new TypeError('secure_origin_required');
 return async function handle(req){
  const path=new URL(req.url).pathname;
  const ownerRoute=path==='/api/workspace/managers/invitations'&&req.method==='POST';
  const activateRoute=path==='/api/auth/manager-invite/accept'&&req.method==='POST';
  if(!ownerRoute&&!activateRoute)return fail('not_found',404);
  if(!safeOrigin(req,origin))return fail('origin_denied',403);
  if(!String(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))return fail('invalid_content_type',415);
  const max=ownerRoute?2048:4096;
  const length=Number(req.headers.get('content-length')||0);
  if(!Number.isFinite(length)||length>max)return fail('request_too_large',413);
  if(!(await rateLimit(req,ownerRoute?'manager_invite_owner':'manager_invite_activate')))return fail('rate_limited',429);
  let body;
  try{
   const bytes=new Uint8Array(await req.arrayBuffer());
   if(bytes.byteLength>max)return fail('request_too_large',413);
   body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(!body||typeof body!=='object'||Array.isArray(body))return fail('invalid_request',400);
  }catch{return fail('invalid_request',400);}
  try{
   if(ownerRoute){
    const principal=await authenticateOwner(req);
    if(!principal||principal.role!=='owner'||principal.membershipStatus!=='active')return fail('forbidden',403);
    if(!(await verifyCsrf(req,principal)))return fail('csrf_denied',403);
    if(Object.keys(body).some(k=>!['email','branch'].includes(k)))return fail('invalid_request',400);
    const invite=await service.issue({principal,input:{email:normalizeManagerEmail(body.email),branch:body.branch}});
    // Invite token is intentionally ONLY delivered to authenticated owner.
    return json(201,{ok:true,invitation:invite});
   }
   if(Object.keys(body).some(k=>!['token','password'].includes(k)))return fail('invalid_request',400);
   const output=await service.activate({token:body.token,password:body.password});
   return json(200,{ok:output.ok===true});
  }catch{
   // Do not expose whether a user or email exists.
   return fail('invite_unavailable',400);
  }
 };
}
