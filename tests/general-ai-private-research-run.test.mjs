import test from "node:test";
import assert from "node:assert/strict";
import {runPrivateResearchAcceptance} from "../cloudflare/src/general-ai-private-research-run.review.js";

test("one-shot private research returns evidence only after fixture cleanup",async()=>{
  const statuses=[401,403,200];
  let calls=0,created,removed;
  const result=await runPrivateResearchAcceptance({
    service:{fetch:async()=>Response.json({
      ok:true,researchPerformed:true,verification:"provider_citations",
      answer:"Private answer",citations:[{url:"https://example.com/source"}]
    },{status:statuses[calls++]})},
    createFixture:async input=>{
      created=input;
      return {sessionToken:"a".repeat(64),csrfToken:"b".repeat(64)};
    },
    removeFixture:async input=>{removed=input;return true}
  });
  assert.equal(created.expiresInSeconds,300);
  assert.deepEqual(removed,{runId:created.runId});
  assert.equal(calls,3);
  assert.equal(result.citationCount,1);
  assert.equal("answer" in result,false);
});

test("partially failed provisioning still attempts run-scoped cleanup",async()=>{
  let runId;
  await assert.rejects(()=>runPrivateResearchAcceptance({
    service:{fetch:async()=>assert.fail("provisioning failed")},
    createFixture:async input=>{runId=input.runId;throw Error("fixture_failed")},
    removeFixture:async input=>{assert.equal(input.runId,runId);return true}
  }),/fixture_failed/);
});

test("unverified cleanup prevents acceptance evidence",async()=>{
  await assert.rejects(()=>runPrivateResearchAcceptance({
    service:{fetch:async()=>new Response(null,{status:503})},
    createFixture:async()=>({sessionToken:"a".repeat(64),csrfToken:"b".repeat(64)}),
    removeFixture:async()=>false
  }),/private_research_cleanup_unverified/);
});
