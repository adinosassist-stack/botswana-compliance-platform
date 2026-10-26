import test from "node:test";
import assert from "node:assert/strict";
import {createSyntheticRegulatoryFixtureManifest as build,verifySyntheticRegulatoryFixtureManifest as verify} from "../scripts/regulatory-staging-fixture-manifest.mjs";
test("synthetic manifest is stable and strictly hash bound",()=>{
 const a=build(),b=build();
 assert.deepEqual(a,b);
 assert.match(a.sha256,/^[a-f0-9]{64}$/);
 assert.equal(verify(a.manifest,a.sha256).ok,true);
 assert.equal(a.manifest.dataClassification,"synthetic-only");
 assert.equal(a.manifest.tenants.length,2);
 assert.equal(a.manifest.historicalVat.length,2);
 assert.deepEqual(a.manifest.historicalVat.map(r=>r.dueDays),[25,25]);
 assert.deepEqual(a.manifest.rules.map(r=>r.status),["review","draft"]);
});
test("tampering, extra tenant and altered approvals are refused",()=>{
 const x=build();
 for(const changed of [
  {...x.manifest,dataClassification:"production-clone"},
  {...x.manifest,tenants:[...x.manifest.tenants,{id:"customer",name:"Actual user"}]},
  {...x.manifest,rules:x.manifest.rules.map(r=>({...r,status:"published"}))},
  {...x.manifest,historicalVat:x.manifest.historicalVat.map(r=>({...r,dueAt:"2026-07-28"}))}
 ])assert.equal(verify(changed,x.sha256).ok,false);
 assert.equal(verify(x.manifest,"f".repeat(64)).ok,false);
 assert.equal(verify(null,x.sha256).ok,false);
});
