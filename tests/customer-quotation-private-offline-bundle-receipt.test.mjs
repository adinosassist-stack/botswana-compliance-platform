import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {createC4PrivateOfflineReceipt as receipt} from
 "../scripts/customer-quotation-private-offline-bundle-receipt.mjs";

const source="a".repeat(40);
const needed=[
 "deploy/customer-quotation-private-staging/wrangler.jsonc",
 "server/essentials-private-customer-worker-candidate.mjs",
 "tests/customer-quotation-private-worker.test.mjs",
 "package-lock.json","package.json"
];
function fixture(){
 const root=mkdtempSync(join(tmpdir(),"thebe-c4-offline-"));
 for(const f of needed){
  mkdirSync(dirname(join(root,f)),{recursive:true});
  copyFileSync(resolve(f),join(root,f));
 }
 const bundleDir=join(root,"compiled");
 mkdirSync(bundleDir);
 writeFileSync(join(bundleDir,"worker.js"),
  "export default {fetch(){return new Response('Not Found',{status:404})}}\n"+
   "// synthetic offline fixture input, not a deployed Worker. ".repeat(4));
 return {root,bundleDir,
  clean(){rmSync(root,{recursive:true,force:true})},
  writeFile(p,transform){
   const f=join(root,p);
   const before=readFileSync(f,"utf8");
   writeFileSync(f,transform(before));
  }
 };
}
test("C4 offline receipt pins source and compiled bytes but never authorizes deployment",()=>{
 const f=fixture();
 try{
  const r=receipt({root:f.root,bundleDir:f.bundleDir,
   checkoutSha:source,eventName:"pull_request"});
  assert.equal(r.schema,"thebe.c4.customer-quotation.offline-bundle.v1");
  assert.equal(r.checkoutSha,source);
  assert.match(r.workerSha256,/^[a-f0-9]{64}$/);
  assert.match(r.sourceInputsSha256,/^[a-f0-9]{64}$/);
  assert.match(r.receiptSha256,/^[a-f0-9]{64}$/);
  assert.equal(r.worker,"bw-customer-quotation-identity-private-staging");
  for(const key of ["googleProjectCreated","realGoogleOidcVerified",
   "customerAccountOwnershipVerified","privateStagingDeployed",
   "productionLoginEnabled","cloudflareUploadAuthorized",
   "cloudflareDeployAuthorized"])assert.equal(r[key],false,key);
  assert.equal(r.evidenceScope,"OFFLINE_COMPILED_DEFAULT_DENY_ONLY");
  assert.deepEqual(receipt({root:f.root,bundleDir:f.bundleDir,
   checkoutSha:source,eventName:"pull_request"}),r);
  writeFileSync(join(f.bundleDir,"worker.js"),"changed compiled output ".repeat(9));
  assert.notEqual(receipt({root:f.root,bundleDir:f.bundleDir,
   checkoutSha:source,eventName:"pull_request"}).receiptSha256,r.receiptSha256);
 }finally{f.clean()}
});
test("reject public routes, worker.dev and extra binding before any bundle receipt",()=>{
 for(const [oldString,newString] of [
  ['"routes": []','"routes": ["*/*"]'],
  ['"workers_dev": false','"workers_dev": true'],
  ['"preview_urls": false','"preview_urls": true'],
  ['"database_id": "56f48000-9d89-47d5-a077-47dfe0825662"',
   '"database_id": "wrong-production-d1"'],
  ['"d1_databases": [','"d1_databases": [], "unauthorized_bindings": [']
 ]){
  const f=fixture();
  try{
   f.writeFile(needed[0],s=>{assert.ok(s.includes(oldString));return s.replace(oldString,newString)});
   assert.throws(()=>receipt({root:f.root,bundleDir:f.bundleDir,
    checkoutSha:source}),/c4_offline_build_/);
  }finally{f.clean()}
 }
});
test("reject unpinned Wrangler version or altered default-deny entrypoint",()=>{
 const f=fixture();
 try{
  f.writeFile("package.json",s=>s.replace('"wrangler": "4.135.0"','"wrangler": "latest"'));
  assert.throws(()=>receipt({root:f.root,bundleDir:f.bundleDir,
   checkoutSha:source}),/wrangler_version_unpinned/);
 }finally{f.clean()}
 const g=fixture();
 try{
  g.writeFile("server/essentials-private-customer-worker-candidate.mjs",
   s=>s.replace("fetch() { return denied(); }","fetch() { return new Response('OK'); }"));
  assert.throws(()=>receipt({root:g.root,bundleDir:g.bundleDir,
   checkoutSha:source}),/default_deny_source_changed/);
 }finally{g.clean()}
});
test("reject invalid SHA, modified event and missing compiled Worker",()=>{
 const f=fixture();
 try{
  assert.throws(()=>receipt({root:f.root,bundleDir:f.bundleDir,
   checkoutSha:"bad"}),/invalid_checkout_sha/);
  assert.throws(()=>receipt({root:f.root,bundleDir:f.bundleDir,
   checkoutSha:source,eventName:"production/deploy"}),/invalid_event/);
  assert.throws(()=>receipt({root:f.root,bundleDir:join(f.root,"missing"),
   checkoutSha:source}),/quotation_bundle_/);
 }finally{f.clean()}
});
