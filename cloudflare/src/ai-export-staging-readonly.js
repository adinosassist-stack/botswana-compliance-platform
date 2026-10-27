/**
 * Read-only, UNREGISTERED inspection of prospective AI-export storage in staging.
 * This is NOT a production activation or an export capability endpoint.
 * No user data, document bytes, or object keys are returned.
 * Requires a dedicated env.EXPORTS R2 binding; never reuse env.EVIDENCE.
 */
const SENTINEL_KEY = "ai-exports/_preflight_/missing-object";
const TABLE_NAME = "ai_document_export_jobs";
export async function inspectAiExportStaging({env,authorized=false}={}){
 const result={ok:false,mode:"read_only",productionReady:false,
  checks:{environment:false,dedicatedBucket:false,metadataTable:false,bucketReachable:false},
  reasons:[]};
 if(authorized!==true||env?.APP_ENV!=="staging"){
  result.reasons.push("staging_read_authorization_required");
  return result;
 }
 result.checks.environment=true;
 if(!env.DB||typeof env.DB.prepare!=="function"){
  result.reasons.push("staging_d1_binding_missing");
 }else{
  try {
   const query=env.DB.prepare("SELECT name FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1");
   const row=await query.bind("table",TABLE_NAME).first();
   result.checks.metadataTable=row?.name===TABLE_NAME;
   if(!result.checks.metadataTable)result.reasons.push("export_metadata_schema_not_applied");
  }catch{
   result.reasons.push("staging_d1_read_failed");
  }
 }
 if(!env.EXPORTS||env.EXPORTS===env.EVIDENCE||typeof env.EXPORTS.head!=="function"){
  result.reasons.push("dedicated_private_export_r2_binding_required");
 }else{
  result.checks.dedicatedBucket=true;
  try{
   // A missing HEAD sentinel is an expected reply; no object creation or deletion.
   const found=await env.EXPORTS.head(SENTINEL_KEY);
   if(found===null){
    result.checks.bucketReachable=true;
   }else result.reasons.push("staging_sentinel_collision");
  }catch{
   result.reasons.push("staging_r2_read_failed");
  }
 }
 result.ok=result.checks.environment&&result.checks.dedicatedBucket&&
    result.checks.metadataTable&&result.checks.bucketReachable;
 if(result.ok)result.reasons.push("read_only_checks_passed_not_production_qualification");
 return result;
}
