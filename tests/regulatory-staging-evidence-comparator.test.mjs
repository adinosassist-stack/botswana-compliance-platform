import test from "node:test";
import assert from "node:assert/strict";
import {compareSyntheticRehearsalEvidence as compare} from "../scripts/regulatory-staging-evidence-comparator.mjs";
import {createSyntheticRegulatoryFixtureManifest} from "../scripts/regulatory-staging-fixture-manifest.mjs";
const fixture=createSyntheticRegulatoryFixtureManifest();
const state=()=>({scope:"synthetic-only",databaseFingerprint:"a".repeat(16),
 obligations:fixture.manifest.historicalVat.map(x=>({...x})),
 schedules:fixture.manifest.schedules.map(x=>({...x})),
 snapshots:[{id:"synthetic-snapshot",hash:"abc"}],reviews:[{id:"synthetic-checker",decision:"review"}],
 rules:[{ruleKey:"bw.burs.vat.return-payment.25-days",status:"review"},
        {ruleKey:"bw.burs.vat.return-payment.28-days",status:"draft"}],
 registry:[{id:"synthetic-registry",version:"1.8"}]});
const args=()=>({before:state(),after:state(),retry:state(),manifest:fixture.manifest,manifestHash:fixture.sha256});
test("exact preservation and idempotent retry still require human decision",()=>{
 const result=compare(args());assert.equal(result.ok,true);assert.equal(result.decision,"human_review_required");
});
test("rejects changes to history, schedules, approvals, snapshots and retry state",()=>{
 for(const [key,change] of [
  ["obligations",x=>x[0].dueAt="2026-06-28"],
  ["schedules",x=>x[0].nextDueAt="2026-06-28"],
  ["snapshots",x=>x[0].hash="modified"],
  ["reviews",x=>x[0].decision="approved"]
 ]){const x=args();change(x.after[key]);assert.equal(compare(x).ok,false,key);}
 const x=args();x.retry.registry.push({id:"unexpected"});assert.equal(compare(x).ok,false);
 const y=args();y.after.rules[1].status="published";assert.equal(compare(y).ok,false);
 const z=args();z.after.databaseFingerprint="b".repeat(16);assert.equal(compare(z).ok,false);
 const w=args();w.manifestHash="0".repeat(64);assert.equal(compare(w).ok,false);
});
test("refuses unbounded inventory and extra/untrusted fields",()=>{
 const x=args();x.before.obligations=Array.from({length:201},()=>({id:"x"}));assert.equal(compare(x).ok,false);
 const y=args();y.before.customerRecords=[];assert.equal(compare(y).ok,false);
});

test("rejects duplicate or unrelated VAT rules even if expected first-match statuses pass",()=>{
 const dup=args();dup.after.rules.push({...dup.after.rules[1]});dup.retry.rules.push({...dup.retry.rules[1]});
 assert.equal(compare(dup).ok,false);
 const foreign=args();foreign.before.rules.push({ruleKey:"unrelated.vat.draft",status:"draft"});
 foreign.after.rules.push({ruleKey:"unrelated.vat.draft",status:"draft"});
 foreign.retry.rules.push({ruleKey:"unrelated.vat.draft",status:"draft"});
 assert.equal(compare(foreign).ok,false);
 const absent=args();absent.after.rules.splice(1,1);absent.retry.rules.splice(1,1);
 assert.equal(compare(absent).ok,false);
});

test("refuses already activated historical rules in before or retry evidence",()=>{
 for(const phase of ["before","retry"]){
  const x=args();x[phase].rules[0].status="published";
  assert.equal(compare(x).ok,false,phase);
 }
 const y=args();y.before.rules[1].status="approved";
 assert.equal(compare(y).ok,false);
});
