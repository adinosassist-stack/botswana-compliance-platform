import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import worker from "../server/quotation-synthetic-private-caller.mjs";
const origin="https://quotation.internal.example.test";
const secret="only-synthetic-probe-secret-1234567890";
const caller="internal-quotation-caller-secret-1234567890";
const env=(fetch)=>({
 QUOTATION_SYNTHETIC_CALLER_STAGE:"synthetic-only",
 QUOTATION_PRIVATE_ORIGIN:origin,
 QUOTATION_SYNTHETIC_PROBE_SECRET:secret,
 QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET:caller,
 QUOTATION_SERVICE:{fetch}
});
const req=(path="/probe/anonymous",options={})=>new Request(origin+path,{
 method:"GET",headers:{"x-quotation-synthetic-probe":secret},...options
});
test("private synthetic probe checks only an anonymous GET denial",async()=>{
 let calls=0;
 const outcome=await worker.fetch(req(),env(async upstream=>{
  calls++;
  assert.equal(upstream.url,origin+"/api/quotation/drafts");
  assert.equal(upstream.method,"GET");
  assert.equal(upstream.headers.get("x-quotation-private-caller"),caller);
  assert.equal(upstream.headers.has("cookie"),false);
  assert.equal(upstream.headers.has("authorization"),false);
  assert.equal(upstream.headers.has("x-csrf-token"),false);
  return new Response("private error details",{status:401,
   headers:{"set-cookie":"should-never-escape"}});
 }));
 assert.equal(calls,1);
 assert.equal(outcome.status,200);
 assert.equal(outcome.headers.has("set-cookie"),false);
 assert.doesNotMatch(await outcome.text(),/private error details/);
});
test("ineligible operations never reach D1 or private Worker",async()=>{
 let count=0;
 const environment=env(async()=>{count++;return new Response("",{status:401})});
 for(const request of [
  new Request(origin+"/probe/anonymous"),
  req("/probe/anonymous?token=anything"),
  req("/api/quotation/drafts"),
  req("/probe/anonymous",{method:"POST"}),
  new Request("https://thebedesk.com/probe/anonymous",
   {headers:{"x-quotation-synthetic-probe":secret}}),
  req("/probe/anonymous",{headers:{"x-quotation-synthetic-probe":"bad"}})
 ])assert.equal((await worker.fetch(request,environment)).status,404);
 for(const mutation of [
  {QUOTATION_SYNTHETIC_CALLER_STAGE:"production"},
  {QUOTATION_PRIVATE_ORIGIN:"https://thebedesk.com"},
  {QUOTATION_PRIVATE_INTERNAL_CALLER_SECRET:secret},
  {QUOTATION_SERVICE:null}
 ])assert.equal((await worker.fetch(req(),{...environment,...mutation})).status,404);
 assert.equal(count,0);
});
test("upstream succeeds or errors: never misrepresent anonymous denial",async()=>{
 for(const status of [200,201,403,404,500]){
  const response=await worker.fetch(req(),env(async()=>new Response("",{status})));
  assert.equal(response.status,404);
 }
 assert.equal((await worker.fetch(req(),env(async()=>{throw Error("internal") }))).status,404);
});
test("static deployment manifest never creates public endpoint or D1/R2 binding",()=>{
 const src=readFileSync(new URL("../deploy/quotation-synthetic-private-caller/wrangler.jsonc",import.meta.url),"utf8");
 const manifest=JSON.parse(src.split("\n").filter(line=>!/^\s*\/\//.test(line)).join("\n"));
 assert.equal(manifest.workers_dev,false);
 assert.equal(manifest.preview_urls,false);
 assert.deepEqual(manifest.routes,[]);
 assert.equal(manifest.name,"bw-quotation-synthetic-caller-staging");
 assert.deepEqual(manifest.services,[{
  binding:"QUOTATION_SERVICE",service:"bw-quotation-auth-private-staging"
 }]);
 assert.equal(manifest.d1_databases,undefined);
 assert.equal(manifest.r2_buckets,undefined);
});
