import {popQuarantineKey,popOwnerReadAllowed} from "./payment-pop-storage-boundary.js";
// Server-only POP review functions. Caller identity must come from verified session.
export async function listPopForPlatformOwner(env,{actor,orderId}={}){
 if(actor?.platformOwner!==true)throw Error("pop_owner_forbidden");
 if(!env?.DB?.prepare)throw Error("pop_db_unavailable");
 const result=await env.DB.prepare("SELECT id,tenant_id,payment_order_id,display_name,content_type,bytes,scan_status,uploaded_at FROM payment_pop_documents WHERE payment_order_id=? AND deleted_at IS NULL ORDER BY uploaded_at DESC LIMIT 50").bind(orderId).all();
 return {items:result.results||[],bankFundsConfirmed:false};
}
export async function markPopScanResult(env,{documentId,scanStatus,scannerAuthenticated}={}){
 if(scannerAuthenticated!==true)throw Error("pop_scanner_forbidden");
 if(!["clean","blocked","failed"].includes(scanStatus))throw Error("pop_invalid_scan_result");
 const result=await env.DB.prepare("UPDATE payment_pop_documents SET scan_status=? WHERE id=? AND scan_status='pending' AND deleted_at IS NULL").bind(scanStatus,documentId).run();
 if(result?.meta?.changes!==1)throw Error("pop_scan_transition_failed");
 return {documentId,scanStatus,bankFundsConfirmed:false};
}
export async function readCleanPopForOwner(env,{actor,documentId,orderId,tenantId}={}){
 if(actor?.platformOwner!==true)throw Error("pop_owner_forbidden");
 const row=await env.DB.prepare("SELECT id,tenant_id,payment_order_id,scan_status,deleted_at FROM payment_pop_documents WHERE id=? AND payment_order_id=? AND tenant_id=? LIMIT 1").bind(documentId,orderId,tenantId).first();
 if(!popOwnerReadAllowed({platformOwner:true,tenantMatches:row?.tenant_id===tenantId,scanStatus:row?.scan_status,deletedAt:row?.deleted_at}))throw Error("pop_not_reviewable");
 const key=popQuarantineKey({tenantId,orderId,documentId});
 const object=await env.EVIDENCE.get(key);
 if(!object)throw Error("pop_object_missing");
 return object;
}
