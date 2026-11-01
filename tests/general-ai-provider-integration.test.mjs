import test from "node:test";
import assert from "node:assert/strict";
import {answerGeneralQuestion} from "../cloudflare/src/general-ai-research-orchestrator.js";
import {createGeneralAiModelProvider} from "../cloudflare/src/general-ai-model-provider.js";
import {createGeneralAiSearchProvider} from "../cloudflare/src/general-ai-search-provider.js";

test("general Q&A end-to-end via isolated mocked provider, without search",async()=>{
  let searchCalls=0,modelCalls=0;
  const model=createGeneralAiModelProvider({apiKey:"unit-only",model:"gpt-4.1-mini",fetchImpl:async()=>{
    modelCalls++;
    return Response.json({choices:[{message:{content:"Photosynthesis turns light into chemical energy."}}]});
  }});
  const response=await answerGeneralQuestion({
    question:"Explain photosynthesis",model,researchEnabled:true,
    search:async()=>{searchCalls++;return []}
  });
  assert.equal(response.ok,true);
  assert.equal(response.researchPerformed,false);
  assert.equal(response.citations.length,0);
  assert.equal(searchCalls,0);
  assert.equal(modelCalls,1);
});
test("current research passes provider excerpts to model with source attribution",async()=>{
  let modelInput;
  const search=createGeneralAiSearchProvider({
    apiKey:"unit-only",
    fetchImpl:async()=>Response.json({web:{results:[{
      url:"https://example.org/industry-report",title:"Industry report",
      description:"Evidence from a recent industry report about the Botswana construction market and employment trends."
    }]}})
  });
  const model=createGeneralAiModelProvider({
    apiKey:"unit-only",model:"gpt-4.1-mini",
    fetchImpl:async(url,init)=>{
      modelInput=JSON.parse(init.body);
      return Response.json({choices:[{message:{content:"The available source discusses construction employment. https://example.org/industry-report"}}]});
    }
  });
  const response=await answerGeneralQuestion({
    question:"Research latest Botswana construction market",model,search,researchEnabled:true
  });
  assert.equal(response.ok,true);
  assert.equal(response.researchPerformed,true);
  assert.equal(response.citations.length,1);
  assert.equal(response.citations[0].url,"https://example.org/industry-report");
  assert.equal(response.unsupportedCitations,false);
  assert.match(modelInput.messages[1].content,/construction market/);
});
test("outbound provider errors never create citations",async()=>{
  const search=createGeneralAiSearchProvider({apiKey:"unit-only",fetchImpl:async()=>new Response("",{status:503})});
  const model=createGeneralAiModelProvider({apiKey:"unit-only",model:"gpt-4.1-mini",
    fetchImpl:async()=>Response.json({choices:[{message:{content:"This is general background, not verified."}}]})});
  const response=await answerGeneralQuestion({
    question:"Latest Botswana construction news",model,search,researchEnabled:true
  });
  assert.equal(response.researchPerformed,false);
  assert.equal(response.citations.length,0);
  assert.match(response.notice,/failed/);
});
