import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const script=pathToFileURL(resolve("scripts/general-ai-staging-preflight.mjs")).href;
const base={
 THEBE_AI_STAGING_ORIGIN:"https://ai-staging.thebedesk.com",
 THEBE_AI_STAGING_COOKIE:"session-fixture",
 THEBE_AI_STAGING_CSRF:"csrf-fixture",
 THEBE_AI_STAGING_LIVE_TEST:"I_ACKNOWLEDGE_PROVIDER_COSTS"
};

function run(research=""){
 const harness=`let authorizedCalls=0;
 globalThis.fetch=async (_url,options)=>{
  if(!options.headers.cookie)return {status:401};
  authorizedCalls++;
  const isResearch=options.body.includes("Research recent");
  return {status:200,json:async()=>({
   ok:true,answer:"This is a sufficiently detailed test answer for the staging preflight.",
   researchPerformed:isResearch,
   citations:isResearch?[{title:"Verified example",url:"https://example.org/source"}]:[]
  })};
 };
 await import(${JSON.stringify(script)});
 console.log("authorizedCalls="+authorizedCalls);`;
 return spawnSync(process.execPath,["--input-type=module","-e",harness],{
  encoding:"utf8",env:{...process.env,...base,THEBE_AI_STAGING_RESEARCH_TEST:research}
 });
}

test("basic staging preflight does not silently exercise research provider",()=>{
 const result=run();
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/general: passed/);
 assert.match(result.stdout,/research: not tested/);
 assert.match(result.stdout,/authorizedCalls=1/);
 assert.doesNotMatch(result.stdout,/research: passed/);
});

test("research preflight requires a distinct explicit opt-in",()=>{
 const result=run("I_ACKNOWLEDGE_RESEARCH_PROVIDER_COSTS");
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/research: passed/);
 assert.match(result.stdout,/authorizedCalls=2/);
});

test("invalid research opt-in fails closed before provider calls",()=>{
 const result=run("true");
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/invalid_research_test_opt_in/);
 assert.doesNotMatch(result.stdout,/authorizedCalls=/);
});
