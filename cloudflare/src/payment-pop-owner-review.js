import {applyPopScanResult,assertPopScanQualification,popStoredDocument,verifiedPopBytes,verifiedPopScanRecord} from './payment-pop-scan-verification.js';
import {appendSealedAuditEvent} from './audit-lineage-writer.js';
import {popOwnerReadAllowed} from "./payment-pop-storage-boundary.js";
// Server-only POP review functions. Caller identity must come from verified session.
export async function listPopForPlatformOwner(env,{actor,orderId}={}){
 if(actor?.platformOwner!==true)throw Error("pop_owner_forbidden");
 if(!env?.DB?.prepare)throw Error("pop_db_unavailable");
 const result=await env.DB.prepare("SELECT id,tenant_id,payment_order_id,display_name,content_type,bytes,scan_status,uploaded_at FROM payment_pop_documents WHERE payment_order_id=? AND deleted_at IS NULL ORDER BY uploaded_at DESC LIMIT 50").bind(orderId).all();
 return {items:result.results||[],bankFundsConfirmed:false};
}
export async function markPopScanResult(env,args={}){return applyPopScanResult(env,args)}
export async function readCleanPopForOwner(env,{actor,documentId,orderId,tenantId}={}){
 if(actor?.platformOwner!==true||!actor?.userId)throw Error("pop_owner_forbidden");
 if(env.POP_OWNER_RETRIEVAL_STAGING_ENABLED!=='true')throw Error('pop_owner_review_disabled');
 const {provider}=assertPopScanQualification(env);
 const row=await popStoredDocument(env,{documentId,orderId,tenantId});
 if(!popOwnerReadAllowed({platformOwner:true,tenantMatches:row?.tenant_id===tenantId,scanStatus:row?.scan_status,deletedAt:row?.deleted_at})||
    !/^[a-f0-9]{64}$/.test(String(row?.scan_result_hash||''))||row?.scanner_provider!==provider||!row?.scanned_at)throw Error("pop_not_reviewable");
 await verifiedPopScanRecord(env,row);
 const bytes=await verifiedPopBytes(env,row);
 const mutation=env.DB.prepare(`UPDATE payment_pop_documents SET last_owner_read_at=CURRENT_TIMESTAMP
  WHERE id=? AND tenant_id=? AND payment_order_id=? AND scan_status='clean' AND deleted_at IS NULL
  AND content_sha256=? AND object_etag=? AND scan_result_hash=? AND scanner_provider=?`)
  .bind(row.id,row.tenant_id,row.payment_order_id,row.content_sha256,row.object_etag,row.scan_result_hash,provider);
 const audit=await appendSealedAuditEvent(env,{tenantId:row.tenant_id,actorUserId:actor.userId,eventType:'POP_OWNER_DOWNLOAD',entityType:'payment_pop_document',entityId:row.id,
  eventData:{sha256:row.content_sha256,scanResultHash:row.scan_result_hash,bankFundsConfirmed:false},mutation});
 if(!audit.ok)throw Error('pop_not_reviewable');
 const filename=String(row.display_name||'receipt').replace(/[^A-Za-z0-9._ -]/g,'_').slice(0,120)||'receipt';
 return new Response(bytes,{headers:{'content-type':'application/octet-stream','content-disposition':'attachment; filename="'+filename+'"',
  'content-length':String(bytes.length),'cache-control':'private, no-store, max-age=0','pragma':'no-cache','expires':'0',
  'x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'",'referrer-policy':'no-referrer'}});
}
