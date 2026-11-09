import test from "node:test";
import assert from "node:assert/strict";
import runner from "../cloudflare/src/general-ai-local-private-runner.js";
import staging from "../cloudflare/src/general-ai-staging-entry.js";
const origin="http://127.0.0.1:8787";
const service={fetch:request=>staging.fetch(request,{APP_ENV:"staging",THEBE_GENERAL_AI_ENABLED:"false"})};
const call=(url,env={},method="POST",headers={})=>runner.fetch(new Request(url,{method,headers}),env);
const env={LOCAL_PRIVATE_AI_TEST_ONLY:"true",STAGING_AI:service};
test("local service binding negative paths only, no provider or real D1",async()=>{
  const r=await call(origin+"/__local_ai_disabled_check",env);
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{ok:true,tested:3,scope:"private-disabled-negative-paths-only"});
});
test("default off and missing internal binding fail closed",async()=>{
  assert.equal((await call(origin+"/__local_ai_disabled_check",{STAGING_AI:service})).status,404);
  assert.equal((await call(origin+"/__local_ai_disabled_check",{LOCAL_PRIVATE_AI_TEST_ONLY:"true"})).status,503);
});
test("refuses nonloopback, credentialed call, and unexpected path",async()=>{
  assert.equal((await call("https://thebedesk.com/__local_ai_disabled_check",env)).status,403);
  assert.equal((await call(origin+"/__local_ai_disabled_check",env,"POST",{cookie:"session=secret"})).status,403);
  assert.equal((await call(origin+"/__local_ai_disabled_check",env,"POST",{authorization:"Bearer hidden"})).status,403);
  assert.equal((await call(origin+"/api/ai/general",env)).status,404);
});
test("fails closed if service is unexpectedly enabled or returns an invalid response",async()=>{
  const bad={LOCAL_PRIVATE_AI_TEST_ONLY:"true",STAGING_AI:{fetch:async()=>new Response(null,{status:401})}};
  assert.equal((await call(origin+"/__local_ai_disabled_check",bad)).status,503);
});
