import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyQuotationStagingPreflight} from "../scripts/quotation-staging-readonly-preflight.mjs";

const manifest=readFileSync(new URL("../deploy/quotation-private-staging/wrangler.jsonc",import.meta.url),"utf8");
const SHA="e974f0602f9c9c728da3984fcb526185363910c5";
const inventory=()=>({
 source:"cloudflare-read-only-get",
 accountId:"ddd23cab31928a4bb3d4998df9b26d1d",
 exactMainSha:SHA,
 authD1:{success:true,name:"bw-quotation-auth-synthetic-staging",
  uuid:"d7ad8e99-2ee4-446c-9358-0e186031571d"},
 quoteD1:{success:true,name:"bw-quotation-staging",
  uuid:"aec227e9-b0f2-4b00-8de0-105465c4e2d6"},
 logoR2:{success:true,name:"bw-quotation-logo-private-staging"},
 templateR2:{success:true,name:"bw-quotation-template-private-staging"},
 worker:{success:true,name:"bw-quotation-auth-private-staging",
  deployed_on:null,public:false,preview:false,
  workerReferences:0,domainReferences:0,
  versions:[{id:"cc20de6e-ab08-409f-89a1-390e0eaf5be1",
    module:"quotation-private-bootstrap-deny-all.mjs",urls:[]}]
}});
const check=(inv=inventory(),text=manifest,current=SHA,reviewed=SHA)=>
 verifyQuotationStagingPreflight({manifestText:text,inventory:inv,
  exactMainSha:current,reviewedMainSha:reviewed});
test("verified remote resources produce read-only report, NEVER a deployment authority",()=>{
 const out=check();
 assert.equal(out.remoteResourceIdentityVerified,true);
 assert.equal(out.allowedMode,"READ_ONLY_PREFLIGHT_ONLY");
 assert.equal(out.liveWorkerBindingVerified,false);
 assert.equal(out.executableWorkerDeployed,false);
 assert.equal(out.stagingDeploymentAuthorized,false);
 assert.equal(out.publicLaunchAuthorized,false);
 assert.match(out.manifestSha256,/^[a-f0-9]{64}$/);
});
test("fail closed for unknown head, unreviewed worker or public preview",()=>{
 assert.throws(()=>check(inventory(),manifest,SHA,"a".repeat(40)),/source_mismatch/);
 for(const change of [
  x=>{x.worker.public=true},
  x=>{x.worker.preview=true},
  x=>{x.worker.deployed_on="2026-11-17"},
  x=>{x.worker.versions.push({...x.worker.versions[0],id:"unknown"})},
  x=>{x.worker.domainReferences=1},
  x=>{x.authD1.uuid=x.quoteD1.uuid},
  x=>{x.templateR2.name="other"},
  x=>{x.source="unverified"}
 ]){
  const inv=inventory();change(inv);
  assert.throws(()=>check(inv),/quotation_staging_preflight_/);
 }
});
test("manifest cannot accidentally switch on public or preview or replace isolated DB",()=>{
 for(const changed of [
  manifest.replace('"workers_dev": false','"workers_dev": true'),
  manifest.replace('"preview_urls": false','"preview_urls": true'),
  manifest.replace('"routes": []','"routes": ["thebedesk.com/*"]'),
  manifest.replace("aec227e9-b0f2-4b00-8de0-105465c4e2d6","d7ad8e99-2ee4-446c-9358-0e186031571d")
 ])assert.throws(()=>check(inventory(),changed),/quotation_staging_preflight_/);
});
test("missing evidence or malformed manifest blocks deployment",()=>{
 assert.throws(()=>check({},manifest),/quotation_staging_preflight_/);
 assert.throws(()=>check(inventory(),"{bad"),/invalid_manifest/);
});
