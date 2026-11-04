import test from 'node:test';
import assert from 'node:assert/strict';
import {REVIEWED_POP_ADDITIONS,assessPopStagingCatalog,assessPopStagingDdl} from '../scripts/pop-staging-schema-policy.mjs';
const hash='a'.repeat(64);
const prod=[
 {type:'table',name:'tenants',tbl_name:'tenants',digest:hash},
 {type:'table',name:'payment_orders',tbl_name:'payment_orders',digest:hash},
 {type:'table',name:'manual_payment_submissions',tbl_name:'manual_payment_submissions',digest:hash},
 {type:'index',name:'idx_existing',tbl_name:'payment_orders',digest:hash}
];
const extras=Object.entries(REVIEWED_POP_ADDITIONS).map(([key,owner])=>{
 const [type,name]=key.split(':');return {type,name,tbl_name:owner,digest:hash};
});
const stage=()=>[...prod.map(x=>({...x})),...extras.map(x=>({...x}))];
test('reviewed 070/071 objects are the only allowed staging schema additions, never production approval',()=>{
 const c=assessPopStagingCatalog(prod,stage()),d=assessPopStagingDdl(prod,stage());
 assert.equal(c.catalog_matches_reviewed_pop_additions,true);
 assert.equal(c.reviewed_pop_addition_count,5);
 assert.equal(c.staging_objects,prod.length+5);
 assert.equal(d.schema_definitions_match_reviewed_pop_additions,true);
 assert.equal(d.shared_ddl_mismatches,0);
 for(const r of [c,d]){
  assert.equal(r.migration_receipts_verified,false);
  assert.equal(r.reviewed_pre070_lineage_verified,false);
  assert.equal(r.production_migration_authorized,false);
  assert.equal(r.application_recovery_verified,false);
  assert.equal(r.mutation_performed,false);
  assert.match(r.disposition,/^HOLD_/);
 }
});
test('missing or extra staging objects, production POP objects, wrong owners and base drift fail closed',()=>{
 const variants=[
  {p:prod,s:stage().slice(0,-1)},
  {p:prod,s:[...stage(),{type:'table',name:'unreviewed',tbl_name:'unreviewed',digest:hash}]},
  {p:[...prod,extras[0]],s:stage()},
  {p:prod,s:stage().filter(x=>x.name!=='payment_orders')},
  {p:prod,s:stage().map(x=>x.name==='payment_pop_documents'?{...x,tbl_name:'tenants'}:x)},
  {p:prod.slice(1),s:stage()}
 ];
 for(const {p,s} of variants){
  assert.equal(assessPopStagingCatalog(p,s).catalog_matches_reviewed_pop_additions,false);
  assert.equal(assessPopStagingDdl(p,s).schema_definitions_match_reviewed_pop_additions,false);
 }
});
test('unchanged object names cannot conceal changed shared SQL definitions',()=>{
 const drift=stage().map(x=>x.name==='payment_orders'?{...x,digest:'b'.repeat(64)}:x);
 const d=assessPopStagingDdl(prod,drift);
 assert.equal(d.catalog_matches_reviewed_pop_additions,true);
 assert.equal(d.shared_ddl_mismatches,1);
 assert.equal(d.schema_definitions_match_reviewed_pop_additions,false);
});
test('untrusted catalog, duplicate keys, invalid digests and missing DDL cannot pass',()=>{
 const bad=[
  [prod,[...stage(),{...extras[0]}]],
  [prod,[...stage(),{...extras[0],name:''}]],
  [prod,[...stage(),{...extras[0],type:'other'}]]
 ];
 for(const [p,s] of bad)assert.throws(()=>assessPopStagingCatalog(p,s),/pop_staging_catalog_/);
 assert.throws(()=>assessPopStagingDdl(prod,stage().map(x=>({...x,digest:'bad'}))),/pop_staging_catalog_invalid_digest/);
 assert.throws(()=>assessPopStagingDdl(prod,stage().map(x=>x.name==='tenants'?{...x,digest:null}:x)),/pop_staging_catalog_missing_ddl/);
 assert.throws(()=>assessPopStagingCatalog([],stage()),/pop_staging_catalog_invalid_shape/);
});
test('nullable SQLite automatic index DDL is accepted only for index objects',()=>{
 const auto={type:'index',name:'idx_nullable',tbl_name:'tenants',digest:null};
 const p=[...prod,auto],s=[...stage(),auto];
 const r=assessPopStagingDdl(p,s);
 assert.equal(r.schema_definitions_match_reviewed_pop_additions,true);
});
