import test from 'node:test';
import assert from 'node:assert/strict';
import {checkWorkerBundleLineage,inspectWorkerBundleLineage,V2,V3} from '../scripts/corporate-assets-v3-worker-bundle-lineage.mjs';
const old='0'.repeat(39)+'1',main='f'.repeat(40),etag='a'.repeat(64);
const make=(id,number,sha=old,e=etag)=>({id,number,resources:{script:{etag:e},bindings:[{name:'ASSETS_STAGING_SOURCE_SHA',type:'plain_text',text:sha}]}});
const data=()=>({v2:make(V2,2),v3:make(V3,3),reviewedMainSha:main});
test('matching Worker ETag establishes continuity but not GitHub build provenance',()=>{
 const result=checkWorkerBundleLineage(data());
 assert.equal(result.continuityVerified,true);
 assert.equal(result.scriptEtagEqual,true);
 assert.equal(result.independentSourceBundleProvenanceVerified,false);
 assert.equal(result.deploymentAuthorized,false);
 assert.deepEqual(result.errors,['exact_current_main_provenance_unproven']);
});
test('mismatched script bytes invalidate even continuity',()=>{
 const a=data();a.v3.resources.script.etag='b'.repeat(64);
 const r=checkWorkerBundleLineage(a);
 assert.equal(r.continuityVerified,false);
 assert.ok(r.errors.includes('worker_script_etag_mismatch'));
});
test('metadata source marker changed independently of Worker bundle',()=>{
 const a=data();a.v3.resources.bindings[0].text=main;
 const r=checkWorkerBundleLineage(a);
 assert.equal(r.continuityVerified,false);
 assert.ok(r.errors.includes('worker_source_marker_changed'));
});
test('forged source match alone cannot produce deployment authorization',()=>{
 const a=data();a.v2.resources.bindings[0].text=main;a.v3.resources.bindings[0].text=main;
 const r=checkWorkerBundleLineage(a);
 assert.equal(r.independentSourceBundleProvenanceVerified,false);
 assert.equal(r.deploymentAuthorized,false);
});
test('unknown version, malformed etag, missing source marker fail closed',()=>{
 const a=data();a.v3.id='forged';assert.ok(checkWorkerBundleLineage(a).errors.includes('version_identity_mismatch'));
 const b=data();delete b.v2.resources.script.etag;assert.ok(checkWorkerBundleLineage(b).errors.includes('worker_script_etag_mismatch'));
 const c=data();c.v3.resources.bindings=[];assert.ok(checkWorkerBundleLineage(c).errors.includes('worker_source_marker_changed'));
});
test('read-only metadata GET to exact candidate and active version',async()=>{
 const seen=[];
 const request=async(url,options)=>{
  seen.push({url,method:options.method});
  const id=url.split('/').pop();
  return {ok:true,json:async()=>({success:true,result:id===V2?make(V2,2):make(V3,3)})};
 };
 const result=await inspectWorkerBundleLineage({token:'synthetic-read-token',reviewedMainSha:main,request});
 assert.equal(result.continuityVerified,true);
 assert.equal(seen.length,2);
 assert.ok(seen.every(x=>x.method==='GET'));
 assert.deepEqual(seen.map(x=>x.url.split('/').pop()),[V2,V3]);
});
test('API error, malformed response and invalid SHA reject',async()=>{
 await assert.rejects(inspectWorkerBundleLineage({token:'',reviewedMainSha:main}),/read_token_and_main_sha_required/);
 await assert.rejects(inspectWorkerBundleLineage({token:'synthetic',reviewedMainSha:main,request:async()=>({ok:false,status:403})}),/version_read_failed_403/);
 await assert.rejects(inspectWorkerBundleLineage({token:'synthetic',reviewedMainSha:main,request:async()=>({ok:true,json:async()=>({success:false})})}),/version_response_invalid/);
});
