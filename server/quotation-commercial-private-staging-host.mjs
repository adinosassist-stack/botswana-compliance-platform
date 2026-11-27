/** Qualified SOURCE composition only. No public entrypoint or provisioning.
 * Reuses the existing commercial handler and synthetic-session verifier.
 */
import {createQuotationPrivateD1SessionVerifier} from './quotation-private-d1-session-verifier.mjs';
import {handleQuotationCommercialRequest} from '../cloudflare/src/quotation-commercial-workflow.js';
const QUOTE_DB='aec227e9-b0f2-4b00-8de0-105465c4e2d6';
const AUTH_DB='d7ad8e99-2ee4-446c-9358-0e186031571d';
const ASSETS=new Set(['/js/quotation-commercial-workspace.mjs','/js/quotation-customizable-page.mjs','/js/quotation-customizable-page-model.mjs','/js/essentials-document-share.mjs']);
const response=(status,error)=>Response.json({error},{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
async function admissionTicket(request){
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/x-www-form-urlencoded')return null;
 const reader=request.body?.getReader();if(!reader)return null;
 const chunks=[];let size=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024)return null;chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  const fields=[...new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(bytes))];
  return fields.length===1&&fields[0][0]==='ticket'?fields[0][1]:null;
 }catch{return null}finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
export function createQuotationCommercialPrivateStagingHost({env}={}){
 if(env?.APP_ENV!=='quotation-private-staging'||env.QUOTATION_COMMERCIAL_STAGE_ENABLED!=='true')throw Error('commercial_stage_disabled');
 if(env.QUOTATION_COMMERCIAL_STAGE_DB_ID!==QUOTE_DB||env.QUOTATION_COMMERCIAL_STAGE_AUTH_DB_ID!==AUTH_DB||typeof env.DB?.prepare!=='function'||typeof env.QUOTATION_PDF_RENDERER?.fetch!=='function'||typeof env.ASSETS?.fetch!=='function')throw Error('commercial_stage_unconfigured');
 let origin;try{const u=new URL(env.QUOTATION_COMMERCIAL_PRIVATE_ORIGIN);if(u.protocol!=='https:'||u.hostname==='www.thebedesk.com'||u.hostname==='thebedesk.com'||!u.hostname.endsWith('.thebedesk.com')||u.port||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error();origin=u.origin;}catch{throw Error('commercial_stage_private_origin_required')}
 const verifier=createQuotationPrivateD1SessionVerifier({enabled:true,environment:'quotation-private-staging',authDb:env.AUTH_DB,sessionSecret:env.QUOTATION_SYNTHETIC_SESSION_SECRET,expectedTenantId:env.QUOTATION_SYNTHETIC_TENANT_ID});
 return {async fetch(request){
  const url=new URL(request.url);
  if(url.origin!==origin)return response(404,'not_found');
  if(!['GET','PUT','POST'].includes(request.method))return response(405,'method_not_allowed');
  if(request.headers.get('origin')&&request.headers.get('origin')!==origin)return response(403,'origin_denied');
  // This host is reachable only through the independently JWT-verifying Access
  // gateway. Admission additionally needs an operator-created one-use ticket.
  if(url.pathname==='/private/quotation-test-session'){
   // Keep a concrete Origin on the native same-origin form POST. Cross-origin
   // destinations still receive no referrer, and tickets never enter URLs.
   const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'same-origin','x-robots-tag':'noindex, nofollow'};
   if(request.method==='GET')return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private quotation test</title><main><h1>Start private quotation test</h1><p>Use the short-lived invitation supplied for this test. It can be used once.</p><form method="post" action="/private/quotation-test-session"><label>Staging invitation <input name="ticket" type="password" autocomplete="one-time-code" minlength="43" maxlength="128" required></label><button type="submit">Start private test session</button></form></main></html>',{headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
   if(request.method!=='POST')return response(405,'method_not_allowed');
   if(request.headers.get('origin')!==origin||!['same-origin',null].includes(request.headers.get('sec-fetch-site')))return response(403,'origin_denied');
   const admitted=await verifier.exchangeSyntheticAdmission({ticket:await admissionTicket(request)});
   if(!admitted)return response(401,'staging_invitation_invalid');
   const seconds=Math.min(900,Math.floor((admitted.expiresAt-Date.now())/1000));
   if(seconds<1)return response(401,'staging_invitation_invalid');
   return new Response(null,{status:303,headers:{...headers,location:'/app/quotations/customer-ready/','set-cookie':'__Host-bw_session='+admitted.cookie+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age='+seconds}});
  }
  const session=await verifier.readVerifiedBrowserSession({request});
  if(!session)return response(401,'synthetic_session_required');
  if(session.role!=='owner')return response(403,'owner_required');
  const membership=await verifier.verifyActiveMembership({actor:session,tenantId:session.tenantId,userId:session.userId});
  if(membership?.active!==true)return response(403,'membership_denied');
  if(request.method!=='GET'&&!(await verifier.verifyMutation({request,actor:session,companyId:session.tenantId})))return response(403,'csrf_denied');
  if(url.pathname==='/api/auth/me'&&request.method==='GET')return Response.json({user:{id:session.userId,tenantId:session.tenantId,role:'owner',onboardingComplete:true},csrfToken:session.csrfToken},{headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  if(url.pathname==='/api/finance/customers'&&request.method==='GET'){
   const rows=await env.DB.prepare("SELECT id,name,status FROM finance_customers WHERE tenant_id=? AND status='active' ORDER BY name,id LIMIT 100").bind(session.tenantId).all();
   return Response.json({items:rows.results||[]},{headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  }
  if(url.pathname.startsWith('/api/quotation/'))return await handleQuotationCommercialRequest({request,env:{DB:env.DB,QUOTATION_COMMERCIAL_ENABLED:'true',QUOTATION_PDF_RENDERER:env.QUOTATION_PDF_RENDERER},auth:{tenant_id:session.tenantId,user_id:session.userId,role:'owner',csrf_token:session.csrfToken}})||response(404,'not_found');
  if(ASSETS.has(url.pathname)&&request.method==='GET'){
   const asset=await env.ASSETS.fetch(request);
   return new Response(asset.body,{status:asset.status,headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
  }
  if(url.pathname!=='/app/quotations/customer-ready/'||request.method!=='GET')return response(404,'not_found');
  const nonce=crypto.randomUUID();
  const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private quotation staging</title><main id="quotation-stage"></main><script type="module" nonce="'+nonce+'">import {mountQuotationCommercialWorkspace} from "/js/quotation-commercial-workspace.mjs";const workspace=await mountQuotationCommercialWorkspace(document.getElementById("quotation-stage"),{capability:{enabled:true,authenticated:true,canEditQuotations:true,canCustomizeQuotationPreview:true,canPrepareCustomerQuotation:true}});addEventListener("pagehide",()=>workspace.destroy(),{once:true});</script></html>';
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow','content-security-policy':"default-src 'none'; script-src 'self' 'nonce-"+nonce+"'; style-src 'unsafe-inline'; connect-src 'self'; img-src blob:; base-uri 'none'; frame-ancestors 'none'"}});
 }};
}
