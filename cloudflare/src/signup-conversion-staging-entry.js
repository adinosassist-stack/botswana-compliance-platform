import governed from './release-governance-entry.js';
import {__requestBoundaryTest} from './worker.js';
import {versionReleaseAssets} from './asset-release-identity.js';
import {CLIENT_TRANSPORT_IMPLEMENTATION,runtimeScriptUrl} from './client-runtime-identity.js';
import {SIGNUP_STAGING_ORIGIN,SIGNUP_STAGING_PROFILE,SIGNUP_STAGING_EMAILS,signupStagingIdentity} from './signup-conversion-staging-policy.js';

const READ_API=new Set(['/api/live','/api/ready','/api/auth/me','/api/auth/csrf','/api/auth/registration-policy','/api/auth/oauth/providers','/api/auth/anti-bot-config','/api/state','/api/billing/status']);
const POST_API=new Set(['/api/auth/registration-proof/challenge','/api/auth/register','/api/auth/register-transport-probe','/api/auth/login','/api/auth/logout','/api/marketing/conversion-event']);
const HTML=new Set(['/','/home','/home/','/home.html','/auth','/auth/','/auth.html','/app','/app/']);
const response=(error,status)=>Response.json({error},{status});

export function createSignupConversionStagingEntry(delegate=governed){
  async function handle(request,env,ctx){
    let identity;
    try{identity=signupStagingIdentity(env)}catch{return response('signup_staging_identity_required',503)}
    if(env.APP_ENV!=='staging'||env.DEPLOYMENT_PROFILE!==SIGNUP_STAGING_PROFILE||env.PUBLIC_ORIGIN!==SIGNUP_STAGING_ORIGIN||env.PUBLIC_APP_URL!==SIGNUP_STAGING_ORIGIN)return response('signup_staging_profile_required',503);
    if(new URL(request.url).origin!==SIGNUP_STAGING_ORIGIN)return response('signup_staging_origin_required',403);
    const {url,aliased}=__requestBoundaryTest.normalizeApiTransport(request),path=url.pathname;
    if(new URL(request.url).searchParams.has('__thebe_api_path')&&!aliased)return response('signup_staging_route_disabled',403);
    if(path==='/api/signup-staging/status'&&request.method==='GET')return Response.json({mode:SIGNUP_STAGING_PROFILE,sourceSha:identity.sourceSha,authenticatedAcceptance:false,productionActivation:false});
    const read=['GET','HEAD'].includes(request.method);
    const asset=/^\/(?:assets|js)\/[^?#]+\.(?:js|css|json|png|jpg|jpeg|svg|webp|woff2?)$/.test(path)||['/favicon.ico','/manifest.webmanifest','/sw.js'].includes(path);
    if(!(read&&(READ_API.has(path)||HTML.has(path)||asset))&&!(request.method==='POST'&&POST_API.has(path)))return response('signup_staging_route_disabled',403);
    // An independently installed marker must match before any account/session write.
    try{
      const marker=await env.DB.prepare('SELECT database_id,environment FROM signup_conversion_staging_identity WHERE id=1').first();
      if(marker?.database_id!==identity.databaseId||marker?.environment!==SIGNUP_STAGING_PROFILE)throw Error('wrong_database');
    }catch{return response('signup_staging_database_unqualified',503)}
    const runtime={};
    for(const key of ['DB','ASSETS','PUBLIC_RATE_LIMITER','SESSION_SECRET','AUDIT_INTEGRITY_SECRET'])runtime[key]=env[key];
    Object.assign(runtime,{APP_ENV:'staging',DEPLOYMENT_PROFILE:SIGNUP_STAGING_PROFILE,PUBLIC_ORIGIN:SIGNUP_STAGING_ORIGIN,PUBLIC_APP_URL:SIGNUP_STAGING_ORIGIN,
      REGISTRATION_MODE:'cohort',REGISTRATION_COHORT_EMAILS_SECRET:SIGNUP_STAGING_EMAILS.join(','),PLATFORM_ADMIN_EMAILS:'',PAYMENT_PROVIDER:'none',
      EVIDENCE_UPLOADS_ENABLED:'false',POP_UPLOAD_STAGING_ENABLED:'false',AI_FEATURES_DEFAULT:'off',AGENT_RUNTIME_ENABLED:'0',AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0',
      THEBE_INTERNAL_AUTONOMY_ENABLED:'false',THEBE_LIVE_VOICE_ENABLED:'false',THEBE_GPT_LIVE_PREVIEW_ENABLED:'false',THEBE_MARKETING_VOICE_ENABLED:'false'});
    // Enforce the fixture restriction even before the canonical cohort gate.
    if(request.method==='POST'&&['/api/auth/login','/api/auth/register'].includes(path)){
      const length=Number(request.headers.get('content-length')||0);
      if(length>8192)return response('signup_staging_payload_too_large',413);
      const reader=request.clone().body?.getReader();let size=0,text='';const decoder=new TextDecoder();
      if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){void reader.cancel().catch(()=>{});return response('signup_staging_payload_too_large',413)}text+=decoder.decode(value,{stream:true})}}finally{reader.releaseLock()}
      try{const body=JSON.parse(text+decoder.decode());if(!SIGNUP_STAGING_EMAILS.includes(String(body.email||'').trim().toLowerCase()))return response('signup_staging_fixture_identity_required',403)}catch{return response('invalid_json',400)}
    }
    return delegate.fetch(request,runtime,ctx);
  }
  return {async fetch(request,env,ctx){
    const result=await handle(request,env,ctx),headers=new Headers(result.headers);
    headers.set('cache-control','no-store');headers.set('cdn-cache-control','no-store');headers.set('x-robots-tag','noindex, nofollow');headers.set('x-thebe-signup-staging',SIGNUP_STAGING_PROFILE);
    headers.delete('x-thebe-source-sha');headers.delete('x-thebe-release-sequence');
    const sha=String(env?.SIGNUP_STAGING_SOURCE_SHA||'');let body=result.body;
    if(/^[a-f0-9]{40}$/.test(sha)){
      headers.set('x-thebe-source-sha',sha);
      const release=CLIENT_TRANSPORT_IMPLEMENTATION+'-'+sha.slice(0,12);
      if(headers.has('x-thebe-client-release'))headers.set('x-thebe-client-release',release);
      if(request.method==='GET'&&headers.get('content-type')?.includes('text/html')){
        body=versionReleaseAssets(runtimeScriptUrl(await result.text(),release),sha);
        body=body.replace(/<meta\b[^>]*\bname\s*=\s*(["'])bw-runtime-mode\1[^>]*>/gi,'').replace(/<head\b[^>]*>/i,head=>head+'<meta name="bw-runtime-mode" content="staging">');
        headers.delete('content-length');headers.delete('etag');
      }else if(request.method==='GET'&&headers.get('content-type')?.includes('application/json')&&__requestBoundaryTest.normalizeApiTransport(request).url.pathname==='/api/ready'){
        try{const data=await result.clone().json();if(data?.provenance)data.provenance={release:SIGNUP_STAGING_PROFILE,sourceSha:sha,runtimeEntry:'signup-conversion-staging-entry',registrationMode:'cohort'};body=JSON.stringify(data);headers.delete('content-length');headers.delete('etag')}catch{}
      }
    }
    return new Response(body,{status:result.status,statusText:result.statusText,headers});
  }};
}
export default createSignupConversionStagingEntry();
