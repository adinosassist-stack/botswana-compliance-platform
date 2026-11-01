import test from "node:test";
import assert from "node:assert/strict";
import {handleGeneralAiRoute,generalAiResultStatus} from "../cloudflare/src/general-ai-route.js";
const req=(question,headers={})=>new Request("https://thebedesk.com/api/ai/general",{
 method:"POST",headers:{"origin":"https://thebedesk.com","x-csrf-token":"csrf","content-type":"application/json",...headers},body:JSON.stringify({question})
});
const env={THEBE_GENERAL_AI_ENABLED:"true",PUBLIC_ORIGIN:"https://thebedesk.com"};
const auth={user_id:"u1",tenant_id:"t1",csrf_token:"csrf"};
test("unrelated request passes through",async()=>{
 assert.equal(await handleGeneralAiRoute({request:req("Hi"),path:"/api/other",env,auth}),null);
});
test("feature is off by default",async()=>{
 const r=await handleGeneralAiRoute({request:req("Hi"),path:"/api/ai/general",env:{},auth});
 assert.equal(r.status,404);
});
test("requires authentication and CSRF",async()=>{
 const a=await handleGeneralAiRoute({request:req("Hi"),path:"/api/ai/general",env});
 assert.equal(a.status,401);
 const b=await handleGeneralAiRoute({request:req("Hi",{"x-csrf-token":"wrong"}),path:"/api/ai/general",env,auth});
 assert.equal(b.status,403);
});
test("does not return model data when provider unconfigured",async()=>{
 const r=await handleGeneralAiRoute({request:req("Hello"),path:"/api/ai/general",env,auth});
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,"rate_limit_unavailable");
});
test("rejects requests from other origins",async()=>{
 const r=await handleGeneralAiRoute({request:req("Hi",{origin:"https://malicious.example"}),path:"/api/ai/general",env,auth});
 assert.equal(r.status,403);
});

test("rate limit rejects provider calls before model configuration",async()=>{
 const limited={...env,GENERAL_AI_RATE_LIMITER:{limit:async()=>({success:false})}};
 const r=await handleGeneralAiRoute({request:req("Hello"),path:"/api/ai/general",env:limited,auth});
 assert.equal(r.status,429);
});
test("successful quota check proceeds to provider configuration",async()=>{
 const limited={...env,GENERAL_AI_RATE_LIMITER:{limit:async()=>({success:true})}};
 const r=await handleGeneralAiRoute({request:req("Hello"),path:"/api/ai/general",env:limited,auth});
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,"model_unavailable");
});

test("private business question rejected before quota or provider calls",async()=>{
 let called=false;
 const e={...env,GENERAL_AI_RATE_LIMITER:{limit:async()=>{called=true;return {success:true}}}};
 const r=await handleGeneralAiRoute({request:req("Show my company invoices"),path:"/api/ai/general",env:e,auth});
 assert.equal(r.status,403);
 assert.equal((await r.json()).error,"use_authorized_workspace_ai");
 assert.equal(called,false);
});
test("compressed input is rejected",async()=>{
 const r=await handleGeneralAiRoute({request:req("Hello",{"content-encoding":"gzip"}),path:"/api/ai/general",env,auth});
 assert.equal(r.status,415);
});
test("invalid question rejected before quota",async()=>{
 const r=await handleGeneralAiRoute({request:req(" "),path:"/api/ai/general",env,auth});
 assert.equal(r.status,400);
 assert.equal((await r.json()).error,"invalid_question");
});

test("live research failures are service-unavailable, not invalid user prompts",()=>{
 assert.equal(generalAiResultStatus({ok:false,error:"research_sources_unavailable"}),503);
 assert.equal(generalAiResultStatus({ok:false,error:"model_unavailable"}),503);
 assert.equal(generalAiResultStatus({ok:false,error:"action_request_not_supported"}),403);
 assert.equal(generalAiResultStatus({ok:false,error:"invalid_question"}),400);
 assert.equal(generalAiResultStatus({ok:true}),200);
});

test("missing research configuration fails before quota or model spending",async()=>{
 let quotaCalls=0;
 const staging={...env,GENERAL_AI_RATE_LIMITER:{limit:async()=>{quotaCalls++;return {success:true}}}};
 const response=await handleGeneralAiRoute({
   request:req("Research the latest Botswana energy news"),
   path:"/api/ai/general",env:staging,auth
 });
 assert.equal(response.status,503);
 assert.equal((await response.json()).error,"research_sources_unavailable");
 assert.equal(quotaCalls,0);
});
test("general knowledge still follows existing quota guard when research is unavailable",async()=>{
 const response=await handleGeneralAiRoute({
   request:req("Explain photosynthesis"),
   path:"/api/ai/general",env,auth
 });
 assert.equal(response.status,503);
 assert.equal((await response.json()).error,"rate_limit_unavailable");
});

test("malformed declared content length is rejected before quota",async()=>{
  const request=req("Explain photosynthesis");
  const headers=new Headers(request.headers);
  headers.set("content-length","not-a-number");
  const malformed=new Request(request.url,{method:"POST",headers,body:JSON.stringify({question:"Explain photosynthesis"})});
  const response=await handleGeneralAiRoute({request:malformed,path:"/api/ai/general",env,auth});
  assert.equal(response.status,400);
  assert.equal((await response.json()).error,"invalid_content_length");
});

test("numeric content length is accepted and continues to provider guard",async()=>{
 const response=await handleGeneralAiRoute({
   request:req("Explain photosynthesis",{"content-length":"38"}),
   path:"/api/ai/general",env,auth
 });
 assert.equal(response.status,503);
 assert.equal((await response.json()).error,"rate_limit_unavailable");
});
