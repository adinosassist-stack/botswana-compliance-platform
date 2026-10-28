import {appendSealedAuditEvent} from './audit-lineage-writer.js';
import {popQuarantineKey} from './payment-pop-storage-boundary.js';
import {popStoredDocument,verifiedPopBytes} from './payment-pop-scan-verification.js';

function qualification(env,actor,flag,prefix){
 if(actor?.platformOwner!==true||typeof actor?.userId!=='string'||!actor.userId)throw Error(prefix+'_forbidden');
 if(env?.APP_ENV!=='staging'||env?.DEPLOYMENT_PROFILE!=='billing-staging-readonly'||env?.[flag]!=='true')throw Error(prefix+'_disabled');
 if(!env.AUDIT_INTEGRITY_SECRET)throw Error(prefix+'_audit_required');
}
function reasonText(reason,prefix){
 if(typeof reason!=='string'||reason.trim().length<5||reason.length>500||/[\u0000-\u001f\u007f]/.test(reason))throw Error(prefix+'_invalid_reason');
 return reason.trim();
}
function snapshot(row,{expectedSha256,expectedEtag}){
 if(!row)throw Error('pop_retirement_scope_not_found');
 if(row.object_key!==popQuarantineKey({documentId:row.id,tenantId:row.tenant_id,orderId:row.payment_order_id}))throw Error('pop_retirement_reconciliation_required');
 if(row.content_sha256!==expectedSha256||row.object_etag!==expectedEtag)throw Error('pop_retirement_snapshot_changed');
 return row;
}
async function head(env,key){try{return await env.EVIDENCE.head(key)}catch{throw Error('pop_retirement_cleanup_required')}}
async function removeMatchingObject(env,row){
 const key=popQuarantineKey({tenantId:row.tenant_id,orderId:row.payment_order_id,documentId:row.id});
 const object=await head(env,key);
 if(object){
  if(object.etag!==row.object_etag||object.size!==row.bytes)throw Error('pop_retirement_reconciliation_required');
  try{await verifiedPopBytes(env,row)}catch{
   // Another authorized cleanup may have removed this immutable object while
   // it was being checked. Never delete a changed or uncertain object.
   if(await head(env,key))throw Error('pop_retirement_reconciliation_required');
   return;
  }
  try{await env.EVIDENCE.delete(key)}catch{if(await head(env,key))throw Error('pop_retirement_cleanup_required')}
 }
 if(await head(env,key))throw Error('pop_retirement_cleanup_required');
}
// No scheduler, retention duration, route or remote operation is installed.
// Only accepted/stored receipts are eligible; uncertain uploads are inspection-only.
export async function retireStoredPop(env,options={}){
 const {actor,documentId,tenantId,orderId,expectedSha256,expectedEtag}=options;
 qualification(env,actor,'POP_RETENTION_STAGING_ENABLED','pop_retirement');
 const reason=reasonText(options.reason,'pop_retirement');
 if(!/^[a-f0-9]{64}$/.test(String(expectedSha256||''))||typeof expectedEtag!=='string'||!expectedEtag||expectedEtag.length>256)throw Error('pop_retirement_invalid_snapshot');
 const scope={documentId,tenantId,orderId},key=popQuarantineKey(scope);
 let row=snapshot(await popStoredDocument(env,scope),options),replayed=!!row.deleted_at;
 if(!row.deleted_at){
  const mutation=env.DB.prepare(`UPDATE payment_pop_documents SET deleted_at=CURRENT_TIMESTAMP
   WHERE id=? AND tenant_id=? AND payment_order_id=? AND deleted_at IS NULL
   AND content_sha256=? AND object_etag=? AND EXISTS(SELECT 1 FROM payment_pop_upload_requests r
    WHERE r.document_id=payment_pop_documents.id AND r.tenant_id=payment_pop_documents.tenant_id
    AND r.payment_order_id=payment_pop_documents.payment_order_id AND r.state='stored')`)
   .bind(documentId,tenantId,orderId,expectedSha256,expectedEtag);
  const audit=await appendSealedAuditEvent(env,{tenantId,actorUserId:actor.userId,eventType:'POP_RETIREMENT_REQUESTED',entityType:'payment_pop_document',entityId:documentId,
   eventData:{reason,sha256:expectedSha256,etag:expectedEtag,bankFundsConfirmed:false},mutation});
  row=snapshot(await popStoredDocument(env,scope),options);
  if(!row.deleted_at)throw Error('pop_retirement_conflict');
  if(!audit.ok)replayed=true;
 }
 if(row.storage_deleted_at){
  // An out-of-band restore must not be silently deleted or reported absent.
  if(await head(env,key))throw Error('pop_retirement_reconciliation_required');
  return {documentId,deleted:true,storageDeleted:true,replayed:true,quotaReleased:false,bankFundsConfirmed:false,subscriptionActivated:false};
 }
 await removeMatchingObject(env,row);
 const mutation=env.DB.prepare(`UPDATE payment_pop_documents SET storage_deleted_at=CURRENT_TIMESTAMP
  WHERE id=? AND tenant_id=? AND payment_order_id=? AND deleted_at IS NOT NULL AND storage_deleted_at IS NULL
  AND content_sha256=? AND object_etag=?`)
  .bind(documentId,tenantId,orderId,expectedSha256,expectedEtag);
 const audit=await appendSealedAuditEvent(env,{tenantId,actorUserId:actor.userId,eventType:'POP_STORAGE_REMOVED',entityType:'payment_pop_document',entityId:documentId,
  eventData:{sha256:expectedSha256,etag:expectedEtag,quotaReleased:false,bankFundsConfirmed:false},mutation});
 if(!audit.ok){
  row=snapshot(await popStoredDocument(env,scope),options);
  if(!row.deleted_at||!row.storage_deleted_at)throw Error('pop_retirement_conflict');
  replayed=true;
 }
 return {documentId,deleted:true,storageDeleted:true,replayed,quotaReleased:false,bankFundsConfirmed:false,subscriptionActivated:false};
}
export async function inspectPopRecovery(env,{actor,documentId,tenantId,orderId,reason}={}){
 qualification(env,actor,'POP_RECOVERY_STAGING_ENABLED','pop_recovery');
 const basis=reasonText(reason,'pop_recovery'),key=popQuarantineKey({documentId,tenantId,orderId});
 const reservation=await env.DB.prepare('SELECT state,bytes FROM payment_pop_upload_requests WHERE document_id=? AND tenant_id=? AND payment_order_id=?').bind(documentId,tenantId,orderId).first();
 if(!reservation)throw Error('pop_recovery_scope_not_found');
 const row=await env.DB.prepare('SELECT object_key,object_etag,bytes,deleted_at,storage_deleted_at FROM payment_pop_documents WHERE id=? AND tenant_id=? AND payment_order_id=?').bind(documentId,tenantId,orderId).first();
 let object,known=true;try{object=await env.EVIDENCE.head(key)}catch{known=false}
 let observation,needsReconciliation=true;
 const matches=object&&row&&row.object_key===key&&row.object_etag===object.etag&&row.bytes===object.size;
 if(row&&row.object_key!==key)observation='metadata_scope_mismatch';
 else if(!known)observation='storage_unavailable';
 else if(reservation.state==='stored'&&row){
  if(row.deleted_at){
   if(row.storage_deleted_at){observation=object?'retired_object_present':'retired_object_absent';needsReconciliation=!!object}
   else observation=!object?'cleanup_confirmation_pending':matches?'cleanup_pending':'object_identity_mismatch';
  }else {observation=!object?'stored_object_missing':matches?'active_stored_metadata_matches':'object_identity_mismatch';needsReconciliation=!matches}
 }else if(reservation.state==='reserved')observation=row?'reservation_metadata_mismatch':object?'reserved_object_present':'reserved_object_absent';
 else if(reservation.state==='failed'){observation=row?'failed_metadata_mismatch':object?'failed_object_present':'failed_object_absent';needsReconciliation=!!row||!!object}
 else observation='reservation_state_mismatch';
 const report={documentId,reservationState:reservation.state,metadataPresent:!!row,objectPresent:known?!!object:null,observation,needsReconciliation,quotaReleased:false,bankFundsConfirmed:false,subscriptionActivated:false};
 await appendSealedAuditEvent(env,{tenantId,actorUserId:actor.userId,eventType:'POP_RECOVERY_INSPECTED',entityType:'payment_pop_upload',entityId:documentId,eventData:{...report,reason:basis}});
 return report;
}
