import governed from './release-governance-entry.js';
import {corporateAssetsStagingSchemaPreflight} from './corporate-assets-staging-schema-preflight.js';

// Review-only acceptance entry, not the deployed status-only staging Worker.
// No public route and no automatic deployment are authorized by this module.
const json=(error,status)=>Response.json({error},{status,headers:{'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
const READ=new Set(['/api/auth/me','/api/corporate-assets','/api/corporate-assets/status','/api/corporate-assets/schedule']);
const AUTH_POST=new Set(['/api/auth/login','/api/auth/logout']);
const assetPath=/^\/api\/corporate-assets\/[a-f0-9-]{36}(?:\/(history|services))?$/i;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA=/^[a-f0-9]{40}$/;

export function createCorporateAssetsAuthenticatedStagingEntry(delegate=governed){
 return {async fetch(request,env,ctx){
  if(env?.APP_ENV!=='staging'||env?.DEPLOYMENT_PROFILE!=='corporate-assets-authenticated-acceptance'||
     env?.ASSETS_STAGING_AUTH_ACCEPTANCE_ENABLED!=='true'||env?.THEBE_CORPORATE_ASSETS_ENABLED!=='true'||
     !SHA.test(String(env?.ASSETS_STAGING_SOURCE_SHA||''))||!UUID.test(String(env?.ASSETS_STAGING_D1_ID||''))||
     !env?.SESSION_SECRET||!env?.AUDIT_INTEGRITY_SECRET||!env?.DB||
     !/^https:\/\/[^/]+$/.test(String(env?.PUBLIC_ORIGIN||''))||env?.PUBLIC_APP_URL!==env?.PUBLIC_ORIGIN)
   return json('asset_staging_acceptance_not_qualified',503);
  const url=new URL(request.url);
  if(url.origin!==env.PUBLIC_ORIGIN)return json('asset_staging_origin_required',403);
  if(url.searchParams.has('__thebe_api_path'))return json('asset_staging_transport_alias_denied',403);
  // Deny all requests, including login, when the isolated DB lacks any
  // canonical auth/CSRF/asset/audit schema requirement.
  const preflight=await corporateAssetsStagingSchemaPreflight(env);
  if(!preflight.ready)return json('asset_staging_database_unqualified',503);
  const p=url.pathname,m=request.method;
  const permitted=(m==='GET'&&(READ.has(p)||(assetPath.test(p)&&p.endsWith('/history'))))||
   (m==='POST'&&(AUTH_POST.has(p)||p==='/api/corporate-assets'||(assetPath.test(p)&&p.endsWith('/services'))))||
   (m==='PUT'&&assetPath.test(p)&&!p.endsWith('/history')&&!p.endsWith('/services'));
  if(!permitted)return json('asset_staging_route_denied',403);
  // Never accept request-provided tenant, actor or role; canonical Worker resolves
  // authenticated identity and applies origin/CSRF/paused-access checks.
  const runtime={DB:env.DB,SESSION_SECRET:env.SESSION_SECRET,AUDIT_INTEGRITY_SECRET:env.AUDIT_INTEGRITY_SECRET,
   PUBLIC_ORIGIN:env.PUBLIC_ORIGIN,PUBLIC_APP_URL:env.PUBLIC_APP_URL,APP_ENV:'staging',
   DEPLOYMENT_PROFILE:'corporate-assets-authenticated-acceptance',REGISTRATION_MODE:'hold',PAYMENT_PROVIDER:'none',
   THEBE_CORPORATE_ASSETS_ENABLED:'true',AI_FEATURES_DEFAULT:'off',EVIDENCE_UPLOADS_ENABLED:'false',
   POP_UPLOAD_STAGING_ENABLED:'false',THEBE_AI_EXPORTS_ENABLED:'false',THEBE_GENERAL_AI_ENABLED:'false',
   THEBE_INTERNAL_AUTONOMY_ENABLED:'false',THEBE_LIVE_VOICE_ENABLED:'false',AGENT_BOUNDED_TASK_EXECUTION_ENABLED:'0'};
  const response=await delegate.fetch(request,runtime,ctx);
  const headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.set('x-robots-tag','noindex, nofollow');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 }};
}
export default createCorporateAssetsAuthenticatedStagingEntry();
