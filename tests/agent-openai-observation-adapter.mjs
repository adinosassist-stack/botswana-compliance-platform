import assert from "node:assert/strict";
import {createOpenAIObservationAdapter} from "../cloudflare/src/agent-openai-observation-adapter.js";
const env={AGENT_MODEL_OPENAI_ENABLED:"1",OPENAI_API_KEY:"synthetic-test-credential-not-valid",
  AGENT_APPROVED_MODELS_JSON:JSON.stringify([{id:"pinned-test-model",provider:"openai",enabled:true,externalProcessingApproved:true,maxOutputTokens:32}])};
const input={model:"pinned-test-model",prompt:"Summarize synthetic data",maxOutputTokens:32,signal:new AbortController().signal};
const payload={model:input.model,status:"completed",usage:{input_tokens:10,output_tokens:3},
  output:[{type:"message",role:"assistant",status:"completed",content:[{type:"output_text",text:"Synthetic summary"}]}]};
let calls=0;
const fetchImpl=async(url,options)=>{
  calls++;assert.equal(url,"https://api.openai.com/v1/responses");assert.equal(options.redirect,"error");
  assert.equal(options.signal,input.signal);
  const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.stream,false);assert.deepEqual(body.tools,[]);
  assert.equal(body.model,input.model);assert.equal(body.max_output_tokens,32);
  assert.equal(body.tenantId,undefined);assert.equal(body.actorId,undefined);
  return new Response(JSON.stringify(payload));
};
assert.equal(createOpenAIObservationAdapter({...env,AGENT_MODEL_OPENAI_ENABLED:undefined},{fetchImpl}),null);
const adapter=createOpenAIObservationAdapter(env,{fetchImpl});
assert.deepEqual(await adapter(input),{text:"Synthetic summary",usage:{inputTokens:10,outputTokens:3}});
assert.equal(calls,1);
await assert.rejects(adapter({...input,model:"unapproved"}),/openai_request_not_approved/);
await assert.rejects(adapter({...input,maxOutputTokens:4096}),/openai_request_not_approved/);
await assert.rejects(createOpenAIObservationAdapter({...env,OPENAI_API_KEY:""},{fetchImpl})(input),/openai_credentials_unavailable/);
assert.equal(calls,1);
const mocked=body=>createOpenAIObservationAdapter(env,{fetchImpl:async()=>new Response(JSON.stringify(body))})(input);
assert.deepEqual(await mocked({...payload,status:"incomplete"}),{text:null,usage:{inputTokens:10,outputTokens:3}});
assert.deepEqual(await mocked({...payload,model:"other-model"}),{text:null,usage:null});
assert.equal((await mocked({...payload,usage:{input_tokens:-1,output_tokens:3}})).usage,null);
await assert.rejects(createOpenAIObservationAdapter(env,{fetchImpl:async()=>new Response("private upstream details",{status:500})})(input),/openai_provider_unavailable/);
await assert.rejects(createOpenAIObservationAdapter(env,{fetchImpl:async()=>new Response("not JSON")})(input),/openai_response_invalid/);
await assert.rejects(createOpenAIObservationAdapter(env,{fetchImpl:async()=>new Response("a".repeat(1048577))})(input),/openai_response_too_large/);
env.AGENT_MODEL_OPENAI_ENABLED="0";
await assert.rejects(adapter(input),/openai_adapter_disabled/);
assert.equal(calls,1);
console.log("OpenAI observation adapter: approved model, bounded response, no redirects/storage/tools, usage handling PASS (mock HTTP only)");
