import test from "node:test";
import assert from "node:assert/strict";
import {createGeneralAiSearchProvider} from "../cloudflare/src/general-ai-search-provider.js";
test("search API key is required",()=>assert.throws(()=>createGeneralAiSearchProvider({}),/not_configured/));
test("search only calls fixed read-only endpoint with bounded query",async()=>{
  let call;
  const search=createGeneralAiSearchProvider({apiKey:"test-secret",fetchImpl:async(url,options)=>{
    call={url,options};
    return new Response(JSON.stringify({web:{results:[{url:"https://example.com/article",title:"News",description:"An independently retrieved source description with enough detail to count as evidence."}]}}),{status:200});
  }});
  const result=await search({query:"Botswana construction industry"});
  assert.equal(new URL(call.url).hostname,"api.search.brave.com");
  assert.equal(call.options.method,"GET");
  assert.equal(call.options.redirect,"error");
  assert.equal(call.options.headers["x-subscription-token"],"test-secret");
  assert.equal(result.length,1);
  assert.match(result[0].excerpt,/source description/);
});
test("does not silently claim sources on provider error",async()=>{
  const search=createGeneralAiSearchProvider({apiKey:"test",fetchImpl:async()=>new Response("error",{status:503})});
  await assert.rejects(()=>search({query:"latest"}),/research_provider_unavailable/);
});
