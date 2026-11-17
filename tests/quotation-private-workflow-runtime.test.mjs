import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Exercise actual candidate logic in Node with a test-only WorkflowEntrypoint
// shim. No Cloudflare credentials, deployment, real data or network access.
const raw=readFileSync(new URL("../server/quotation-private-workflow-harness.mjs",import.meta.url),"utf8");
const js=raw.replace('import { WorkflowEntrypoint } from "cloudflare:workers";','class WorkflowEntrypoint {constructor(env){this.env=env;}}');
assert.notEqual(js,raw,"Cloudflare import must match expected candidate");
const {QuotationPrivateRehearsal,default:handler}=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const WH="09eed552bc5ef79ff3ca6b5b57e56453c0a2326e330968d47dcab39937e93274";
const CH="c1f650bf14454c5257dd827a9ef6857a2f15ece6e3918542d472b4929916340c";
const tenant="12345678-1234-4234-8234-123456789abc";
const payload=()=>({scope:"quotation-private-rehearsal",syntheticTenantId:tenant,operatorAttestation:"private-reviewer-qualified",workerSha256:WH,callerSha256:CH,enableWrites:false});
const env=()=>({
 QUOTATION_HARNESS_ENABLED:"reviewed-synthetic-only",
 QUOTATION_HARNESS_SOURCE_SHA:"1172056ad4d189041a3eb15717cd7fa04b09698e",
 QUOTATION_WORKER_ARTIFACT_SHA256:WH,QUOTATION_CALLER_ARTIFACT_SHA256:CH,
 QUOTATION_HARNESS_REMOTE_PREFLIGHT:"independently-attested",
 QUOTATION_HARNESS_ROLLBACK:"independently-tested",
 QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET:"a".repeat(40),
 QUOTATION_SYNTHETIC_PROBE_SECRET:"b".repeat(40),
 QUOTATION_SERVICE:{fetch:async()=>{throw Error("not contacted")}},
 QUOTATION_SYNTHETIC_CALLER:{fetch:async request=>{
  assert.equal(request.method,"GET");
  assert.equal(new URL(request.url).pathname,"/probe/anonymous");
  assert.equal(request.headers.get("x-quotation-synthetic-probe"),"b".repeat(40));
  return new Response("Anonymous denial verified",{status:200});
 }}
});
const step={do:async (_name,fn)=>fn()};
const run=(e,p=payload())=>new QuotationPrivateRehearsal(e).run({payload:p},step);
test("valid isolated anonymous-denial rehearsal returns no customer writes",async()=>{
 assert.deepEqual(await run(env()),{passed:true,check:"anonymous-denial",customerWrites:0,stage:"quotation-private-rehearsal"});
});
test("staging disabled always denies before binding call",async()=>{
 const e=env();e.QUOTATION_HARNESS_ENABLED="disabled";
 e.QUOTATION_SYNTHETIC_CALLER.fetch=()=>{throw Error("called unexpectedly")};
 await assert.rejects(run(e),/disabled/);
});
test("configuration and external-proof guard fail closed",async()=>{
 for(const [field,value] of [
 ["QUOTATION_HARNESS_SOURCE_SHA","mismatch"],
 ["QUOTATION_WORKER_ARTIFACT_SHA256","bad"],
 ["QUOTATION_CALLER_ARTIFACT_SHA256","bad"],
 ["QUOTATION_HARNESS_REMOTE_PREFLIGHT","unverified"],
 ["QUOTATION_HARNESS_ROLLBACK","untested"],
 ["QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET","short"],
 ["QUOTATION_SYNTHETIC_PROBE_SECRET","short"],
 ]){
  const e=env();e[field]=value;
  await assert.rejects(run(e),/quotation-private-harness-denied/,field);
 }
});
test("missing service binding and identical secrets are rejected",async()=>{
 const e=env();delete e.QUOTATION_SYNTHETIC_CALLER;
 await assert.rejects(run(e),/bindings/);
 const s=env();s.QUOTATION_SYNTHETIC_PROBE_SECRET=s.QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET;
 await assert.rejects(run(s),/secrets/);
});
test("tenant, scope, hashes, fake operator and write request denied",async()=>{
 for(const change of [
 {syntheticTenantId:"production"},{scope:"production"},{operatorAttestation:"no"},
 {workerSha256:"wrong"},{callerSha256:"wrong"},{enableWrites:true},
 ]){
  await assert.rejects(run(env(),{...payload(),...change}),/quotation-private-harness-denied/);
 }
});
test("denial requires exact expected probe response; failure never claims success",async()=>{
 for(const response of [
  new Response("Not Found",{status:404}),
  new Response("different body",{status:200}),
  new Response("Anonymous denial verified",{status:401}),
 ]){
  const e=env();e.QUOTATION_SYNTHETIC_CALLER.fetch=async()=>response;
  await assert.rejects(run(e),/anonymous-not-denied/);
 }
 const e=env();e.QUOTATION_SYNTHETIC_CALLER.fetch=async()=>{throw Error("upstream failed")};
 await assert.rejects(run(e),/upstream failed/);
});
test("even mistakenly HTTP-exposed harness returns 404",async()=>{
 const r=await handler.fetch(new Request("https://example.com/"));
 assert.equal(r.status,404);
 assert.equal(r.headers.get("cache-control"),"private, no-store");
});
