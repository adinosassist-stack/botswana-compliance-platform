/** Fail-closed export service for a trusted authenticated Node handler.
 * Storage adapter must enforce tenant isolation and persist private bytes.
 * No public URLs, signed links or direct client-supplied document content.
 */
import {validateAiExportRequest} from "./ai-document-export-policy.js";
import {authorizeExportJob,authorizeExportDownload} from "./ai-document-export-access.js";
import {exportDownloadHeaders} from "./ai-document-export-mime.js";
import {renderAiDocument} from "./ai-document-renderer.js";

export function createAiExportService({store,loadMessage,clock=()=>Math.floor(Date.now()/1000),render=renderAiDocument}={}){
 if(!store || typeof store.create!=="function" || typeof store.get!=="function" ||
    typeof store.complete!=="function" || typeof store.readPrivate!=="function" ||
    typeof loadMessage!=="function")throw new TypeError("private_store_required");
 return {
  async create(request,context){
   const checked=validateAiExportRequest(request,context);
   if(!checked.ok)return {ok:false,reason:checked.reason};
   const input=checked.value;
   const model=await loadMessage({tenantId:input.tenantId,actorId:input.actorId,
     conversationId:input.conversationId,messageId:input.messageId});
   if(!model)return {ok:false,reason:"message_not_found"};
   const job=await store.create({tenantId:input.tenantId,actorId:input.actorId,
     format:input.format,documentType:input.documentType,createdAt:clock()});
   if(!job || !job.id)return {ok:false,reason:"storage_unavailable"};
   try{
    const bytes=await render(model,input.format);
    if(!Buffer.isBuffer(bytes) || bytes.length===0 || bytes.length>20*1024*1024)
      throw new Error("invalid_export_bytes");
    const objectKey="ai-exports/"+input.tenantId+"/"+job.id;
    await store.complete({tenantId:input.tenantId,actorId:input.actorId,id:job.id,
      objectKey,bytes,format:input.format});
    return {ok:true,id:job.id,status:"completed"};
   }catch{
    return {ok:false,reason:"render_failed",id:job.id};
   }
  },
  async download(id,context){
   if(typeof id!=="string" || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(id))
     return {ok:false,reason:"not_found"};
   if(context?.authenticated!==true || context?.workspaceMember!==true)
     return {ok:false,reason:"unauthorized"};
   const job=await store.get({id,tenantId:context.tenantId,actorId:context.actorId});
   const permission=authorizeExportDownload(job,context,clock());
   if(!permission.allowed)return {ok:false,reason:permission.reason};
   const bytes=await store.readPrivate({tenantId:context.tenantId,id,objectKey:job.objectKey});
   if(!Buffer.isBuffer(bytes)||!bytes.length)return {ok:false,reason:"not_ready"};
   return {ok:true,bytes,headers:exportDownloadHeaders(job.format,job.title)};
  }
 };
}
