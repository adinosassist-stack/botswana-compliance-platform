import test from "node:test";
import assert from "node:assert/strict";
import {createGeneralAiModelProvider} from "../cloudflare/src/general-ai-model-provider.js";

test("requires key and model",()=>{
  assert.throws(()=>createGeneralAiModelProvider({model:"gpt-4.1-mini"}),/not_configured/);
  assert.throws(()=>createGeneralAiModelProvider({apiKey:"test",model:"../bad"}),/not_configured/);
});
test("rejects arbitrary outbound endpoints",()=>{
  assert.throws(()=>createGeneralAiModelProvider({apiKey:"test",model:"gpt-4.1-mini",endpoint:"https://evil.example/v1/chat/completions"}),/unsupported_model_endpoint/);
});
test("sends grounded evidence server-side without exposing tools",async()=>{
  let request;
  const model=createGeneralAiModelProvider({apiKey:"test-token",model:"gpt-4.1-mini",
    fetchImpl:async (url,options)=>{
      request={url,options};
      return new Response(JSON.stringify({choices:[{message:{content:"A sourced explanation."}}]}),{status:200});
    }
  });
  const result=await model({question:"What is new?",mode:"grounded_research",
    sources:[{url:"https://example.com/report",excerpt:"A substantial passage from the report."}],
    instructions:"Cite only evidence."});
  assert.equal(result,"A sourced explanation.");
  assert.equal(request.url,"https://api.openai.com/v1/chat/completions");
  assert.equal(request.options.headers.authorization,"Bearer test-token");
  const payload=JSON.parse(request.options.body);
  assert.equal(payload.messages[1].role,"user");
  assert.equal(payload.tools,undefined);
  assert.match(payload.messages[1].content,/example.com\/report/);
});
test("provider failure raises a generic error",async()=>{
  const model=createGeneralAiModelProvider({apiKey:"test",model:"gpt-4.1-mini",fetchImpl:async()=>new Response("failed",{status:503})});
  await assert.rejects(()=>model({question:"Hello"}),/model_provider_unavailable/);
});

test("rejects model endpoints with URL credentials, alternate ports, or fragments",()=>{
 for(const endpoint of [
  "https://user:pass@api.openai.com/v1/chat/completions",
  "https://api.openai.com:8443/v1/chat/completions",
  "https://api.openai.com/v1/chat/completions#fragment"
 ])assert.throws(()=>createGeneralAiModelProvider({apiKey:"test",model:"test-model",endpoint}),/unsupported_model_endpoint/);
});

test("private usage hook receives bounded token counts without customer content",async()=>{
 const events=[];
 const model=createGeneralAiModelProvider({apiKey:"secret",model:"gpt-4.1-mini",onUsage:event=>events.push(event),
  fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:"Private answer"}}],usage:{prompt_tokens:120,completion_tokens:30,prompt_tokens_details:{cached_tokens:20}}}),{status:200})});
 assert.equal(await model({question:"private question"}),"Private answer");
 assert.deepEqual(events,[{provider:"openai",model:"gpt-4.1-mini",usageKnown:true,inputTokens:120,outputTokens:30,cachedInputTokens:20}]);
 assert.doesNotMatch(JSON.stringify(events),/secret|private question|Private answer/);
});
test("missing or malformed provider usage is unknown, never free",async()=>{
 const events=[];
 const model=createGeneralAiModelProvider({apiKey:"secret",model:"gpt-4.1-mini",onUsage:event=>events.push(event),
  fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:"ok"}}],usage:{prompt_tokens:-1,completion_tokens:"10"}}),{status:200})});
 assert.equal(await model({question:"Hello"}),"ok");
 assert.equal(events[0].usageKnown,false);
 assert.equal(events[0].inputTokens,null);
 assert.equal(events[0].outputTokens,null);
});
test("accounting hook failure prevents untracked success",async()=>{
 const model=createGeneralAiModelProvider({apiKey:"secret",model:"gpt-4.1-mini",onUsage:()=>{throw Error("ledger_unavailable")},
  fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:"ok"}}],usage:{prompt_tokens:1,completion_tokens:1}}),{status:200})});
 await assert.rejects(()=>model({question:"Hello"}),/ledger_unavailable/);
});
