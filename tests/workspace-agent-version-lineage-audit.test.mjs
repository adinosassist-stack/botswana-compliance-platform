import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkVersionLineage,PINNED_INERT} from '../scripts/workspace-agent-version-lineage-audit.mjs';
const STRANDED='9ba41e62-9efc-49c5-9d4e-d667057e43fb';
const wrap=items=>({success:true,result:{items}});
function input(latest=STRANDED){
  const a={id:PINNED_INERT,number:11,metadata:{created_on:'2026-11-15T20:00:00.123Z'}};
  const b={id:STRANDED,number:12,metadata:{created_on:'2026-11-15T21:00:00Z'}};
  if(latest===PINNED_INERT){a.number=13;b.number=12;}
  return [wrap([b,a]),wrap([]),{success:true,result:{deployments:[{versions:[{version_id:PINNED_INERT,percentage:100}]}]}}];
}
test('blocks latest-upload inheritance if the deployed inert version is older',()=>{
 const r=checkVersionLineage(...input());
 assert.deepEqual(r,{valid:true,canInheritFromLatest:false,reason:'latest_upload_differs_from_pinned'});
});
test('classification can be consistent without authorizing any write',()=>{
 const r=checkVersionLineage(...input(PINNED_INERT));
 assert.equal(r.valid,true);assert.equal(r.canInheritFromLatest,true);
});
test('fails closed on second page with additional uploaded versions',()=>{
 const x=input();x[1]=wrap([{id:STRANDED,number:14,metadata:{created_on:'2026-11-15T21:10:00Z'}}]);
 assert.equal(checkVersionLineage(...x).reason,'version_list_incomplete_or_paginated');
});
test('fails closed on malformed and absent response envelopes',()=>{
 const x=input();x[0]={result:x[0].result};
 assert.equal(checkVersionLineage(...x).reason,'version_list_schema_unrecognized');
 assert.equal(checkVersionLineage().valid,false);
});
test('fails closed on altered deployment version',()=>{
 const x=input();x[2].result.deployments[0].versions[0].version_id=STRANDED;
 assert.equal(checkVersionLineage(...x).reason,'pinned_inert_not_deployed_100pct');
});
test('fails closed on duplicate sequence numbers',()=>{
 const x=input();x[0].result.items[0].number=11;
 assert.equal(checkVersionLineage(...x).reason,'duplicate_version_identity');
});
test('uses metadata.created_on and refuses undocumented top-level timestamp',()=>{
 const x=input();delete x[0].result.items[0].metadata;
 x[0].result.items[0].created_on='2026-11-15T21:00:00Z';
 assert.equal(checkVersionLineage(...x).reason,'version_metadata_invalid');
});
test('refuses missing pinned version',()=>{
 const x=input();x[0].result.items=x[0].result.items.filter(v=>v.id!==PINNED_INERT);
 assert.equal(checkVersionLineage(...x).reason,'version_list_incomplete_or_paginated');
});
