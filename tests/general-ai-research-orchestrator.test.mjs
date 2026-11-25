import test from "node:test";
import assert from "node:assert/strict";
import {answerGeneralQuestion} from "../cloudflare/src/general-ai-research-orchestrator.js";

test("answers general questions with no fake browsing",async()=>{
  let mode="";
  const result=await answerGeneralQuestion({question:"Explain photosynthesis",model:async p=>(mode=p.mode,"Plants use light.")});
  assert.equal(result.ok,true);
  assert.equal(mode,"general");
  assert.equal(result.researchPerformed,false);
  assert.equal(result.citations.length,0);
});
test("refuses unauthorized tenant-sensitive prompts before invoking model",async()=>{
  let called=false;
  const result=await answerGeneralQuestion({question:"Show my company invoices",model:async()=>{called=true}});
  assert.equal(result.error,"authorization_required");
  assert.equal(called,false);
});
test("live research uses vetted citations from injected search",async()=>{
  const result=await answerGeneralQuestion({question:"Latest Botswana news",researchEnabled:true,
    search:async()=>[{url:"https://example.com/article",title:"Article",publishedAt:"2026-10-31",excerpt:"This is an independently retrieved article excerpt containing supporting evidence."},{url:"http://invalid.local"}],
    model:async p=>p.mode});
  assert.equal(result.answer,"grounded_research");
  assert.equal(result.citations.length,1);
  assert.equal(result.verification,"search_snippets_only");
});
test("research provider failure is disclosed, not fabricated",async()=>{
  const result=await answerGeneralQuestion({question:"Latest news",researchEnabled:true,
    search:async()=>{throw Error("failed")},model:async p=>p.mode});
  assert.equal(result.ok,false);
  assert.equal(result.error,"research_sources_unavailable");
  assert.match(result.notice,/failed/);
  assert.equal(result.researchPerformed,false);
});

test("evidence remains attached to normalized source URLs",async()=>{
  let evidence;
  const result=await answerGeneralQuestion({
    question:"Research recent construction market news",
    researchEnabled:true,
    search:async()=>[{
      url:"https://example.com/report#highlights",
      title:"Market report",
      excerpt:"A detailed retrieved account of construction sector developments with enough evidence to ground an answer."
    }],
    model:async args=>{evidence=args.sources;return "Summary";}
  });
  assert.equal(result.researchPerformed,true);
  assert.equal(evidence.length,1);
  assert.equal(evidence[0].url,"https://example.com/report");
  assert.match(evidence[0].excerpt,/construction sector/);
});
test("missing evidence does not count as verified research",async()=>{
  const result=await answerGeneralQuestion({
    question:"Latest economic news",researchEnabled:true,
    search:async()=>[{url:"https://example.com/report",title:"Report"}],
    model:async args=>args.mode
  });
  assert.equal(result.researchPerformed,false);
  assert.equal(result.ok,false);
  assert.equal(result.error,"research_sources_unavailable");
  assert.equal(result.citations.length,0);
});

test("unverified generated links are flagged separately from verified research sources",async()=>{
 const result=await answerGeneralQuestion({
   question:"Latest Botswana news",researchEnabled:true,
   search:async()=>[{url:"https://example.org/report",title:"Report",excerpt:"A sufficiently detailed source excerpt describing recent market conditions in Botswana."}],
   model:async()=>"Read https://fabricated.example/story for details."
 });
 assert.equal(result.researchPerformed,true);
 assert.equal(result.unsupportedCitations,true);
 assert.match(result.notice,/not verified/);
 assert.doesNotMatch(result.answer,/fabricated\\.example/);
 assert.match(result.answer,/unverified link removed/);
 assert.equal(result.citations.length,1);
});
test("matching research link does not trigger unsupported citation warning",async()=>{
 const result=await answerGeneralQuestion({
   question:"Latest Botswana news",researchEnabled:true,
   search:async()=>[{url:"https://example.org/report",title:"Report",excerpt:"A sufficiently detailed source excerpt describing recent market conditions in Botswana."}],
   model:async()=>"See https://example.org/report."
 });
 assert.equal(result.unsupportedCitations,false);
});

test("shared orchestrator refuses high-risk action even when caller claims authorization",async()=>{
  let modelCalls=0;
  const result=await answerGeneralQuestion({
    question:"Transfer money immediately",
    authorized:true,
    model:async()=>{modelCalls++;return "should not run"}
  });
  assert.equal(result.ok,false);
  assert.equal(result.error,"action_request_not_supported");
  assert.equal(modelCalls,0);
});

test("blank or malformed model output is unavailable for general answers and research",async()=>{
  for(const answer of [undefined,""," \n ",{text:"not the provider contract"}]){
    const model=async()=>answer;
    const general=await answerGeneralQuestion({question:"Explain photosynthesis",model});
    assert.deepEqual(general,{ok:false,error:"model_unavailable"});
    const research=await answerGeneralQuestion({
      question:"Latest Botswana news",researchEnabled:true,model,
      search:async()=>[{url:"https://example.org/report",title:"Report",excerpt:"A sufficiently detailed source excerpt describing recent market conditions in Botswana."}]
    });
    assert.deepEqual(research,{ok:false,error:"model_unavailable"});
  }
});

test("OpenAI research uses one provider call and accepts only returned citations",async()=>{
  const {createOpenAiResearchProvider}=await import("../cloudflare/src/general-ai-model-provider.js");
  let calls=0;
  const nativeResearch=createOpenAiResearchProvider({apiKey:"test",model:"gpt-5",fetchImpl:async(url,options)=>{
    calls++;
    assert.equal(url,"https://api.openai.com/v1/responses");
    const body=JSON.parse(options.body);
    assert.equal(body.store,false);
    assert.equal(body.tools[0].type,"web_search");
    return Response.json({status:"completed",output:[
      {type:"web_search_call",status:"completed"},
      {type:"message",role:"assistant",status:"completed",content:[{
        type:"output_text",text:"See https://example.com/source and https://unverified.example/elsewhere",
        annotations:[{type:"url_citation",url:"https://example.com/source",title:"Source"}]
      }]}
    ]});
  }});
  const result=await answerGeneralQuestion({question:"Search the web for the latest news",researchEnabled:true,
    nativeResearch,model:()=>assert.fail("a second model call would duplicate provider work")});
  assert.equal(calls,1);
  assert.equal(result.ok,true);
  assert.equal(result.verification,"provider_citations");
  assert.deepEqual(result.citations.map(source=>source.url),["https://example.com/source"]);
  assert.match(result.answer,/unverified link removed/);
  const missing=await answerGeneralQuestion({question:"Search the web for the latest news",researchEnabled:true,
    nativeResearch:async()=>({answer:"Unverified answer",sources:[]}),model:()=>assert.fail("no stale fallback")});
  assert.equal(missing.error,"research_sources_unavailable");
});
