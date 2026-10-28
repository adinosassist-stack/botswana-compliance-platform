import {popQuarantineKey} from "./payment-pop-storage-boundary.js";
// Metadata-only POP persistence. This does not settle payments.
export async function recordPendingPop(db,{documentId,tenantId,orderId,objectKey,name,contentType,bytes,userId,reservationHash,contentSha256=null,objectEtag=null}={}){
 if(!db?.prepare||!documentId||!tenantId||!orderId||!objectKey||!userId)throw Error("pop_metadata_invalid");
 let expectedKey;
 try { expectedKey=popQuarantineKey({tenantId,orderId,documentId}); } catch { throw Error("pop_metadata_invalid"); }
 if(objectKey!==expectedKey)throw Error("pop_metadata_invalid");
 const statement=db.prepare("INSERT INTO payment_pop_documents(id,tenant_id,payment_order_id,source,object_key,display_name,content_type,bytes,scan_status,received_by_user_id,content_sha256,object_etag) VALUES(?,?,?,'web',?,?,?,?,'pending',?,?,?)")
 .bind(documentId,tenantId,orderId,objectKey,name,contentType,bytes,userId,contentSha256,objectEtag);
 if(reservationHash!==undefined){
  if(!/^[a-f0-9]{64}$/.test(String(reservationHash))||typeof db.batch!=='function')throw Error("pop_metadata_invalid");
  try{
   const results=await db.batch([
    db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM payment_pop_upload_requests WHERE document_id=? AND tenant_id=? AND payment_order_id=? AND request_hash=? AND state='reserved') THEN 1 ELSE abs(-9223372036854775808) END AS pop_reservation_guard").bind(documentId,tenantId,orderId,reservationHash),
    statement,
    db.prepare("UPDATE payment_pop_upload_requests SET state='stored' WHERE document_id=? AND tenant_id=? AND payment_order_id=? AND request_hash=? AND state='reserved'").bind(documentId,tenantId,orderId,reservationHash)
   ]);
   if(results[1]?.success!==true||results[1]?.meta?.changes!==1||results[2]?.meta?.changes!==1)throw Error("pop_metadata_write_failed");
  }catch{throw Error("pop_metadata_write_failed")}
  return {documentId,scanStatus:"pending"};
 }
 const result=await statement.run();
 if(result?.success!==true)throw Error("pop_metadata_write_failed");
 return {documentId,scanStatus:"pending"};
}
