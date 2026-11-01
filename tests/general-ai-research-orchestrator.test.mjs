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
  assert.equal(result.verification,"source_links_available");
});
test("research provider failure is disclosed, not fabricated",async()=>{
  const result=await answerGeneralQuestion({question:"Latest news",researchEnabled:true,
    search:async()=>{throw Error("failed")},model:async p=>p.mode});
  assert.equal(result.answer,"general");
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
  assert.equal(result.answer,"general");
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
