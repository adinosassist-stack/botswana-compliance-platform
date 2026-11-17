/**
 * Inert quotation-auth private rehearsal Worker candidate. SOURCE ONLY.
 * A source file does not create routes, public URLs, Worker versions or bindings.
 * Separate approved Cloudflare deployment and internal caller are prerequisites.
 */
import {createQuotationPrivateD1SessionVerifier}
 from './quotation-private-d1-session-verifier.mjs';
import {createQuotationPrivateHostSessionGate}
 from './quotation-private-host-session-gate.mjs';
const headers={'cache-control':'private, no-store',
 'content-type':'application/json; charset=utf-8',
 'x-content-type-options':'nosniff'};
const no=()=>new Response(JSON.stringify({ok:false,error:'not_found'}),
 {status:404,headers});
function same(a,b){
 if(typeof a!=='string'||typeof b!=='string'||a.length<32||
    a.length!==b.length||a.length>256)return false;
 let difference=0;
 for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
 return difference===0;
}
function originValid(value){
 if(typeof value!=='string')return false;
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&!u.username&&!u.password&&
   u.pathname==='/'&&!u.search&&!u.hash&&
   (u.hostname.endsWith('.test')||u.hostname.endsWith('.invalid'));
 }catch{return false}
}
export async function handlePrivateQuotationAuthRehearsal(request,env){
 if(!(request instanceof Request)||!env||
    env.QUOTATION_PRIVATE_REHEARSAL_ENABLED!=='synthetic-internal-only'||
    env.QUOTATION_PRIVATE_REHEARSAL_ENVIRONMENT!=='quotation-private-staging')
  return no();
 const origin=env.QUOTATION_PRIVATE_REHEARSAL_ORIGIN;
 const caller=env.QUOTATION_PRIVATE_REHEARSAL_CALLER_SECRET;
 const hmac=env.QUOTATION_PRIVATE_REHEARSAL_SESSION_SECRET;
 if(!originValid(origin)||typeof hmac!=='string'||hmac.length<32||
    caller===hmac||
    !same(caller,request.headers.get('x-quotation-private-caller')))
  return no();
 let url;
 try{url=new URL(request.url)}catch{return no()}
 if(url.origin!==new URL(origin).origin||
    url.pathname!=='/rehearsal/synthetic'||
    !['GET','POST'].includes(request.method.toUpperCase()))
  return no();
 try{
  const verifier=createQuotationPrivateD1SessionVerifier({
   enabled:true,environment:'quotation-private-staging',
   authDb:env.AUTH_DB,sessionSecret:hmac,
   expectedTenantId:env.QUOTATION_PRIVATE_REHEARSAL_TENANT_ID
  });
  const gate=createQuotationPrivateHostSessionGate({
   enabled:true,environment:'quotation-private-staging',
   expectedTenantId:env.QUOTATION_PRIVATE_REHEARSAL_TENANT_ID,
   allowedPrivateOrigin:origin,...verifier,
   quotationHandlers:{async handle({actor}){
    return new Response(JSON.stringify({ok:true,synthetic:true,role:actor.role}),
     {status:200,headers});
   }}
  });
  return await gate.handle(request);
 }catch{return no()}
}
/* Default is inert; no Cloudflare deployment or runtime flags authorized. */
export default Object.freeze({fetch:handlePrivateQuotationAuthRehearsal});
