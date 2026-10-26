/** Unregistered, fail-closed export service. Store MUST enforce private tenant+actor isolation. */
import {validateAiExportRequest} from "./ai-document-export-policy.js";
import {authorizeExportDownload} from "./ai-document-export-access.js";
import {exportDownloadHeaders} from "./ai-document-export-mime.js";
import {validateExportDocument} from "./ai-document-export-model.js";
import {renderAiDocument} from "./ai-document-renderer.js";
const validId=v=>typeof v==="string"&&/^[a-zA-Z0-9_.:-]{1,200}$/.test(v);
export function createAiExportService({store,loadMessage,clock=()=>Date.now(),render=renderAiDocument,enabled=false}={}){
 if(!store||["create","get","complete","readPrivate"].some(k=>typeof store[k]!=="function")||typeof loadMessage!=="function"||typeof clock!=="function"||typeof render!=="function")throw new TypeError("private_store_required");
 const unavailable=()=>({ok:false,reason:"export_disabled"});
 return Object.freeze({
  async create(request,context){
   if(!enabled)return unavailable();
   const check=validateAiExportRequest(request,context);
   if(!check.ok)return check;
   const input=check.value;
   let model;
   try{model=await loadMessage({tenantId:input.tenantId,actorId:input.actorId,conversationId:input.conversationId,messageId:input.messageId});}
   catch{return {ok:false,reason:"message_not_found"};}
   if(!model||model.authorized!==true||model.actorRole!=="assistant"||!/^[a-f0-9]{64}$/.test(model.contentHash||""))return {ok:false,reason:"message_not_found"};
   const validated=validateExportDocument(model.document);
   if(!validated.ok)return {ok:false,reason:validated.reason};
   let job;
   try{job=await store.create({tenantId:input.tenantId,actorId:input.actorId,conversationId:input.conversationId,messageId:input.messageId,contentHash:model.contentHash,format:input.format,documentType:input.documentType,createdAt:clock(),expiresAt:clock()+3600000});}
   catch{return {ok:false,reason:"storage_unavailable"};}
   if(!validId(job?.id)||job.tenantId!==input.tenantId||job.actorId!==input.actorId)return {ok:false,reason:"storage_unavailable"};
   try{
    const bytes=await render(validated.value,input.format);
    if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>20*1024*1024)throw Error("invalid_export_bytes");
    const objectKey="ai-exports/"+input.tenantId+"/"+job.id;
    await store.complete({tenantId:input.tenantId,actorId:input.actorId,id:job.id,objectKey,bytes,format:input.format});
    return {ok:true,id:job.id,status:"completed"};
   }catch{return {ok:false,reason:"render_failed"};}
  },
  async download(id,context){
   if(!enabled)return unavailable();
   if(!validId(id))return {ok:false,reason:"not_found"};
   if(context?.authenticated!==true||context?.workspaceMember!==true||!validId(context.tenantId)||!validId(context.actorId))return {ok:false,reason:"unauthorized"};
   let job;
   try{job=await store.get({id,tenantId:context.tenantId,actorId:context.actorId});}
   catch{return {ok:false,reason:"storage_unavailable"};}
   const allowed=authorizeExportDownload(job,context,clock());
   if(!allowed.allowed)return {ok:false,reason:allowed.reason};
   if(typeof job.objectKey!=="string"||job.objectKey!=="ai-exports/"+context.tenantId+"/"+id)return {ok:false,reason:"not_found"};
   const headers=exportDownloadHeaders(job.format,job.title);
   if(!headers)return {ok:false,reason:"invalid_format"};
   let bytes;
   try{bytes=await store.readPrivate({tenantId:context.tenantId,actorId:context.actorId,id,objectKey:job.objectKey});}
   catch{return {ok:false,reason:"storage_unavailable"};}
   if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>20*1024*1024)return {ok:false,reason:"not_ready"};
   return {ok:true,bytes,headers};
  }
 });
}
