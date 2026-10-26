import test from "node:test";
import assert from "node:assert/strict";
import {compareSyntheticRehearsalEvidence as compare} from "../scripts/regulatory-staging-evidence-comparator.mjs";
import {createSyntheticRegulatoryFixtureManifest} from "../scripts/regulatory-staging-fixture-manifest.mjs";
const {manifest,sha256}=createSyntheticRegulatoryFixtureManifest();
const state=()=>({scope:"synthetic-only",databaseFingerprint:"a".repeat(16),
 obligations:manifest.historicalVat.map(x=>({...x})),
 schedules:manifest.schedules.map(x=>({...x})),
 snapshots:[],reviews:[],
 rules:[{ruleKey:"bw.burs.vat.return-payment.25-days",status:"review"},{ruleKey:"bw.burs.vat.return-payment.28-days",status:"draft"}],
 registry:[]});
const input=()=>({before:state(),after:state(),retry:state(),manifest,manifestHash:sha256});
test("actual synthetic fixture records pass but cannot be treated as remote attestation",()=>assert.equal(compare(input()).decision,"human_review_required"));
test("same fraudulent records in every snapshot are blocked",()=>{
 for(const key of ["obligations","schedules"]){
  const x=input();
  for(const phase of ["before","after","retry"]){
   x[phase][key][0][key==="obligations"?"dueAt":"nextDueAt"]="2027-01-01";
  }
  assert.equal(compare(x).ok,false,key);
 }
 const y=input();for(const phase of ["before","after","retry"])y[phase].obligations[0].id="synthetic-unexpected";
 assert.equal(compare(y).ok,false);
});
