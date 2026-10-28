import governed from './release-governance-entry.js';
import {__requestBoundaryTest} from './worker.js';
import {versionReleaseAssets} from './asset-release-identity.js';
import {CLIENT_TRANSPORT_IMPLEMENTATION,runtimeScriptUrl} from './client-runtime-identity.js';

export const BILLING_STAGING_ORIGIN='https://billing-staging.thebedesk.com';
const READ_METHODS=new Set(['GET','HEAD','OPTIONS']);
// The transport probe is a read-only capability response despite using POST.
const AUTH_WRITES=new Set(['/api/auth/login','/api/auth/logout','/api/auth/register-transport-probe']);
const READ_PATHS=new Set(['/api/auth/me','/api/auth/csrf','/api/auth/anti-bot-config','/api/auth/oauth/providers','/api/auth/registration-policy','/api/state','/api/live','/api/ready',
 '/api/platform/billing/analytics','/api/platform/billing/subscriptions','/api/platform/billing/manual-payments',
 '/api/billing/status','/api/payments/providers','/api/payments/reconciliation','/api/payments/verifications','/api/payments/refunds',
 '/api/payments/provider-status','/api/payments/orders','/api/payments/manual-bank/config','/api/payments/manual-bank/status']);
const json=(body,status)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow','x-thebe-billing-staging':'read-only'}});

function stagingRuntimeMode(html){
 const marker='<meta name="bw-runtime-mode" content="staging">';
 const clean=html.replace(/<meta\b[^>]*\bname\s*=\s*(["'])bw-runtime-mode\1[^>]*>/gi,'');
 return /<head\b[^>]*>/i.test(clean)?clean.replace(/<head\b[^>]*>/i,head=>head+marker):marker+clean;
}

// This first staging slice permits sign-in and inspection only. Enabling any
// billing mutation, POP upload or fixture provisioning requires a separate review.
export function createBillingStagingEntry(delegate=governed){
 async function handle(request,env,ctx){
  if(env?.APP_ENV!=='staging'||env?.DEPLOYMENT_PROFILE!=='billing-staging-readonly'||
     env?.PUBLIC_ORIGIN!==BILLING_STAGING_ORIGIN||env?.PUBLIC_APP_URL!==BILLING_STAGING_ORIGIN||
     !/^[a-f0-9]{40}$/.test(String(env?.BILLING_STAGING_SOURCE_SHA||''))){
   return json({error:'billing_staging_configuration_required'},503);
  }
  if(new URL(request.url).origin!==BILLING_STAGING_ORIGIN)return json({error:'billing_staging_origin_required'},403);
  const {url,aliased}=__requestBoundaryTest.normalizeApiTransport(request);
  if(new URL(request.url).searchParams.has('__thebe_api_path')&&!aliased)return json({error:'billing_staging_route_disabled'},403);
  const path=url.pathname;
  if(path==='/api/billing-staging/status'&&request.method==='GET')return json({
   mode:'read_only',sourceSha:env.BILLING_STAGING_SOURCE_SHA,authenticatedAcceptance:false,
   billingMutationsEnabled:false,popUploadsEnabled:false,regulatoryActivationEnabled:false
  },200);
  if(!READ_METHODS.has(request.method)&&!(request.method==='POST'&&AUTH_WRITES.has(path))){
   return json({error:'billing_staging_mutations_disabled'},403);
  }
  const allowedRead=READ_PATHS.has(path);
  if((path==='/api'||path.startsWith('/api/'))&&READ_METHODS.has(request.method)&&!allowedRead){
   return json({error:'billing_staging_route_disabled'},403);
  }
  // Read-only marker check precedes login/session writes and all app delegation.
  // The marker is installed only after operator verification of the dedicated D1.
  try{
   const identity=await env.DB.prepare('SELECT database_id,environment FROM billing_staging_identity WHERE id=1').first();
   if(!/^[a-f0-9-]{36}$/i.test(String(env.BILLING_STAGING_D1_ID||''))||identity?.database_id!==env.BILLING_STAGING_D1_ID||identity?.environment!=='billing-staging')throw Error('wrong_staging_database');
  }catch{return json({error:'billing_staging_database_unqualified'},503)}
  // Credentials for integrations are deliberately absent from this allowlist.
  const runtime={};
  for(const key of ['DB','EVIDENCE','ASSETS','PUBLIC_RATE_LIMITER','SESSION_SECRET','AUDIT_INTEGRITY_SECRET','PLATFORM_ADMIN_EMAILS','APP_ENV','DEPLOYMENT_PROFILE','PUBLIC_ORIGIN','PUBLIC_APP_URL'])runtime[key]=env[key];
  Object.assign(runtime,{REGISTRATION_MODE:'hold',PAYMENT_PROVIDER:'none',EVIDENCE_UPLOADS_ENABLED:'false',POP_UPLOAD_STAGING_ENABLED:'false',
   AGENT_RUNTIME_ENABLED:'0',AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',THEBE_INTERNAL_AUTONOMY_ENABLED:'false',THEBE_LIVE_VOICE_ENABLED:'false',THEBE_GPT_LIVE_PREVIEW_ENABLED:'false',THEBE_MARKETING_VOICE_ENABLED:'false',AI_FEATURES_DEFAULT:'off'});
  const response=await delegate.fetch(request,runtime,ctx);
  return response;
 }
 return {async fetch(request,env,ctx){
  const response=await handle(request,env,ctx);
  const headers=new Headers(response.headers);
  headers.set('x-thebe-billing-staging','read-only');headers.set('x-robots-tag','noindex, nofollow');
  headers.delete('x-thebe-release-sequence');headers.delete('x-thebe-source-sha');
  const sha=String(env?.BILLING_STAGING_SOURCE_SHA||'');
  const validSha=/^[a-f0-9]{40}$/.test(sha);
  const clientRelease=CLIENT_TRANSPORT_IMPLEMENTATION+'-'+sha.slice(0,12);
  if(validSha){
   headers.set('x-thebe-source-sha',sha);
   if(headers.has('x-thebe-client-release'))headers.set('x-thebe-client-release',clientRelease);
  }
  let body=response.body;
  if(request.method==='GET'&&headers.get('content-type')?.includes('text/html')&&validSha){
   body=stagingRuntimeMode(versionReleaseAssets(runtimeScriptUrl(await response.text(),clientRelease),sha));
   headers.delete('content-length');headers.delete('etag');
   headers.set('cache-control','no-store');headers.set('cdn-cache-control','no-store');
  }else if(request.method==='GET'&&headers.get('content-type')?.includes('application/json')&&validSha&&__requestBoundaryTest.normalizeApiTransport(request).url.pathname==='/api/ready'){
   try{
    const data=await response.clone().json();
    if(data?.provenance)data.provenance={release:'billing-staging-readonly',sourceSha:sha,runtimeEntry:'billing-staging-entry',registrationMode:'hold'};
    body=JSON.stringify(data);headers.delete('content-length');headers.delete('etag');
   }catch{}
  }
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
 }};
}

export default createBillingStagingEntry();
