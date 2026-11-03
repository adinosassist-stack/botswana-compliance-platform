import {popQuarantineKey} from './payment-pop-storage-boundary.js';
import {popSha256} from './payment-pop-upload-reservations.js';
import {MAX_POP_BYTES,validatePopUpload} from './payment-pop-validation.js';
import {appendSealedAuditEvent} from './audit-lineage-writer.js';
const encoder=new TextEncoder(),HEX=/^[a-f0-9]{64}$/;
export const POP_SCAN_WINDOW_MS=5*60*1000;
export function assertPopScanQualification(env){
 if(env?.APP_ENV!=='staging'||env?.DEPLOYMENT_PROFILE!=='billing-staging-readonly'||env?.POP_SCAN_STAGING_ENABLED!=='true')throw Error('pop_scanner_forbidden');
 if(typeof env.POP_SCAN_SECRET!=='string'||env.POP_SCAN_SECRET.trim().length<32||env.POP_SCAN_SECRET===env.AUDIT_INTEGRITY_SECRET||env.POP_SCAN_SECRET===env.EVIDENCE_SCAN_SECRET||!(/^[A-Za-z0-9._-]{1,80}$/).test(String(env.POP_SCANNER_ID||'')))throw Error('pop_scanner_not_configured');
 return {secret:env.POP_SCAN_SECRET,provider:env.POP_SCANNER_ID};
}
async function signingKey(secret,usage){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,[usage])}
async function sign(secret,value){const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(secret,'sign'),encoder.encode(value)));return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function validSignature(secret,body,signature){
 if(typeof signature!=='string'||!HEX.test(signature))return false;
 const bytes=new Uint8Array(signature.match(/../g).map(x=>parseInt(x,16)));
 return crypto.subtle.verify('HMAC',await signingKey(secret,'verify'),bytes,encoder.encode('pop-scan-response:v1:'+body));
}
export async function popStoredDocument(env,{documentId,tenantId,orderId}){
 popQuarantineKey({documentId,tenantId,orderId});
 return env.DB.prepare(`SELECT d.* FROM payment_pop_documents d JOIN payment_pop_upload_requests r
  ON r.document_id=d.id AND r.tenant_id=d.tenant_id AND r.payment_order_id=d.payment_order_id
  WHERE d.id=? AND d.tenant_id=? AND d.payment_order_id=? AND r.state='stored' LIMIT 1`).bind(documentId,tenantId,orderId).first();
}
export async function verifiedPopBytes(env,row){
 if(!HEX.test(String(row?.content_sha256||''))||!row?.object_etag||!Number.isInteger(row.bytes)||row.bytes<8||row.bytes>MAX_POP_BYTES)throw Error('pop_object_identity_required');
 const key=popQuarantineKey({tenantId:row.tenant_id,orderId:row.payment_order_id,documentId:row.id});
 if(row.object_key!==key)throw Error('pop_object_identity_mismatch');
 const object=await env.EVIDENCE.get(key);if(!object)throw Error('pop_object_missing');
 if(object.etag!==row.object_etag||object.size!==row.bytes)throw Error('pop_object_identity_mismatch');
 const bytes=new Uint8Array(await object.arrayBuffer());
 if(bytes.byteLength!==row.bytes||await popSha256(bytes)!==row.content_sha256)throw Error('pop_object_identity_mismatch');
 validatePopUpload(bytes,row.display_name,row.content_type);
 return bytes;
}
// Prepares a signed scanner request only. No provider URL, network call, route or
// scheduled handler is installed here; transport/provider qualification is separate.
export async function preparePopScanRequest(env,scope){
 const {secret}=assertPopScanQualification(env);
 const row=await popStoredDocument(env,scope);
 if(!row||row.scan_status!=='pending'||row.deleted_at!=null)throw Error('pop_scan_transition_failed');
 const bytes=await verifiedPopBytes(env,row);
 const issuedAt=Date.now(),expiresAt=issuedAt+POP_SCAN_WINDOW_MS,requestId=crypto.randomUUID();
 const changed=await env.DB.prepare(`UPDATE payment_pop_documents SET scan_request_id=?,scan_requested_at=?,scan_request_expires_at=?
  WHERE id=? AND tenant_id=? AND payment_order_id=? AND scan_status='pending' AND deleted_at IS NULL
  AND content_sha256=? AND object_etag=? AND (scan_request_id IS NULL OR scan_request_expires_at<?)`)
  .bind(requestId,issuedAt,expiresAt,row.id,row.tenant_id,row.payment_order_id,row.content_sha256,row.object_etag,issuedAt).run();
 if(changed.meta?.changes!==1)throw Error('pop_scan_in_progress');
 const metadata=JSON.stringify({version:1,documentId:row.id,tenantId:row.tenant_id,orderId:row.payment_order_id,requestId,sha256:row.content_sha256,etag:row.object_etag,bytes:row.bytes,contentType:row.content_type,issuedAt,expiresAt});
 return {metadata,signature:await sign(secret,'pop-scan-request:v1:'+metadata),bytes};
}
async function decodedResult(env,body,signature){
 const {secret,provider}=assertPopScanQualification(env);
 if(typeof body!=='string'||body.length>16384||!(await validSignature(secret,body,signature)))throw Error('pop_scanner_forbidden');
 let data;try{data=JSON.parse(body)}catch{throw Error('pop_invalid_scan_result')}
 const fields=['version','documentId','tenantId','orderId','requestId','sha256','etag','bytes','contentType','verdict','provider','scannedAt'];
 if(data?.version!==1||Object.keys(data).some(k=>!fields.includes(k))||!['clean','blocked','failed'].includes(data.verdict)||data.provider!==provider||!Number.isSafeInteger(data.scannedAt))throw Error('pop_invalid_scan_result');
 return {data,provider};
}
function matchingRecord(row,data){
 return row&&row.id===data.documentId&&row.tenant_id===data.tenantId&&row.payment_order_id===data.orderId&&
  row.scan_request_id&&row.scan_request_id===data.requestId&&row.content_sha256===data.sha256&&row.object_etag===data.etag&&
  row.bytes===data.bytes&&row.content_type===data.contentType&&Number.isSafeInteger(row.scan_requested_at)&&Number.isSafeInteger(row.scan_request_expires_at)&&
  data.scannedAt>=row.scan_requested_at-30000&&data.scannedAt<=row.scan_request_expires_at;
}
export async function verifiedPopScanRecord(env,row){
 try{
  const {data}=await decodedResult(env,row.scan_result_body,row.scan_result_signature);
  if(data.verdict!=='clean'||!matchingRecord(row,data)||!row.scanned_at||await popSha256(row.scan_result_body)!==row.scan_result_hash)throw Error('pop_not_reviewable');
 }catch{throw Error('pop_not_reviewable')}
}
export async function applyPopScanResult(env,{body,signature}={}){
 const {data,provider}=await decodedResult(env,body,signature);
 const row=await popStoredDocument(env,data);
 const now=Date.now();
 if(!matchingRecord(row,data)||row.scan_status!=='pending'||row.deleted_at!=null||row.scan_request_expires_at<now||data.scannedAt>now+30000)throw Error('pop_scan_transition_failed');
 await verifiedPopBytes(env,row);
 const resultHash=await popSha256(body);
 const mutation=env.DB.prepare(`UPDATE payment_pop_documents SET scan_status=?,scan_result_hash=?,scan_result_body=?,scan_result_signature=?,scanner_provider=?,scanned_at=CURRENT_TIMESTAMP
  WHERE id=? AND tenant_id=? AND payment_order_id=? AND scan_status='pending' AND deleted_at IS NULL
  AND scan_request_id=? AND content_sha256=? AND object_etag=? AND bytes=? AND content_type=?
  AND scan_request_expires_at>=CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)`)
  .bind(data.verdict,resultHash,body,signature,provider,row.id,row.tenant_id,row.payment_order_id,data.requestId,data.sha256,data.etag,data.bytes,data.contentType);
 const audit=await appendSealedAuditEvent(env,{tenantId:row.tenant_id,eventType:'POP_SCAN_RESULT',entityType:'payment_pop_document',entityId:row.id,
  eventData:{requestId:data.requestId,verdict:data.verdict,provider,sha256:data.sha256,etag:data.etag,resultHash,bankFundsConfirmed:false},mutation});
 if(!audit.ok)throw Error('pop_scan_transition_failed');
 return {documentId:row.id,scanStatus:data.verdict,bankFundsConfirmed:false,subscriptionActivated:false};
}
