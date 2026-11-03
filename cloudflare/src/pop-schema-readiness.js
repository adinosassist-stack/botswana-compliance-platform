// Bounded, read-only POP schema observation for public readiness.
// This is operational visibility, NOT migration provenance or authorization.
const REQUIRED_OBJECTS = Object.freeze([
  "payment_pop_documents",
  "payment_pop_upload_requests",
  "payment_pop_documents_order_idx",
  "payment_pop_documents_scan_idx",
  "payment_pop_upload_requests_tenant_idx"
]);
const REQUIRED_DOCUMENT_COLUMNS = Object.freeze([
  "id","tenant_id","payment_order_id","submission_id","source","object_key",
  "display_name","content_type","bytes","scan_status","received_by_user_id",
  "uploaded_at","deleted_at","content_sha256","object_etag","scan_request_id",
  "scan_requested_at","scan_request_expires_at","scan_result_hash",
  "scan_result_body","scan_result_signature","scanner_provider","scanned_at",
  "last_owner_read_at","storage_deleted_at"
]);
const REQUIRED_REQUEST_COLUMNS = Object.freeze([
  "document_id","tenant_id","payment_order_id","key_hash",
  "request_hash","bytes","state","created_at"
]);

export async function observePopSchema(env) {
  if (typeof env?.DB?.prepare !== "function") return {popSchemaReady:false,popSchemaStatus:"unavailable"};
  try {
    // Fixed SQL only; no customer data, no user-provided identifiers, no writes.
    const objects = await env.DB.prepare(
      "SELECT name,type FROM sqlite_master WHERE name IN ('payment_pop_documents','payment_pop_upload_requests','payment_pop_documents_order_idx','payment_pop_documents_scan_idx','payment_pop_upload_requests_tenant_idx')"
    ).all();
    const entries=objects?.results;
    if(!Array.isArray(entries)) throw Error("schema_inventory_unavailable");
    const found=new Map(entries.map(x=>[x.name,x.type]));
    const present=REQUIRED_OBJECTS.every((name,i)=>found.get(name)===(i<2?"table":"index"));
    if(!present) return {popSchemaReady:false,popSchemaStatus:"missing"};
    const doc=await env.DB.prepare("PRAGMA table_info('payment_pop_documents')").all();
    const request=await env.DB.prepare("PRAGMA table_info('payment_pop_upload_requests')").all();
    if(!Array.isArray(doc?.results)||!Array.isArray(request?.results))throw Error("schema_columns_unavailable");
    const documentColumns=new Set(doc.results.map(c=>c.name));
    const requestColumns=new Set(request.results.map(c=>c.name));
    const valid=REQUIRED_DOCUMENT_COLUMNS.every(c=>documentColumns.has(c))&&
      REQUIRED_REQUEST_COLUMNS.every(c=>requestColumns.has(c));
    return {popSchemaReady:valid,popSchemaStatus:valid?"present":"incomplete"};
  } catch {
    return {popSchemaReady:false,popSchemaStatus:"unavailable"};
  }
}
