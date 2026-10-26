/** Unregistered private export store adapter; caller supplies durable tenant-scoped metadata
 * and private blob operations. This module never creates public URLs or routes.
 */
const id=v=>typeof v==="string"&&/^[a-zA-Z0-9_.:-]{1,200}$/.test(v);
const key=(tenantId,jobId)=>"ai-exports/"+tenantId+"/"+jobId;
export function createPrivateAiExportStore({metadata,objects,clock=()=>Date.now()}={}){
 if(!metadata||["insert","find","complete"].some(k=>typeof metadata[k]!=="function")||
    !objects||["put","get"].some(k=>typeof objects[k]!=="function")||typeof clock!=="function")
   throw new TypeError("private_export_store_dependencies_required");
 return Object.freeze({
  async create(input){
   if(!id(input?.tenantId)||!id(input?.actorId)||!id(input?.conversationId)||!id(input?.messageId)||!/^[a-f0-9]{64}$/.test(input?.contentHash||"")||!Number.isSafeInteger(input?.expiresAt)||input.expiresAt<=clock())throw Error("invalid_export_job");
   const job=await metadata.insert({...input,status:"queued"});
   if(!id(job?.id)||job.tenantId!==input.tenantId||job.actorId!==input.actorId)throw Error("invalid_private_job");
   return job;
  },
  async get({id:jobId,tenantId,actorId}){
   if(!id(jobId)||!id(tenantId)||!id(actorId))return null;
   const job=await metadata.find({id:jobId,tenantId,actorId});
   return job?.tenantId===tenantId&&job?.actorId===actorId&&job?.id===jobId?job:null;
  },
  async complete({tenantId,actorId,id:jobId,objectKey,bytes,format}){
   if(!id(tenantId)||!id(actorId)||!id(jobId)||objectKey!==key(tenantId,jobId)||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>20*1024*1024)throw Error("invalid_private_export");
   const job=await this.get({id:jobId,tenantId,actorId});
   if(!job||job.status!=="queued"||job.expiresAt<=clock()||job.format!==format)throw Error("export_not_authorized");
   await objects.put(objectKey,bytes,{private:true,expiresAt:job.expiresAt});
   await metadata.complete({id:jobId,tenantId,actorId,objectKey,status:"completed"});
  },
  async readPrivate({id:jobId,tenantId,actorId,objectKey}){
   if(!id(tenantId)||!id(actorId)||!id(jobId)||objectKey!==key(tenantId,jobId))return null;
   const job=await this.get({id:jobId,tenantId,actorId});
   if(!job||job.status!=="completed"||job.objectKey!==objectKey||job.expiresAt<=clock())return null;
   return objects.get(objectKey,{private:true});
  }
 });
}
