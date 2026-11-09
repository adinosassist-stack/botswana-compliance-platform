import test from 'node:test';
import assert from 'node:assert/strict';
import {compareIndependentDryRuns,runIndependentDryRuns} from '../scripts/corporate-assets-compiled-reproducibility.mjs';
const sha='a'.repeat(40);
const receipt=()=>({reviewedCommit:sha,compiler:'wrangler@4.135.0',dryRun:true,
 inputManifestDigest:'b'.repeat(64),bundleDigest:'c'.repeat(64),
 bundleFiles:{'index.js':'d'.repeat(64),'index.js.map':'e'.repeat(64)},
 cloudflareUploadVerified:false,versionCreationAuthorized:false,deploymentAuthorized:false});
test('two matching independent offline bundles give reproducibility only, not cloud upload',()=>{
 const x=compareIndependentDryRuns({expectedSha:sha,first:receipt(),second:receipt()});
 assert.equal(x.reproducible,true);
 assert.equal(x.executableModuleReproducible,true);
 assert.equal(x.fullArtifactProvenanceReady,false);
 assert.equal(x.sourceToCloudflareUploadVerified,false);
 assert.equal(x.versionCreationAuthorized,false);
 assert.equal(x.deploymentAuthorized,false);
});
test('altered compiled Worker detects changed JavaScript',()=>{
 const b=receipt();b.bundleFiles['index.js']='f'.repeat(64);
 const x=compareIndependentDryRuns({expectedSha:sha,first:receipt(),second:b});
 assert.equal(x.reproducible,false);
 assert.ok(x.errors.includes('compiled_module_changed:index.js'));
});
test('changed source map and missing output also fail',()=>{
 const a=receipt(),b=receipt();b.bundleFiles['index.js.map']='f'.repeat(64);
 const partial=compareIndependentDryRuns({expectedSha:sha,first:a,second:b});
 assert.equal(partial.reproducible,false);
 assert.equal(partial.executableModuleReproducible,true);
 assert.equal(partial.fullArtifactProvenanceReady,false);
 assert.ok(partial.auxiliaryDifferences.includes('auxiliary_artifact_changed:index.js.map'));
 const c=receipt();delete c.bundleFiles['index.js.map'];
 assert.ok(compareIndependentDryRuns({expectedSha:sha,first:a,second:c}).errors.includes('compiled_file_set_changed'));
});
test('wrong source SHA, compiler or forged upload claim rejected',()=>{
 for(const mutate of [
  b=>b.reviewedCommit='f'.repeat(40),b=>b.compiler='wrangler@latest',
  b=>b.cloudflareUploadVerified=true,b=>b.versionCreationAuthorized=true,
  b=>b.deploymentAuthorized=true,b=>b.dryRun=false,b=>b.bundleFiles={}
 ]){
  const b=receipt();mutate(b);
  assert.equal(compareIndependentDryRuns({expectedSha:sha,first:receipt(),second:b}).reproducible,false);
 }
});
test('source input mismatch and forged bundle digest rejected',()=>{
 const b=receipt();b.inputManifestDigest='f'.repeat(64);
 assert.ok(compareIndependentDryRuns({expectedSha:sha,first:receipt(),second:b}).errors.includes('source_input_digest_changed'));
 const c=receipt();c.bundleDigest='f'.repeat(64);
 assert.ok(compareIndependentDryRuns({expectedSha:sha,first:receipt(),second:c}).auxiliaryDifferences.includes('full_bundle_digest_changed'));
});
test('two compiler invocations execute independently and mismatch fails closed',()=>{
 let n=0;
 const compile=()=>{n++;const b=receipt();if(n===2)b.bundleFiles['index.js']='f'.repeat(64);return b};
 assert.throws(()=>runIndependentDryRuns({expectedSha:sha,compile}),/worker_executable_not_reproducible/);
 assert.equal(n,2);
});
test('invalid expected source SHA fails before compilation',()=>{
 let n=0;
 assert.throws(()=>runIndependentDryRuns({expectedSha:'bogus',compile:()=>{n++}}),/expected_main_sha_required/);
 assert.equal(n,0);
});
