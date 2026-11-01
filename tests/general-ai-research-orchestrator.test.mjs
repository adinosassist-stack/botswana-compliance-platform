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
    search:async()=>[{url:"https://example.com/article",title:"Article",publishedAt:"2026-10-31"},{url:"http://invalid.local"}],
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
