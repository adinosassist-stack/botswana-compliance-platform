/** Framework-neutral, read-only Corporate Assets route adapter.
 * Host must inject trusted session auth, rate limiting, permission checks and
 * tenant-scoped DB access. No automatic server registration or production activation.
 */
import {listAssetRegister} from './corporate-assets-register-reader.mjs';
import {listMaintenance} from './corporate-assets-maintenance-reader.mjs';
import {listInsurance} from './corporate-assets-insurance-reader.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const routes=Object.freeze({'/api/assets':'assets:read','/api/assets/maintenance':'assets:maintenance:read','/api/assets/insurance':'assets:insurance:read'});
const reply=(status,body)=>({status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'},body});
export function createAssetsListsHttp({authenticate,authorize,rateLimit,getDatabase,clock=()=>new Date()}={}){
 if([authenticate,authorize,rateLimit,getDatabase,clock].some(fn=>typeof fn!=='function'))throw new TypeError('assets_http_dependencies_required');
 return async function assetsListsHttp(request){
  const path=request?.path;
  if(!Object.hasOwn(routes,path))return reply(404,{error:'not_found'});
  if(request?.method!=='GET')return reply(405,{error:'method_not_allowed'});
  let principal;
  try{principal=await authenticate(request)}catch{return reply(401,{error:'unauthorized'})}
  if(!uuid.test(principal?.companyId||'')||!uuid.test(principal?.userId||''))return reply(401,{error:'unauthorized'});
  let allowed;
  try{allowed=await authorize(principal,routes[path])}catch{return reply(503,{error:'authorization_unavailable'})}
  if(allowed!==true)return reply(403,{error:'forbidden'});
  let withinLimit;
  try{withinLimit=await rateLimit(principal,path)}catch{return reply(503,{error:'rate_limit_unavailable'})}
  if(withinLimit!==true)return reply(429,{error:'rate_limited'});
  try{
   const db=await getDatabase(principal);
   const context={companyId:principal.companyId,authorized:true};
   if(path==='/api/assets')return reply(200,await listAssetRegister({db,context}));
   if(path==='/api/assets/maintenance')return reply(200,await listMaintenance({db,context}));
   const now=clock();if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw new Error('invalid_clock');
   const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Gaborone',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
   const values=Object.fromEntries(parts.filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,p.value]));
   return reply(200,await listInsurance({db,context,asOfDate:values.year+'-'+values.month+'-'+values.day}));
  }catch{return reply(503,{error:'assets_unavailable'})}
 };
}
