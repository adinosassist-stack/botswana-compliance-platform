// Static POP 070/071 phase validation. Never connects to Cloudflare or executes SQL.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const migrations={
 '070':['cloudflare/migrations/070_payment_pop_documents.sql','f52f9c8e429670cf2e5956b7610e7f1e9b8594e946470ee331ecf06f979c9261'],
 '071':['cloudflare/migrations/071_payment_pop_runtime_compat.sql','24cb1d9e42ef6edaaf04ba53f3945f5112cc61b0c3d52010480be4603c38dc3c']
};
const need=(yes,reason)=>{if(!yes)throw Error('pop_phase_hold_'+reason)};
export function qualifyPhase({phase,mainSha,expectedSha,accountId,databaseId,tableNames,indexNames,documentColumnNames,requestColumnNames},read=readFileSync){
 need(Object.hasOwn(migrations,phase),'phase');
 need(/^[0-9a-f]{40}$/.test(mainSha||'')&&mainSha===expectedSha,'stale_main');
 need(accountId==='ddd23cab31928a4bb3d4998df9b26d1d'&&databaseId==='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce','target');
 const [path,expectedDigest]=migrations[phase];
 need(createHash('sha256').update(read(path)).digest('hex')===expectedDigest,'sql_drift');
 for(const names of [tableNames,indexNames,documentColumnNames,requestColumnNames])need(Array.isArray(names)&&names.every(n=>typeof n==='string')&&new Set(names).size===names.length,'inventory');
 for(const table of ['tenants','payment_orders','manual_payment_submissions'])need(tableNames.includes(table),'prerequisite');
 const docs=tableNames.includes('payment_pop_documents');
 const requests=tableNames.includes('payment_pop_upload_requests');
 const indexes=['payment_pop_documents_order_idx','payment_pop_documents_scan_idx'];
 const requestIndex=indexNames.includes('payment_pop_upload_requests_tenant_idx');
 // Reject unknown POP-prefixed objects, including remnants of an incomplete
 // or out-of-band migration. A catalog with extra POP objects is not clean.
 const expectedPopObjects=phase==='070'?new Set():new Set([
  'payment_pop_documents','payment_pop_documents_order_idx','payment_pop_documents_scan_idx'
 ]);
 need(![...tableNames,...indexNames].some(name=>
  name.startsWith('payment_pop_')&&!expectedPopObjects.has(name)
 ),phase+'_partial_or_replayed');
 if(phase==='070')need(!docs&&!requests&&!indexes.some(n=>indexNames.includes(n))&&!requestIndex&&!documentColumnNames.length&&!requestColumnNames.length,'070_partial_or_replayed');
 if(phase==='071'){
  need(docs&&indexes.every(n=>indexNames.includes(n)),'070_incomplete');
  need(!requests&&!requestIndex&&!requestColumnNames.length,'071_partial_or_replayed');
  const original=['id','tenant_id','payment_order_id','submission_id','source','object_key','display_name','content_type','bytes','scan_status','received_by_user_id','uploaded_at','deleted_at'];
  need(documentColumnNames.length===original.length&&original.every(n=>documentColumnNames.includes(n)),'071_columns_partial_or_replayed');
 }
 return {phase,sourceSha:mainSha,sqlPath:path,sqlSha256:expectedDigest,inventoryReview:'eligible_for_independent_review',productionWriteAuthorized:false,migrationApplied:false,popEnabled:false,subscriptionActivated:false};
}
