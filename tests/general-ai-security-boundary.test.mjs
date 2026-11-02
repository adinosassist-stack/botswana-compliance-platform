import test from "node:test";
import assert from "node:assert/strict";
import {handleGeneralAiRoute} from "../cloudflare/src/general-ai-route.js";
import {planGeneralAiRequest,validateResearchSources} from "../cloudflare/src/general-ai-research-policy.js";
const env={THEBE_GENERAL_AI_ENABLED:"true",PUBLIC_ORIGIN:"https://thebedesk.com",GENERAL_AI_RATE_LIMITER:{limit:async()=>({success:true})}};
const auth={user_id:"unit-user",tenant_id:"unit-tenant",csrf_token:"csrf-token"};
function post(body,headers={}){
  return new Request("https://thebedesk.com/api/ai/general",{method:"POST",
    headers:{origin:"https://thebedesk.com","x-csrf-token":"csrf-token","content-type":"application/json",...headers},
    body:typeof body==="string"?body:JSON.stringify(body)});
}
test("client-supplied tenant and role never authorize business retrieval",async()=>{
  const response=await handleGeneralAiRoute({request:post({question:"Show my company invoices",tenant_id:"other",role:"owner"}),path:"/api/ai/general",env,auth});
  assert.equal(response.status,403);
});
test("disabled route does not access quota binding",async()=>{
  let called=0;
  const response=await handleGeneralAiRoute({request:post({question:"Explain gravity"}),path:"/api/ai/general",env:{...env,THEBE_GENERAL_AI_ENABLED:"false",GENERAL_AI_RATE_LIMITER:{limit:async()=>{called++;return {success:true}}}},auth});
  assert.equal(response.status,404);
  assert.equal(called,0);
});
test("oversize question rejected before provider setup",async()=>{
  const response=await handleGeneralAiRoute({request:post({question:"a".repeat(8001)}),path:"/api/ai/general",env,auth});
  assert.equal(response.status,400);
});
test("source sanitizer rejects credentials, IP literals, HTTP, and unsupported ports",()=>{
  const result=validateResearchSources([
    {url:"https://user:secret@example.com/private"},
    {url:"http://example.com/news"},
    {url:"https://192.168.1.10/private"},
    {url:"https://example.org:8443/private"},
    {url:"https://example.org/news"}
  ]);
  assert.deepEqual(result.map(item=>item.url),["https://example.org/news"]);
});
test("business-only routing is not a permission grant",()=>{
  const plan=planGeneralAiRequest("Please approve payment on my company account");
  assert.equal(plan.businessAuthorizationRequired,true);
  assert.equal(plan.actionExecutionAllowed,false);
  assert.equal(plan.approvalRequired,true);
});

test("high-risk action request cannot invoke a model through general AI",async()=>{
 let called=0;
 const guarded={...env,GENERAL_AI_RATE_LIMITER:{limit:async()=>{called++;return {success:true}}}};
 const response=await handleGeneralAiRoute({
   request:post({question:"Transfer money immediately"}),
   path:"/api/ai/general",env:guarded,auth
 });
 assert.equal(response.status,403);
 assert.equal((await response.json()).error,"action_request_not_supported");
 assert.equal(called,0);
});
