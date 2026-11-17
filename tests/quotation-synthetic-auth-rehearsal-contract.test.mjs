import test from "node:test";
import assert from "node:assert/strict";
import {runSyntheticQuotationDraftContract} from "../server/quotation-synthetic-auth-rehearsal-contract.mjs";
const s="synthetic-session-cookie-abcdefghijklmnopqrstuvwxyz";
const c="synthetic-csrf-token-abcdefghijklmnopqrstuvwxyz";
const secret="synthetic-internal-caller-abcdefghijklmnopqrstuvwxyz";
const qualification={mode:"offline-synthetic-test-double",noCloudflareRemoteWrites:true,
 productionResourcesAbsent:true,reviewedSyntheticFixture:true};
const tenantId="123e4567-e89b-42d3-a456-426614174000";
const origin="https://quotation.internal.example.test";
function mock(){
 let saved=null, requests=0;
 return {service:{async fetch(req){
  requests++;
  assert.equal(new URL(req.url).origin,origin);
  if(req.headers.get("x-quotation-private-caller")!==secret)
   return new Response("Not Found",{status:404});
  if(new URL(req.url).pathname==="/api/quotation/issue")
   return new Response("Not Found",{status:404});
  if(req.method==="PUT"){
   if(req.headers.get("x-csrf-token")!==c)return new Response("Forbidden",{status:403});
   const body=await req.json();
   if(body.revision===0&&saved!==null)return new Response("Conflict",{status:409});
   if(body.revision!==0)return new Response("Conflict",{status:409});
   saved={revision:1,draft:body.draft};
   return Response.json({revision:1});
  }
  if(req.method==="GET"&&saved)return Response.json(saved);
  return new Response("Not Found",{status:404});
 }},get count(){return requests}};
}
const input=(service)=>({qualification,service,sessionCookie:s,csrfToken:c,callerSecret:secret,tenantId});
test("offline only: synthetic save/reopen and denial sequence",async()=>{
 const f=mock();const receipt=await runSyntheticQuotationDraftContract(input(f.service));
 assert.deepEqual(receipt.checks,[
  "draft-create","draft-reopen","optimistic-revision-conflict",
  "csrf-denial","caller-denial","issuance-disabled"]);
 assert.equal(f.count,6);
 assert.equal(receipt.deploymentAuthorized,false);
 assert.equal(receipt.executionAuthorized,false);
 assert.equal(JSON.stringify(receipt).includes(s),false);
 assert.equal(JSON.stringify(receipt).includes(c),false);
});
test("reject unqualified fixture before service invocation",async()=>{
 for(const changed of [
  {qualification:{...qualification,noCloudflareRemoteWrites:false}},
  {qualification:{...qualification,reviewedSyntheticFixture:false}},
  {qualification:{...qualification,mode:"cloudflare-live"}},
  {sessionCookie:"short"},
  {csrfToken:s},
  {tenantId:"production"}
 ]){
  const f=mock();
  await assert.rejects(runSyntheticQuotationDraftContract({...input(f.service),...changed}),
   /quotation_synthetic_rehearsal_not_qualified/);
  assert.equal(f.count,0);
 }
});
test("reject unexpected server result without success receipt",async()=>{
 const f={fetch:async()=>new Response("Unexpected",{status:201})};
 await assert.rejects(runSyntheticQuotationDraftContract(input(f)),
  /quotation_synthetic_rehearsal_not_qualified/);
});
