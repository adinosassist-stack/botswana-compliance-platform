// Pure, offline catalog/DDL policy for the *already populated* schema-only POP staging lane.
// Observing exactly reviewed additions is NOT an executed-migration receipt or deployment authority.
const KINDS=new Set(['table','index','trigger','view']);
export const REVIEWED_POP_ADDITIONS=Object.freeze({
 'table:payment_pop_documents':'payment_pop_documents',
 'index:payment_pop_documents_order_idx':'payment_pop_documents',
 'index:payment_pop_documents_scan_idx':'payment_pop_documents',
 'table:payment_pop_upload_requests':'payment_pop_upload_requests',
 'index:payment_pop_upload_requests_tenant_idx':'payment_pop_upload_requests'
});
const REQUIRED_BASE=['table:tenants','table:payment_orders','table:manual_payment_submissions'];
const fail=reason=>{throw Error('pop_staging_catalog_'+reason)};
function normalize(rows,requireDigest=false){
 if(!Array.isArray(rows)||rows.length===0||rows.length>5000)fail('invalid_shape');
 const items=new Map();
 for(const row of rows){
  if(!row||typeof row!=='object'||!KINDS.has(row.type)||
    typeof row.name!=='string'||!row.name||typeof row.tbl_name!=='string'||!row.tbl_name)fail('invalid_row');
  const key=row.type+':'+row.name;
  if(items.has(key))fail('duplicate');
  if(requireDigest&&row.type!=='index'&&row.digest===null)fail('missing_ddl');
  if(requireDigest && !(row.digest===null&&row.type==='index') &&
     !(typeof row.digest==='string'&&/^[a-f0-9]{64}$/.test(row.digest)))fail('invalid_digest');
  items.set(key,{owner:row.tbl_name,digest:requireDigest?row.digest:undefined});
 }
 return items;
}
function evaluate(prod,stage){
 const missingBase=REQUIRED_BASE.filter(x=>!prod.has(x));
 const productionPop=[...Object.keys(REVIEWED_POP_ADDITIONS)].filter(x=>prod.has(x));
 const missing=[...prod.keys()].filter(x=>!stage.has(x));
 const unexpected=[...stage.keys()].filter(x=>!prod.has(x)&&!Object.hasOwn(REVIEWED_POP_ADDITIONS,x));
 const expectedMissing=Object.keys(REVIEWED_POP_ADDITIONS).filter(x=>!stage.has(x));
 const changedOwners=[...prod.keys()].filter(x=>stage.has(x)&&prod.get(x).owner!==stage.get(x).owner);
 const incorrectPopOwners=Object.entries(REVIEWED_POP_ADDITIONS).filter(([key,owner])=>
    stage.has(key)&&stage.get(key).owner!==owner);
 const match=missingBase.length===0&&productionPop.length===0&&missing.length===0&&
   unexpected.length===0&&expectedMissing.length===0&&changedOwners.length===0&&incorrectPopOwners.length===0;
 return {
  kind:'pop_070_071_schema_only_catalog_review',production_objects:prod.size,staging_objects:stage.size,
  reviewed_pop_addition_count:Object.keys(REVIEWED_POP_ADDITIONS).length,
  production_base_prerequisites_missing:missingBase.length,production_pop_objects_present:productionPop.length,
  staging_production_objects_missing:missing.length,unexpected_staging_objects:unexpected.length,
  reviewed_pop_objects_missing:expectedMissing.length,shared_owner_mismatches:changedOwners.length,
  pop_object_owner_mismatches:incorrectPopOwners.length,catalog_matches_reviewed_pop_additions:match,
  migration_receipts_verified:false,reviewed_pre070_lineage_verified:false,
  application_recovery_verified:false,production_migration_authorized:false,mutation_performed:false,
  disposition:'HOLD_MIGRATION_PROVENANCE_REPLAY_AND_INDEPENDENT_ACCEPTANCE'
 };
}
export function assessPopStagingCatalog(productionRows,stagingRows){
 return Object.freeze(evaluate(normalize(productionRows),normalize(stagingRows)));
}
export function assessPopStagingDdl(productionRows,stagingRows){
 const prod=normalize(productionRows,true),stage=normalize(stagingRows,true);
 const catalog=evaluate(prod,stage);
 const changed=[...prod.keys()].filter(key=>stage.has(key)&&prod.get(key).digest!==stage.get(key).digest);
 return Object.freeze({
  ...catalog,kind:'pop_070_071_schema_only_ddl_digest_review',
  shared_ddl_mismatches:changed.length,
  schema_definitions_match_reviewed_pop_additions:catalog.catalog_matches_reviewed_pop_additions&&changed.length===0,
  ddl_text_logged:false,customer_rows_read:false
 });
}
