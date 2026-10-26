/** Export integration adapter. Intentionally registers no HTTP endpoints.
 * Integration requires an authenticated identity resolver and a private store.
 * Production defaults to OFF. No public blob links are returned.
 */
import {createAiExportService} from "./ai-document-export-service.js";
export function createAiDockExportIntegration({identityFor,store,loadMessage,render,clock,enabled=false}={}){
 if(typeof identityFor!=="function")throw new TypeError("identity_resolver_required");
 const service=createAiExportService({store,loadMessage,render,clock,enabled:enabled===true});
 const safeResponse=result=>result.ok?result:{ok:false,reason:result.reason};
 return Object.freeze({
  async create(req){
   if(!enabled)return {ok:false,reason:"export_disabled"};
   const identity=await identityFor(req);
   return safeResponse(await service.create(req?.body,identity));
  },
  async download(req){
   if(!enabled)return {ok:false,reason:"export_disabled"};
   const identity=await identityFor(req);
   return safeResponse(await service.download(req?.params?.id,identity));
  }
 });
}
