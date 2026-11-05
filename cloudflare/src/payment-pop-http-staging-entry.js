import core from './worker.js';
const ORIGIN='https://pop-staging.thebedesk.com';
const DB='812f9021-890b-41e6-8fa1-6001f90a9b53';
const reads=new Set(['/api/auth/me','/api/auth/csrf']);
const authWrites=new Set(['/api/auth/login','/api/auth/logout']);
const ownerReads=new Set(['receipts','download']);
const ownerWrites=new Set(['scan','retire','recovery']);
const reply=(error,status)=>Response.json({error},{status,headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
// Dedicated API-only staging wrapper. Never changes the billing read-only entry.
export function createPopHttpStagingEntry(delegate=core){return {async fetch(request,env,ctx){
 if(env?.APP_ENV!=='staging'||env.DEPLOYMENT_PROFILE!=='pop-http-staging'||env.POP_HTTP_STAGING_D1_ID!==DB||
    env.PUBLIC_ORIGIN!==ORIGIN||env.PUBLIC_APP_URL!==ORIGIN||!/^[a-f0-9]{40}$/.test(env.POP_HTTP_STAGING_SOURCE_SHA||''))return reply('pop_staging_configuration_required',503);
 const url=new URL(request.url),path=url.pathname;
 if(url.origin!==ORIGIN||url.searchParams.has('__thebe_api_path'))return reply('pop_staging_origin_required',403);
 const action=path.startsWith('/api/platform/billing/pop/')?path.slice('/api/platform/billing/pop/'.length):null;
 const allowed=request.method==='GET'&&(reads.has(path)||ownerReads.has(action))||request.method==='POST'&&
  (authWrites.has(path)||path==='/api/payments/manual-bank/pop/upload'||ownerWrites.has(action));
 if(!allowed)return reply('pop_staging_route_disabled',403);
 const runtime={};
 for(const key of ['DB','EVIDENCE','SESSION_SECRET','AUDIT_INTEGRITY_SECRET','PUBLIC_RATE_LIMITER','PLATFORM_ADMIN_EMAILS','APP_ENV','DEPLOYMENT_PROFILE','PUBLIC_ORIGIN','PUBLIC_APP_URL',
  'POP_HTTP_STAGING_ENABLED','POP_UPLOAD_STAGING_ENABLED','POP_SCAN_STAGING_ENABLED','POP_SCAN_TRANSPORT_STAGING_ENABLED','POP_OWNER_RETRIEVAL_STAGING_ENABLED','POP_RETENTION_STAGING_ENABLED','POP_RECOVERY_STAGING_ENABLED','POP_SCAN_SECRET','POP_SCANNER_ID','POP_SCAN_API_URL'])runtime[key]=env[key];
 Object.assign(runtime,{REGISTRATION_MODE:'hold',PAYMENT_PROVIDER:'none',EVIDENCE_UPLOADS_ENABLED:'false',THEBE_AI_EXPORTS_ENABLED:'false',THEBE_GENERAL_AI_ENABLED:'false',
  THEBE_GENERAL_AI_RESEARCH_ENABLED:'false',AI_FEATURES_DEFAULT:'off',AGENT_RUNTIME_ENABLED:'0',AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',THEBE_INTERNAL_AUTONOMY_ENABLED:'false',THEBE_LIVE_VOICE_ENABLED:'false'});
 try{const response=await delegate.fetch(request,runtime,ctx),headers=new Headers(response.headers);
  headers.set('cache-control','private, no-store');headers.set('x-robots-tag','noindex, nofollow');headers.set('x-thebe-pop-staging-source',env.POP_HTTP_STAGING_SOURCE_SHA);
  return new Response(response.body,{status:response.status,headers});
 }catch{return reply('pop_staging_unavailable',503)}
 }};}
export default createPopHttpStagingEntry();
