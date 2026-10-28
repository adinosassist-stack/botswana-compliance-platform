import {popQuarantineKey} from "./payment-pop-storage-boundary.js";
// Metadata-only POP persistence. This does not settle payments.
export async function recordPendingPop(db,{documentId,tenantId,orderId,objectKey,name,contentType,bytes,userId}={}){
 if(!db?.prepare||!documentId||!tenantId||!orderId||!objectKey||!userId)throw Error("pop_metadata_invalid");
 if(!/^payment-pop\/quarantine\//.test(objectKey))throw Error("pop_metadata_invalid");
 const result=await db.prepare("INSERT INTO payment_pop_documents(id,tenant_id,payment_order_id,source,object_key,display_name,content_type,bytes,scan_status,received_by_user_id) VALUES(?,?,?,'web',?,?,?,?,'pending',?)")
 .bind(documentId,tenantId,orderId,objectKey,name,contentType,bytes,userId).run();
 if(result?.success!==true)throw Error("pop_metadata_write_failed");
 return {documentId,scanStatus:"pending"};
}
