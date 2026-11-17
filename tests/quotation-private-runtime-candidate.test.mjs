import test from "node:test";
import assert from "node:assert/strict";
import runtime,{createQuotationPrivateRuntimeCandidate} from "../server/quotation-private-runtime-candidate.mjs";

test("default Worker export is inert and denies all routes",async()=>{
 for(const method of ["GET","POST"]){
  const response=await runtime.fetch(new Request("https://thebedesk.com/api/quotation/drafts",{method}));
  assert.equal(response.status,404);
  assert.equal(await response.text(),"Not Found");
  assert.equal(response.headers.get("cache-control"),"private, no-store");
 }
});
test("private candidate construction fails closed without independent host and binding proof",()=>{
 assert.throws(()=>createQuotationPrivateRuntimeCandidate(),/not_authorized/);
 assert.throws(()=>createQuotationPrivateRuntimeCandidate({approvedPrivateHost:true}),/not_authorized/);
 assert.throws(()=>createQuotationPrivateRuntimeCandidate({bindingsIndependentlyVerified:true}),/not_authorized/);
 assert.throws(()=>createQuotationPrivateRuntimeCandidate({
  approvedPrivateHost:true,bindingsIndependentlyVerified:true
 }),/quotation_private_integration_disabled/);
});
test("runtime cannot enable itself from request headers",async()=>{
 const response=await runtime.fetch(new Request("https://quotation.internal.example.test/api/quotation/drafts",{
  headers:{"x-quotation-private-caller":"synthetic-value","x-approved-private-host":"true"}
 }));
 assert.equal(response.status,404);
});
