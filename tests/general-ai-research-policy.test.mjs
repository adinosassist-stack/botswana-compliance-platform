import test from "node:test";
import assert from "node:assert/strict";
import {planGeneralAiRequest,validateResearchSources,researchResponseMetadata} from "../cloudflare/src/general-ai-research-policy.js";

test("general questions are not forced into business tools",()=>{
  const p=planGeneralAiRequest("Explain photosynthesis");
  assert.equal(p.intent,"general");
  assert.equal(p.businessAuthorizationRequired,false);
  assert.equal(p.actionExecutionAllowed,false);
});
test("research is explicitly gated and unavailable without integration",()=>{
  const p=planGeneralAiRequest("Research latest Botswana fintech news");
  assert.equal(p.intent,"research");
  assert.equal(p.researchRequested,true);
  assert.equal(p.researchAvailable,false);
  assert.match(p.message,/not available/i);
  assert.equal(planGeneralAiRequest("Research latest Botswana news",{researchEnabled:true}).researchAvailable,true);
});
test("private business requests require separate authorization, never auto-execution",()=>{
  const p=planGeneralAiRequest("Approve payment on my company account");
  assert.equal(p.businessAuthorizationRequired,true);
  assert.equal(p.approvalRequired,true);
  assert.equal(p.actionExecutionAllowed,false);
});
test("empty and oversized requests are rejected",()=>{
  assert.equal(planGeneralAiRequest(" ").ok,false);
  assert.equal(planGeneralAiRequest("x".repeat(8001)).ok,false);
});
test("source links require HTTPS and reject local/network literals",()=>{
  const sources=validateResearchSources([
    {url:"http://example.org/"},{url:"https://127.0.0.1/"},{url:"https://localhost/"},
    {url:"https://example.org/a#fragment",title:"Source",publishedAt:"2026-10-31"},
    {url:"https://example.org/a"},{url:"https://[::1]/"}
  ]);
  assert.equal(sources.length,1);
  assert.equal(sources[0].url,"https://example.org/a");
  assert.equal(sources[0].publishedAt,"2026-10-31");
});
test("no research claim or citations when no research was done",()=>{
  const result=researchResponseMetadata({researchPerformed:false,sources:[{url:"https://example.org"}]});
  assert.equal(result.citations.length,0);
  assert.equal(result.verification,"unverified");
});
