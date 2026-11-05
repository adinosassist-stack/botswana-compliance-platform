import {stagePopSubmission} from './payment-pop-staging-service.js';
import {listPopForPlatformOwner,readCleanPopForOwner} from './payment-pop-owner-review.js';
import {retireStoredPop,inspectPopRecovery} from './payment-pop-retention.js';
import {scanStoredPop} from './payment-pop-scanner-transport.js';
import {readPopBody,readPopJson} from './payment-pop-http-body.js';
import {MAX_POP_BYTES} from './payment-pop-validation.js';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const customer='/api/payments/manual-bank/pop/upload',owner='/api/platform/billing/pop/';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
function scope(data){const value={};for(const key of ['documentId','tenantId','orderId']){
 if(typeof data[key]!=='string'||!uuid.test(data[key]))throw Error('pop_invalid_scope');value[key]=data[key];}return value;}

// auth/platformOwner MUST be derived by the Worker's authenticated session and
// server-side billing-admin predicate. Never pass JSON/header identity here.
export async function handlePopHttp(request,env,{auth,platformOwner=false,scannerRequest}={}){
 const url=new URL(request.url),path=url.pathname;
 if(path!==customer&&!path.startsWith(owner))return null;
 if(env.APP_ENV!=='staging'||!['billing-staging-readonly','pop-http-staging'].includes(env.DEPLOYMENT_PROFILE)||env.POP_HTTP_STAGING_ENABLED!=='true')return reply({error:'pop_http_disabled'},503);
 if(!auth?.user_id||!auth?.tenant_id)return reply({error:'unauthenticated'},401);
 if(auth.role!=='owner')return reply({error:'forbidden'},403);
 const mutate=request.method!=='GET';
 if(mutate&&(!auth.csrf_token||request.headers.get('x-csrf-token')!==auth.csrf_token||request.headers.get('origin')!==env.PUBLIC_ORIGIN))return reply({error:'csrf_failed'},403);
 const actor={platformOwner:platformOwner===true,userId:auth.user_id};
 try{
  if(path===customer){
   if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
   const orderId=request.headers.get('x-pop-order-id');if(!uuid.test(orderId||''))throw Error('pop_invalid_scope');
   const result=await stagePopSubmission(env,{session:{tenantId:auth.tenant_id,userId:auth.user_id,role:auth.role},orderId,documentId:crypto.randomUUID(),
    requestKey:request.headers.get('idempotency-key'),name:request.headers.get('x-pop-filename'),contentType:request.headers.get('content-type'),bytes:await readPopBody(request,MAX_POP_BYTES)});
   return reply({...result,ok:true,message:'Receipt quarantined. Matching bank funds must be confirmed separately.'},202);
  }
  if(!actor.platformOwner)return reply({error:'pop_owner_forbidden'},403);
  const action=path.slice(owner.length);
  if(action==='receipts'&&request.method==='GET'){
   const orderId=url.searchParams.get('orderId');if(!uuid.test(orderId||''))throw Error('pop_invalid_scope');
   return reply(await listPopForPlatformOwner(env,{actor,orderId}));
  }
  if(action==='download'&&request.method==='GET')return await readCleanPopForOwner(env,{actor,...scope(Object.fromEntries(url.searchParams))});
  if(['scan','retire','recovery'].includes(action)&&request.method==='POST'){
   const data=await readPopJson(request),target=scope(data);
   const result=action==='scan'?await scanStoredPop(env,target,{request:scannerRequest}):action==='retire'?
    await retireStoredPop(env,{actor,...target,expectedSha256:data.expectedSha256,expectedEtag:data.expectedEtag,reason:data.reason}):
    await inspectPopRecovery(env,{actor,...target,reason:data.reason});
   return reply(result);
  }
  return reply({error:'pop_route_not_found'},404);
 }catch(error){
  const code=String(error?.message||'');
  if(code==='pop_body_too_large')return reply({error:code},413);
  if(code.startsWith('pop_invalid')||code.startsWith('invalid_pop')||code==='pop_signature_mismatch')return reply({error:'pop_invalid_request'},400);
  if(['pop_submission_forbidden','pop_owner_forbidden'].includes(code))return reply({error:'pop_forbidden'},403);
  if(['pop_not_reviewable','pop_order_not_found'].includes(code))return reply({error:'pop_not_available'},404);
  if(['pop_upload_in_progress','pop_idempotency_conflict','pop_scan_in_progress'].includes(code))return reply({error:'pop_conflict'},409);
  if(code==='pop_upload_quota_exceeded')return reply({error:'pop_upload_quota_exceeded'},429);
  return reply({error:'pop_service_unavailable'},503);
 }
}
