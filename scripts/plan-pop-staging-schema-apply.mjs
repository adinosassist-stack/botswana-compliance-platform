// Reviewable staging-only initialization plan. Execution is deliberately disabled.
// The D1 staging database must never be treated as production migration authority.
import {validateStagingTarget} from './pop-staging-target-guard.mjs';
export function planStagingSchemaApply({sourceSha,currentMainSha,existingObjects,definitions,confirmation}) {
 const guard=validateStagingTarget({target:'812f9021-890b-41e6-8fa1-6001f90a9b53',
 sourceSha,currentMainSha,existingObjects,confirmation});
 if(!Array.isArray(definitions)||definitions.length<500)throw Error('schema_incomplete');
 const seen=new Set();
 const counts={table:0,index:0,view:0,trigger:0};
 for(const d of definitions){
  if(!d||!Object.hasOwn(counts,d.type)||typeof d.name!=='string'||
     typeof d.sql!=='string'||!/^CREATE\s/i.test(d.sql)||
     d.name==='_cf_KV'||seen.has(d.type+':'+d.name))throw Error('schema_definition_invalid');
  seen.add(d.type+':'+d.name);counts[d.type]++;
 }
 for(const name of ['tenants','payment_orders','manual_payment_submissions']){
  if(!seen.has('table:'+name))throw Error('missing_dependency_'+name);
 }
 if([...seen].some(x=>x.includes('payment_pop_documents')||x.includes('payment_pop_upload_requests')))
  throw Error('schema_already_pop_migrated');
 return {target:guard.target,sourceSha,definitionCount:definitions.length,
  counts,requiresIndependentReview:true,executionAuthorized:false,
  productionWritesPermitted:false,sqlExecuted:false};
}
