import test from 'node:test';
import assert from 'node:assert/strict';
import {INPUTS,buildInputReceipt} from '../scripts/corporate-assets-build-input-receipt.mjs';
const sha='a'.repeat(40),db='e19f09de-3bb9-4021-b4f8-44df04c8aaa8';
const input=()=>({expectedSha:sha,checkoutSha:sha,
 files:Object.fromEntries(INPUTS.map(name=>[name,'synthetic-file:'+name])),
 lockVersion:'4.135.0',
 config:{name:'bw-corporate-assets-staging',main:'/tmp/synthetic/corporate-assets-staging-entry.js',
  workers_dev:false,preview_urls:false,keep_vars:false,routes:[],
  vars:{ASSETS_STAGING_SOURCE_SHA:sha,THEBE_CORPORATE_ASSETS_ENABLED:'false',ASSETS_STAGING_WRITES_ENABLED:'false'},
  d1_databases:[{binding:'DB',database_id:db}]}
});
test('offline build inputs yield deterministic, non-releasing digest',()=>{
 const a=buildInputReceipt(input()),b=buildInputReceipt(input());
 assert.deepEqual(a,b);
 assert.match(a.manifestDigest,/^[a-f0-9]{64}$/);
 assert.equal(a.deploymentAuthorized,false);
 assert.equal(a.cloudflareArtifactVerified,false);
});
test('stale checked-out commit is rejected',()=>{
 const a=input();a.checkoutSha='b'.repeat(40);
 assert.throws(()=>buildInputReceipt(a),/exact_checked_out_commit_required/);
});
test('missing or modified build input invalidates receipt',()=>{
 const a=input();delete a.files[INPUTS[0]];
 assert.throws(()=>buildInputReceipt(a),/required_build_inputs_missing/);
 const b=input();b.files[INPUTS[0]]='modified';
 assert.notEqual(buildInputReceipt(b).manifestDigest,buildInputReceipt(input()).manifestDigest);
});
test('nonisolated worker config and nonpinned toolchain rejected',()=>{
 for(const mutate of [
  x=>x.config.workers_dev=true,x=>x.config.preview_urls=true,
  x=>x.config.routes=['/*'],x=>x.config.vars.ASSETS_STAGING_WRITES_ENABLED='true',
  x=>x.config.vars.THEBE_CORPORATE_ASSETS_ENABLED='true',
  x=>x.config.d1_databases[0].database_id='8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce',
  x=>x.config.vars.ASSETS_STAGING_SOURCE_SHA='b'.repeat(40)
 ]){
  const a=input();mutate(a);
  assert.throws(()=>buildInputReceipt(a),/isolated_build_configuration_required/);
 }
 const a=input();a.lockVersion='latest';
 assert.throws(()=>buildInputReceipt(a),/pinned_wrangler_version_required/);
});
