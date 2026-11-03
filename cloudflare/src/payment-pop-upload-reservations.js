import {MAX_POP_BYTES} from './payment-pop-validation.js';
import {popQuarantineKey} from './payment-pop-storage-boundary.js';

// Conservative admission budgets include reserved and failed attempts. Releasing
// capacity requires a separately qualified reconciliation/retention policy.
export const POP_UPLOAD_LIMITS=Object.freeze({perOrder:5,perTenantDay:20,perTenantTotal:100,perTenantBytes:50*1024*1024});
export async function popSha256(value){
 const bytes=value instanceof Uint8Array?value:new TextEncoder().encode(String(value));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export const validPopRequestKey=value=>typeof value==='string'&&(/^[A-Za-z0-9._:-]{16,128}$/).test(value);
const find=(db,tenantId,orderId,keyHash)=>db.prepare('SELECT document_id,request_hash,state FROM payment_pop_upload_requests WHERE tenant_id=? AND payment_order_id=? AND key_hash=?').bind(tenantId,orderId,keyHash).first();
function existingRequest(row,requestHash){
 if(row.request_hash!==requestHash)throw Error('pop_idempotency_conflict');
 if(row.state==='reserved')throw Error('pop_upload_in_progress');
 if(row.state==='failed')throw Error('pop_upload_previous_failure');
 if(row.state!=='stored')throw Error('pop_upload_reconciliation_required');
 return {documentId:row.document_id,requestHash,replayed:true};
}
export async function reservePopUpload(db,{tenantId,orderId,documentId,requestKey,requestHash,bytes}={}){
 popQuarantineKey({tenantId,orderId,documentId});
 if(!validPopRequestKey(requestKey))throw Error('invalid_pop_idempotency_key');
 if(!/^[a-f0-9]{64}$/.test(String(requestHash||''))||!Number.isInteger(bytes)||bytes<1||bytes>MAX_POP_BYTES)throw Error('invalid_pop_reservation');
 const keyHash=await popSha256(requestKey);
 const previous=await find(db,tenantId,orderId,keyHash);if(previous)return existingRequest(previous,requestHash);
 let row;
 try{
  // The checks and insertion form ONE SQLite statement. An application-side
  // count followed by an insert would allow simultaneous requests past a cap.
  row=await db.prepare(`INSERT INTO payment_pop_upload_requests(document_id,tenant_id,payment_order_id,key_hash,request_hash,bytes)
   SELECT ?,?,?,?,?,?
   WHERE (SELECT COUNT(*) FROM payment_pop_upload_requests WHERE tenant_id=? AND payment_order_id=?)<?
   AND (SELECT COUNT(*) FROM payment_pop_upload_requests WHERE tenant_id=? AND datetime(created_at)>=datetime('now','-1 day'))<?
   AND (SELECT COUNT(*) FROM payment_pop_upload_requests WHERE tenant_id=?)<?
   AND (SELECT COALESCE(SUM(bytes),0) FROM payment_pop_upload_requests WHERE tenant_id=?)+?<=?
   RETURNING document_id`).bind(documentId,tenantId,orderId,keyHash,requestHash,bytes,
    tenantId,orderId,POP_UPLOAD_LIMITS.perOrder,tenantId,POP_UPLOAD_LIMITS.perTenantDay,tenantId,POP_UPLOAD_LIMITS.perTenantTotal,tenantId,bytes,POP_UPLOAD_LIMITS.perTenantBytes).first();
 }catch(error){
  const winner=await find(db,tenantId,orderId,keyHash);if(winner)return existingRequest(winner,requestHash);
  throw error;
 }
 if(!row){const winner=await find(db,tenantId,orderId,keyHash);if(winner)return existingRequest(winner,requestHash);throw Error('pop_upload_quota_exceeded')}
 return {documentId:row.document_id,requestHash,replayed:false};
}
export async function popReservationState(db,{tenantId,orderId,documentId,requestHash}){
 return db.prepare('SELECT state FROM payment_pop_upload_requests WHERE document_id=? AND tenant_id=? AND payment_order_id=? AND request_hash=?').bind(documentId,tenantId,orderId,requestHash).first();
}
export async function failPopReservation(db,{tenantId,orderId,documentId,requestHash}){
 const r=await db.prepare("UPDATE payment_pop_upload_requests SET state='failed' WHERE document_id=? AND tenant_id=? AND payment_order_id=? AND request_hash=? AND state='reserved'").bind(documentId,tenantId,orderId,requestHash).run();
 if(r.meta?.changes!==1)throw Error('pop_upload_reconciliation_required');
}
