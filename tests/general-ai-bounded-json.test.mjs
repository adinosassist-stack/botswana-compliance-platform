import test from "node:test";
import assert from "node:assert/strict";
import {readBoundedProviderJson} from "../cloudflare/src/general-ai-bounded-json.js";
import {createGeneralAiModelProvider} from "../cloudflare/src/general-ai-model-provider.js";
import {createGeneralAiSearchProvider} from "../cloudflare/src/general-ai-search-provider.js";

test("accepts valid bounded JSON",async()=>{
  assert.deepEqual(await readBoundedProviderJson(Response.json({ok:true})),{ok:true});
});
test("rejects malformed and missing provider bodies",async()=>{
  await assert.rejects(()=>readBoundedProviderJson(new Response("{")),/provider_response_invalid/);
  await assert.rejects(()=>readBoundedProviderJson(new Response(null)),/provider_response_unavailable/);
});
test("rejects oversized streamed JSON without reading unbounded content",async()=>{
  let cancelled=false;
  const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1048577))},cancel(){cancelled=true}});
  await assert.rejects(()=>readBoundedProviderJson(new Response(stream)),/provider_response_too_large/);
  assert.equal(cancelled,true);
});
test("model adapter rejects oversized provider payload",async()=>{
  const provider=createGeneralAiModelProvider({apiKey:"unit",model:"gpt-4.1-mini",
    fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:"x".repeat(1048576)}}]}))});
  await assert.rejects(()=>provider({question:"hello"}),/provider_response_too_large/);
});
test("research adapter rejects oversized provider payload",async()=>{
  const provider=createGeneralAiSearchProvider({apiKey:"unit",
    fetchImpl:async()=>new Response(JSON.stringify({web:{results:[{description:"x".repeat(1048576)}]}}))});
  await assert.rejects(()=>provider({query:"latest"}),/provider_response_too_large/);
});
