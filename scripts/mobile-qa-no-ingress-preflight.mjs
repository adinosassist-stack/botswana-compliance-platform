/**
 * Thebe AI mobile QA — source-only no-ingress preflight.
 *
 * This module never imports Cloudflare clients, calls a network endpoint,
 * reads credentials, creates a Worker, provisions D1 or deploys anything.
 * It validates a proposed OFFLINE plan, not approval or operational readiness.
 *
 * Issue #2821; physical Android acceptance remains separately gated.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const allowedFields=Object.freeze([
  "schema","purpose","status","sourceSha","workerName",
  "workersDev","previewUrls","routes","customDomains","bindings",
  "networkAccess","authentication","syntheticOnly","productionDeploy",
  "paymentActivation","databaseMigration","generalAiProviderCalls",
  "publicApkDistribution","ownerApprovalRequired","independentReviewRequired"
]);
const isSha=value=>typeof value==="string"&&/^[a-f0-9]{40}$/.test(value);
const fail=message=>{throw new Error("Mobile QA no-ingress preflight: "+message)};

export function validateMobileQaPlan(plan,{exactMainSha}={}){
  if(!isSha(exactMainSha))fail("a lowercase 40-character exact main SHA is required");
  if(!plan||typeof plan!=="object"||Array.isArray(plan)||Object.getPrototypeOf(plan)!==Object.prototype)
    fail("plan must be a plain JSON object");

  for(const key of Object.keys(plan)){
    if(!allowedFields.includes(key))fail("unrecognized plan field: "+key);
  }
  for(const key of allowedFields){
    if(!Object.hasOwn(plan,key))fail("required plan field absent: "+key);
  }

  const expected={
    schema:1,
    purpose:"thebe-ai-mobile-qa-offline",
    status:"proposed-not-created",
    sourceSha:exactMainSha,
    workerName:"bw-mobile-qa-staging",
    workersDev:false,
    previewUrls:false,
    networkAccess:false,
    authentication:false,
    syntheticOnly:true,
    productionDeploy:false,
    paymentActivation:false,
    databaseMigration:false,
    generalAiProviderCalls:false,
    publicApkDistribution:false,
    ownerApprovalRequired:true,
    independentReviewRequired:true
  };
  for(const [key,value] of Object.entries(expected)){
    if(plan[key]!==value)fail(key+" violates the offline-only, exact-main contract");
  }
  // All resource associations are empty until NEW isolated resources receive
  // separately documented owner and independent reviewer authorization.
  for(const key of ["routes","customDomains","bindings"]){
    if(!Array.isArray(plan[key])||plan[key].length!==0)
      fail(key+" must be an empty array; no route, domain or binding is authorized");
  }
  return Object.freeze({
    ok:true,
    sourceSha:exactMainSha,
    mode:"offline-only",
    workerState:"not-created",
    ingress:"none",
    authorization:"not-granted",
    physicalAndroid:"not-tested"
  });
}

function cli(argv){
  if(argv.length!==4||argv[0]!=="--plan"||argv[2]!=="--exact-main-sha")
    fail("usage: --plan <local-json> --exact-main-sha <40-char-sha>");
  const input=JSON.parse(fs.readFileSync(argv[1],"utf8"));
  const result=validateMobileQaPlan(input,{exactMainSha:argv[3]});
  // Print only bounded public summary; never an input plan or secret.
  process.stdout.write("PASS: exact-main offline mobile QA staging proposal; "+
    "no Worker created, no ingress, no storage, no deployment, no Android acceptance. "+
    "sha="+result.sourceSha+"\n");
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{cli(process.argv.slice(2))}
  catch(error){process.stderr.write(String(error.message)+"\n");process.exitCode=1}
}
