/** Read-only Cloudflare account-wide exposure inventory for private Corporate Assets staging.
 * This is NOT a deploy authorization or a proof of exact compiled Worker provenance.
 * Query scope is pinned to the account's known zones; fail if inventory changes.
 */
import {pathToFileURL} from 'node:url';
export const ACCOUNT='ddd23cab31928a4bb3d4998df9b26d1d';
export const WORKER='bw-corporate-assets-staging';
export const VERSION='983daaea-1e6b-4359-9994-0b792578008b';
export const EXPECTED_ZONES=Object.freeze([
 '32508a8d504384016dac56edfe62270b',
 '33e363d52b69c4a64dbb8a0891dbb3a9'
]);
const error=(code)=>{throw Error(code)};
// Fail closed on common copy/paste mistakes, without ever echoing credential bytes.
export function assertOpaqueReadToken(value,scope){
 if(typeof value!=='string'||!value.trim())error('dedicated_'+scope+'_read_token_required');
 if(value!==value.trim()||/\s|["'<>]/.test(value)||value.includes('\\')||/^Bearer/i.test(value))
  error('cloudflare_'+scope+'_credential_format_invalid');
}
// Cloudflare errors may include user-controlled text. Log ONLY bounded numeric codes.
export async function sanitizedCloudflareError(response,scope){
 let code=null;
 try {
  const data=await response.json();
  const n=data?.errors?.[0]?.code;
  if(Number.isSafeInteger(n)&&n>=0&&n<=999999)code=n;
 }catch { /* Response may be HTML, invalid JSON, or unreadable. */ }
 return 'cloudflare_exposure_read_failed_'+scope+'_'+response.status+
  (code===null?'':'_cfcode_'+code);
}
const complete=(data,code)=>{
 const p=data?.result_info;
 if(p&&(p.total_pages!==1||p.page!==1||p.count!==data.result.length))error(code+'_incomplete');
 return data.result;
};
export function checkAssetStagingExposure({subdomain,domains,zones,zoneRoutes}={}){
 const errors=[];
 if(subdomain?.enabled!==false||subdomain?.previews_enabled!==false)errors.push('worker_subdomain_or_preview_enabled');
 if(!Array.isArray(domains))errors.push('domains_inventory_missing');
 else if(domains.some(x=>x?.service===WORKER||x?.script===WORKER))errors.push('custom_domain_attached');
 if(!Array.isArray(zones)||zones.length!==EXPECTED_ZONES.length||
  EXPECTED_ZONES.some(id=>zones.filter(z=>z?.id===id).length!==1))errors.push('zone_inventory_changed');
 if(!Array.isArray(zoneRoutes)||zoneRoutes.length!==EXPECTED_ZONES.length||
  EXPECTED_ZONES.some(id=>zoneRoutes.filter(z=>z?.zone===id).length!==1))errors.push('zone_routes_incomplete');
 else for(const z of zoneRoutes){
  if(!Array.isArray(z.routes))errors.push('zone_routes_missing');
  else if(z.routes.some(x=>x?.script===WORKER))errors.push('worker_zone_route_attached');
 }
 return Object.freeze({privateExposureVerified:errors.length===0,worker:WORKER,candidate:VERSION,
  inspectedZoneCount:Array.isArray(zoneRoutes)?zoneRoutes.length:0,errors:Object.freeze([...new Set(errors)]),
  deploymentAuthorized:false,sourceProvenanceVerified:false});
}
export async function inspectAssetStagingExposure({token,accountToken,request=fetch}={}){
 if(typeof accountToken!=='string'||!accountToken.trim())error('dedicated_account_inventory_read_token_required');
 if(typeof token!=='string'||!token.trim())error('dedicated_cloudflare_read_token_required');
 assertOpaqueReadToken(accountToken,'account_inventory');
 assertOpaqueReadToken(token,'cloudflare');
 const get=async (path,scope,readToken=token)=>{
  const response=await request('https://api.cloudflare.com/client/v4'+path,{
   method:'GET',headers:{authorization:'Bearer '+readToken,accept:'application/json'},
   redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)error(await sanitizedCloudflareError(response,scope));
  const data=await response.json();
  if(data?.success!==true||data.result==null)error('cloudflare_exposure_invalid_response_'+scope);
  return data;
 };
 const prefix='/accounts/'+ACCOUNT;
 const sub=(await get(prefix+'/workers/scripts/'+WORKER+'/subdomain','worker_subdomain')).result;
 const domainsPayload=await get(prefix+'/workers/domains','worker_domains',accountToken);
 if(!Array.isArray(domainsPayload.result))error('domains_inventory_invalid');
 const domains=complete(domainsPayload,'domains_inventory');
 const zonesPayload=await get('/zones?per_page=100','zone_inventory',accountToken);
 if(!Array.isArray(zonesPayload.result))error('zones_inventory_invalid');
 const zones=complete(zonesPayload,'zones_inventory');
 // No assumption that missing zone routes can be ignored.
 const zoneRoutes=await Promise.all(EXPECTED_ZONES.map(async zone=>{
  const payload=await get('/zones/'+zone+'/workers/routes','zone_worker_routes');
  if(!Array.isArray(payload.result))error('zone_routes_invalid');
  return {zone,routes:complete(payload,'zone_routes')};
 }));
 return checkAssetStagingExposure({subdomain:sub,domains,zones,zoneRoutes});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const result=await inspectAssetStagingExposure({token:process.env.ASSETS_STAGING_CLOUDFLARE_READ_TOKEN,
   accountToken:process.env.ASSETS_STAGING_CLOUDFLARE_ACCOUNT_READ_TOKEN});
  console.log(JSON.stringify(result));
  if(!result.privateExposureVerified)process.exitCode=1;
 }catch(e){console.error(String(e.message).replace(/[^a-zA-Z0-9_]/g,'_'));process.exitCode=1}
}
