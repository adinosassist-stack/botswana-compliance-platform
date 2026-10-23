import {createExportJobInputAsync,exportJobStatus,exportJobDownload} from "./ai-document-export-job.js";
import {exportDownloadHeaders} from "./ai-document-export-mime.js";

/** Framework-neutral authenticated export handlers. No routes are registered here.
 * Inject real identity, message authorization, persistent storage and private blob IO.
 */
export function createAiExportHandlers(deps){
 const {identityFor,resolveMessage,createJob,findJob,readPrivateObject,now=()=>Date.now()}=deps||{};
 if([identityFor,resolveMessage,createJob,findJob,readPrivateObject,now].some(fn=>typeof fn!=="function"))
   throw new TypeError("export_dependencies_required");
 const failure=(reason,status=404)=>({status,body:{error:reason}});
 const getIdentity=async req=>identityFor(req);
 return Object.freeze({
  async create(req){
   const identity=await getIdentity(req);
   const input=await createExportJobInputAsync(req?.body,identity,resolveMessage);
   if(!input.ok)return failure(input.reason,input.reason==="unauthorized"?401:400);
   const job=await createJob(input.value,identity);
   const checked=exportJobStatus(job,identity,now());
   if(!checked.ok)return failure("export_unavailable",503);
   return {status:202,body:checked.value};
  },
  async status(req){
   const identity=await getIdentity(req);
   if(typeof req?.params?.id!=="string"||!/^[a-zA-Z0-9_.:-]{1,200}$/.test(req.params.id))return failure("not_found");
   const job=await findJob(req.params.id,identity);
   const checked=exportJobStatus(job,identity,now());
   return checked.ok?{status:200,body:checked.value}:failure(checked.reason);
  },
  async download(req){
   const identity=await getIdentity(req);
   const job=await findJob(req?.params?.id,identity);
   const checked=exportJobDownload(job,identity,now());
   if(!checked.ok)return failure(checked.reason);
   const headers=exportDownloadHeaders(checked.value.format,job.title);
   if(!headers)return failure("invalid_format");
   const bytes=await readPrivateObject(checked.value.objectKey,identity);
   if(!Buffer.isBuffer(bytes)||bytes.length===0)return failure("export_unavailable",503);
   return {status:200,headers,bytes};
  }
 });
}
