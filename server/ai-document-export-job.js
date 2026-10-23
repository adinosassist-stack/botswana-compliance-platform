import {validateAiExportRequest} from "./ai-document-export-policy.js";
import {authorizeExportJob,authorizeExportDownload} from "./ai-document-export-access.js";

/** Stateless export-job boundaries. Callers must provide authenticated identity
 * and resolve conversation content server-side before persisting any job.
 */
export function createExportJobInput(request,identity,resolveMessage){
 const validated=validateAiExportRequest(request,identity);
 if(!validated.ok)return validated;
 if(typeof resolveMessage!=="function")return {ok:false,reason:"resolver_required"};
 const message=resolveMessage(validated.value.conversationId,validated.value.messageId,identity);
 if(message && typeof message.then==="function")return {ok:false,reason:"async_resolver_not_supported"};
 if(!message||message.actorRole!=="assistant"||message.authorized!==true||
    typeof message.contentHash!=="string"||!/^[a-f0-9]{64}$/.test(message.contentHash))
   return {ok:false,reason:"message_not_found"};
 return {ok:true,value:{...validated.value,contentHash:message.contentHash}};
}
export function exportJobStatus(job,identity,now){
 const access=authorizeExportJob(job,identity,now);
 if(!access.allowed)return {ok:false,reason:access.reason};
 return {ok:true,value:{id:job.id,status:job.status,format:job.format,expiresAt:job.expiresAt}};
}
export function exportJobDownload(job,identity,now){
 const access=authorizeExportDownload(job,identity,now);
 if(!access.allowed)return {ok:false,reason:access.reason};
 return {ok:true,value:{objectKey:job.objectKey,format:job.format}};
}
