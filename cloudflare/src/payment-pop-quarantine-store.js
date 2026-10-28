import {validatePopUpload} from "./payment-pop-validation.js";
import {popQuarantineKey} from "./payment-pop-storage-boundary.js";
// Staging-only storage primitive; never grants receipt access or settles a payment.
export async function quarantinePop(env,{tenantId,orderId,documentId,bytes,name,contentType}={}){
 if(String(env?.POP_UPLOAD_STAGING_ENABLED||"false")!=="true")throw new Error("pop_upload_disabled");
 if(!env?.EVIDENCE)throw new Error("pop_storage_unavailable");
 const key=popQuarantineKey({tenantId,orderId,documentId});
 const validated=validatePopUpload(bytes,name,contentType);
 const stored=await env.EVIDENCE.put(key,bytes,{onlyIf:{etagDoesNotMatch:"*"},httpMetadata:{contentType:"application/octet-stream"},customMetadata:{scanStatus:"pending"}});
 if(!stored?.etag)throw new Error("pop_upload_conflict");
 return {key,bytes:validated.bytes,scanStatus:"pending",etag:stored.etag};
}
