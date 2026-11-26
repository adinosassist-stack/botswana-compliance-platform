import test from "node:test";
import assert from "node:assert/strict";
import worker from "../cloudflare/src/general-ai-staging-entry.js";
import {verifyPrivateAiDisabled,verifyPrivateAiResearch} from "../cloudflare/src/general-ai-private-acceptance.js";

const env = {APP_ENV:"staging", THEBE_GENERAL_AI_ENABLED:"false"};
const service = {fetch:request=>worker.fetch(request, env)};

test("private service-binding negative paths exercise actual staging entrypoint", async()=>{
  const result=await verifyPrivateAiDisabled({service});
  assert.equal(result.ok,true);
  assert.deepEqual(result.outcomes.map(x=>[x.name,x.status]),[
    ["disabled",404],["unrelated",404],["method",405]
  ]);
});
test("missing internal service binding fails closed", async()=>{
  await assert.rejects(()=>verifyPrivateAiDisabled(),/private_service_binding_required/);
});
test("untrusted staging alias is rejected before a fetch", async()=>{
  let called=0;
  const fake={fetch:()=>{called++;return new Response(null,{status:404})}};
  await assert.rejects(()=>verifyPrivateAiDisabled({service:fake,origin:"https://other-staging.thebedesk.com"}),/reviewed_staging_origin_required/);
  assert.equal(called,0);
});
test("production origin is rejected before a fetch", async()=>{
  await assert.rejects(()=>verifyPrivateAiDisabled({service,origin:"https://thebedesk.com"}),/reviewed_staging_origin_required/);
});
test("credentialed origin is rejected before a fetch", async()=>{
  await assert.rejects(()=>verifyPrivateAiDisabled({service,origin:"https://user:pass@ai-staging.thebedesk.com"}),/reviewed_staging_origin_required/);
});
test("query/fragment origins are rejected", async()=>{
  for(const origin of ["https://ai-staging.thebedesk.com/?x=1","https://ai-staging.thebedesk.com/#frag"]){
    await assert.rejects(()=>verifyPrivateAiDisabled({service,origin}),/reviewed_staging_origin_required/);
  }
});
test("enabled service response fails closed and never reaches subsequent tests", async()=>{
  let called=0;
  const fake={fetch:async()=>{called++;return new Response(null,{status:401})}};
  await assert.rejects(()=>verifyPrivateAiDisabled({service:fake}),/private_staging_boundary_mismatch:disabled/);
  assert.equal(called,1);
});
test("invalid binding response fails closed", async()=>{
  await assert.rejects(()=>verifyPrivateAiDisabled({service:{fetch:async()=>({status:404})}}),/private_service_invalid_response/);
});
test("provider errors cannot be interpreted as disabled success", async()=>{
  await assert.rejects(()=>verifyPrivateAiDisabled({service:{fetch:async()=>new Response(null,{status:503})}}),/private_staging_boundary_mismatch:disabled/);
});
test("service invocation carries no cookies or authorization headers or prompt body", async()=>{
  let captured;
  const fake={fetch:async request=>{
    captured=request;
    return new Response(null,{status:request.method==="GET"?405:404});
  }};
  const result=await verifyPrivateAiDisabled({service:fake});
  assert.equal(result.ok,true);
  assert.equal(captured.headers.has("cookie"),false);
  assert.equal(captured.headers.has("authorization"),false);
  assert.equal(await captured.text(),"");
});

test("research helper checks the guards before one cited request and returns counts only",async()=>{
  const sessionToken="a".repeat(64),csrfToken="b".repeat(64);
  const statuses=[401,403,200];
  let calls=0;
  const service={fetch:async request=>{
    assert.equal(request.url,"https://ai-staging.thebedesk.com/api/ai/general");
    assert.equal(request.headers.get("cookie"),calls===0?null:"__Host-bw_session="+sessionToken);
    assert.equal(request.headers.get("x-csrf-token"),[null,"invalid",csrfToken][calls]);
    const status=statuses[calls++];
    return Response.json({ok:true,researchPerformed:true,verification:"provider_citations",
      answer:"Private response",citations:[{url:"https://example.com/reference"}]},{status});
  }};
  assert.deepEqual(await verifyPrivateAiResearch({service,sessionToken,csrfToken}),
    {ok:true,scope:"private-research",statuses,citationCount:1});
  assert.equal(calls,3);
});

test("research helper fails closed on an unexpected authentication status",async()=>{
  let calls=0;
  const service={fetch:async()=>{calls++;return new Response(null,{status:200})}};
  await assert.rejects(()=>verifyPrivateAiResearch({service,sessionToken:"a".repeat(64),csrfToken:"b".repeat(64)}),
    /private_research_boundary_mismatch/);
  assert.equal(calls,1);
});
