import test from "node:test";
import assert from "node:assert/strict";
import {handleGeneralAiRoute} from "../cloudflare/src/general-ai-route.js";
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
