/** UNMOUNTED defense-in-depth wrapper for private AI document exports.
 * A current conversation ACL and saved assistant-message fingerprint are required
 * at completion and each download, even when the blob already exists.
 * Does not provide an API route, public URL, scheduler or deployment.
 */
const validId=value=>typeof value==="string"&&/^[a-zA-Z0-9_.:-]{1,200}$/.test(value);
const validHash=value=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
export function createRevocationAwareAiExportStore({store,loadAuthorizedMessage}={}){
 if(!store||["create","get","complete","readPrivate"].some(name=>typeof store[name]!=="function")||
    typeof loadAuthorizedMessage!=="function")
  throw new TypeError("revocation_aware_export_dependencies_required");

 async function verify(job,tenantId,actorId,id){
  if(!validId(id)||!validId(tenantId)||!validId(actorId)||
     job?.id!==id||job?.tenantId!==tenantId||job?.actorId!==actorId||
     !validId(job?.conversationId)||!validId(job?.messageId)||!validHash(job?.contentHash))
   return false;
  try{
   const message=await loadAuthorizedMessage({
    tenantId,actorId,conversationId:job.conversationId,messageId:job.messageId
   });
   return message?.authorized===true&&message?.actorRole==="assistant"&&
    validHash(message.contentHash)&&message.contentHash===job.contentHash;
  }catch{return false}
 }
 async function eligible({id,tenantId,actorId}={}){
  if(![id,tenantId,actorId].every(validId))return null;
  let job;
  try{job=await store.get({id,tenantId,actorId})}catch{return null}
  return await verify(job,tenantId,actorId,id)?job:null;
 }
 return Object.freeze({
  async create(input){return store.create(input)},
  async get(args){return eligible(args)},
  async complete(args){
   const job=await eligible(args);
   if(!job||job.status!=="queued"||args?.objectKey!=="ai-exports/"+args.tenantId+"/"+args.id)
    throw Error("source_access_revoked");
   return store.complete(args);
  },
  async readPrivate(args){
   const job=await eligible(args);
   if(!job||job.status!=="completed"||job.objectKey!==args?.objectKey)return null;
   let bytes;
   try{bytes=await store.readPrivate(args)}catch{return null}
   if(!Buffer.isBuffer(bytes))return null;
   // A session, ACL or message may be revoked while the object is being read.
   const current=await eligible(args);
   return current?.status==="completed"&&current.objectKey===job.objectKey&&
      current.contentHash===job.contentHash?bytes:null;
  }
 });
}
