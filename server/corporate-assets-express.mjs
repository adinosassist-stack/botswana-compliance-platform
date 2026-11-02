/** Opt-in Express registration for the Corporate Assets read-only API.
 * Host supplies its existing session and subscription middleware. Never mounts by default.
 * Database access must be tenant-scoped and independently qualified before enabling.
 */
import {createAssetsListsHttp} from './corporate-assets-lists-http.mjs';
const paths=['/api/assets','/api/assets/maintenance','/api/assets/insurance'];
const permissions=Object.freeze({'owner':true,'manager':true,'auditor':true});
export function registerCorporateAssetsExpress({app,enabled=false,sessionAuth,entitlement,rateLimit,getDatabase}={}){
 if(enabled!==true)return false;
 if(!app||typeof app.get!=='function'||[sessionAuth,entitlement,rateLimit,getDatabase].some(x=>typeof x!=='function'))throw new TypeError('assets_express_dependencies_required');
 const handle=createAssetsListsHttp({
  authenticate:async request=>{
   const a=request.rawRequest?.auth;
   return a?{companyId:a.tenant_id,userId:a.user_id,role:a.role}:null;
  },
  authorize:async (principal,permission)=>permissions[principal.role]===true&&['assets:read','assets:maintenance:read','assets:insurance:read'].includes(permission),
  rateLimit:async(principal,path)=>rateLimit(principal,path),
  getDatabase
 });
 for(const path of paths)app.get(path,sessionAuth,entitlement,async(req,res)=>{
  try {
   const result=await handle({method:req.method,path,rawRequest:req});
   res.status(result.status).set(result.headers).json(result.body);
  } catch {
   res.status(503).set({'cache-control':'no-store','x-content-type-options':'nosniff'}).json({error:'assets_unavailable'});
  }
 });
 return true;
}
