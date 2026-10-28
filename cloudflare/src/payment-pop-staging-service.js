import {authorizePopSubmission} from "./payment-pop-order-authority.js";
import {quarantinePop} from "./payment-pop-quarantine-store.js";
import {validatePopUpload} from "./payment-pop-validation.js";
import {reservePopUpload,popReservationState,failPopReservation,popSha256,validPopRequestKey} from "./payment-pop-upload-reservations.js";
import {recordPendingPop} from "./payment-pop-metadata.js";
// Staging-only service boundary. Caller must pass trusted session identity, never client-provided role/tenant.
export async function stagePopSubmission(env,{session,orderId,documentId,bytes,name,contentType,requestKey}={}){
 if(String(env?.POP_UPLOAD_STAGING_ENABLED||"false")!=="true")throw new Error("pop_upload_disabled");
 if(!session?.tenantId||!session?.role||!session?.userId)throw new Error("pop_unauthenticated");
 const authority=await authorizePopSubmission(env.DB,{tenantId:session.tenantId,actorRole:session.role,orderId});
 if(!validPopRequestKey(requestKey))throw Error('invalid_pop_idempotency_key');
 const validated=validatePopUpload(bytes,name,contentType);
 const contentSha256=await popSha256(bytes);
 const requestHash=await popSha256(JSON.stringify([session.userId,name,validated.contentType,validated.bytes,contentSha256]));
 const reservation=await reservePopUpload(env.DB,{tenantId:authority.tenantId,orderId:authority.orderId,documentId,requestKey,requestHash,bytes:validated.bytes});
 const scope={tenantId:authority.tenantId,orderId:authority.orderId,documentId:reservation.documentId,requestHash};
 const result=(scanStatus='pending',replayed=false)=>({documentId:scope.documentId,orderId:authority.orderId,scanStatus,reviewable:false,bankFundsConfirmed:false,subscriptionActivated:false,replayed});
 const replay=async()=>{
  const row=await env.DB.prepare("SELECT scan_status,deleted_at FROM payment_pop_documents WHERE id=? AND tenant_id=? AND payment_order_id=?").bind(scope.documentId,scope.tenantId,scope.orderId).first();
  if(!row)throw Error('pop_upload_reconciliation_required');
  if(row.deleted_at!=null)throw Error('pop_upload_deleted');
  return result(row.scan_status,true);
 };
 if(reservation.replayed)return replay();
 // If a storage response is lost, keep its reservation: cleanup must reconcile
 // object existence before releasing capacity or accepting another attempt.
 const stored=await quarantinePop(env,{...scope,bytes,name,contentType});
 try {
  await recordPendingPop(env.DB,{documentId:scope.documentId,tenantId:scope.tenantId,orderId:scope.orderId,objectKey:stored.key,name,contentType:validated.contentType,bytes:stored.bytes,userId:session.userId,reservationHash:requestHash,contentSha256,objectEtag:stored.etag});
 } catch(error) {
  let current;
  try {current=await popReservationState(env.DB,scope)} catch {throw Error('pop_upload_reconciliation_required')}
  // A committed transaction with a lost acknowledgement must not have its
  // accepted object deleted. Recover from authoritative state instead.
  if(current?.state==='stored')return replay();
  if(current?.state!=='reserved')throw Error('pop_upload_reconciliation_required');
  try {await env.EVIDENCE.delete(stored.key);await failPopReservation(env.DB,scope)} catch {throw Error('pop_metadata_cleanup_required')}
  throw error;
 }
 return result();
}
