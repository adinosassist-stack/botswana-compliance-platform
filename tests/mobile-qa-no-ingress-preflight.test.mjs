import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {validateMobileQaPlan} from "../scripts/mobile-qa-no-ingress-preflight.mjs";

const main="4c22c606ac1aa9bcfaa0c7eda3ba60ef8c58c9f9";
const source=JSON.parse(fs.readFileSync("docs/mobile-qa-staging-offline-plan.json","utf8"));
const validate=value=>validateMobileQaPlan(value,{exactMainSha:main});
const mutate=(name,value)=>({...source,[name]:value});

test("only the exact-main proposed offline plan passes, without implying deployment",()=>{
  const result=validate(source);
  assert.equal(result.ok,true);
  assert.equal(result.sourceSha,main);
  assert.equal(result.mode,"offline-only");
  assert.equal(result.workerState,"not-created");
  assert.equal(result.authorization,"not-granted");
  assert.equal(result.physicalAndroid,"not-tested");
});

test("stale main, fake SHA and wrong proposed Worker fail closed",()=>{
  assert.throws(()=>validate({...source,sourceSha:"f".repeat(40)}),/sourceSha/);
  assert.throws(()=>validateMobileQaPlan(source,{exactMainSha:"f".repeat(40)}),/sourceSha/);
  assert.throws(()=>validateMobileQaPlan(source,{exactMainSha:"not-a-sha"}),/exact main SHA/);
  assert.throws(()=>validate(mutate("workerName","bw-compliance-os")),/workerName/);
  assert.throws(()=>validate(mutate("workerName","bw-general-ai-staging")),/workerName/);
});

test("deny all ingress, preview, live accounts, bindings and mutations",()=>{
  const violations=[
    ["workersDev",true],["previewUrls",true],
    ["routes",["qa.thebedesk.com/*"]],["customDomains",["qa.thebedesk.com"]],
    ["bindings",[{type:"d1_database",database_id:"production-id"}]],
    ["networkAccess",true],["authentication",true],["syntheticOnly",false],
    ["productionDeploy",true],["paymentActivation",true],
    ["databaseMigration",true],["generalAiProviderCalls",true],
    ["publicApkDistribution",true],
    ["ownerApprovalRequired",false],["independentReviewRequired",false],
    ["status","deployed"]
  ];
  for(const [key,value] of violations)
    assert.throws(()=>validate(mutate(key,value)),new RegExp(key),key);
});

test("deny undocumented fields that could hide credentials, route or production overrides",()=>{
  for(const key of ["secrets","apiToken","databaseId","previewUrl","productionBindings","ownerApproved"]){
    assert.throws(()=>validate({...source,[key]:"not-allowed"}),/unrecognized plan field/,key);
  }
  const missing={...source};delete missing.routes;
  assert.throws(()=>validate(missing),/required plan field absent: routes/);
  assert.throws(()=>validate([]),/plain JSON object/);
  assert.throws(()=>validate(null),/plain JSON object/);
  assert.throws(()=>validate({...source,routes:"none"}),/routes/);
});

test("CLI reports an offline proposal, never a live build or device PASS",()=>{
  const output=execFileSync(process.execPath,[
    "scripts/mobile-qa-no-ingress-preflight.mjs",
    "--plan","docs/mobile-qa-staging-offline-plan.json",
    "--exact-main-sha",main
  ],{encoding:"utf8"});
  assert.match(output,/PASS: exact-main offline mobile QA staging proposal/);
  assert.match(output,/no Worker created, no ingress, no storage, no deployment, no Android acceptance/);
  assert.doesNotMatch(output,/approved|deployed successfully/i);
  assert.throws(()=>execFileSync(process.execPath,[
    "scripts/mobile-qa-no-ingress-preflight.mjs",
    "--plan","docs/mobile-qa-staging-offline-plan.json",
    "--exact-main-sha","e".repeat(40)
  ],{stdio:"pipe"}));
});
