import test from 'node:test';
import assert from 'node:assert/strict';
import {bundledReceipt} from '../scripts/corporate-assets-compiled-artifact-dryrun.mjs';
const sha='a'.repeat(40);
const input=()=>({expectedSha:sha,inputs:{reviewedCommit:sha,manifestDigest:'b'.repeat(64),
 deploymentAuthorized:false,cloudflareArtifactVerified:false},
 bundleFiles:[{name:'index.js',bytes:Buffer.from('export default {fetch(){return new Response("inert")}};')},
 {name:'manifest.json',bytes:Buffer.from('{"safe":true}')}]
});
test('dry-run output gets a stable sorted cryptographic receipt but no authorization',()=>{
 const a=bundledReceipt(input()),b=input();
 b.bundleFiles.reverse();
 assert.deepEqual(a,bundledReceipt(b));
 assert.match(a.bundleDigest,/^[0-9a-f]{64}$/);
 assert.equal(a.cloudflareUploadVerified,false);
 assert.equal(a.versionCreationAuthorized,false);
 assert.equal(a.deploymentAuthorized,false);
});
test('change to compiled bytes changes bundle digest',()=>{
 const b=input();b.bundleFiles[0].bytes=Buffer.from('export default {fetch(){return new Response("changed")}};');
 assert.notEqual(bundledReceipt(b).bundleDigest,bundledReceipt(input()).bundleDigest);
});
test('rejects wrong exact commit, unverified inputs and fake uploaded receipt',()=>{
 for(const tweak of [
  x=>x.inputs.reviewedCommit='c'.repeat(40),x=>x.expectedSha='invalid',
  x=>x.inputs.manifestDigest='notsha256',x=>x.inputs.deploymentAuthorized=true,
  x=>x.inputs.cloudflareArtifactVerified=true
 ]){const x=input();tweak(x);assert.throws(()=>bundledReceipt(x),/exact_source_inputs_required/)}
});
test('rejects non-dry-run invocation',()=>{
 const x=input();x.command='versions upload';
 assert.throws(()=>bundledReceipt(x),/offline_wrangler_only/);
});
test('rejects missing, empty, path-traversal or duplicated bundle files',()=>{
 for(const tweak of [
  x=>x.bundleFiles=[],x=>x.bundleFiles[0].bytes=Buffer.alloc(0),
  x=>x.bundleFiles[0].name='../evil.js',x=>x.bundleFiles[0].name='/absolute.js',
  x=>x.bundleFiles[0].name='manifest.json',x=>x.bundleFiles[1].name='index.js',
  x=>x.bundleFiles[1].bytes='not-buffer'
 ]){const x=input();tweak(x);assert.throws(()=>bundledReceipt(x))}
});
test('compiled module required rather than merely nonempty metadata files',()=>{
 const x=input();x.bundleFiles[0].name='blob.txt';
 assert.throws(()=>bundledReceipt(x),/bundled_module_required/);
});
