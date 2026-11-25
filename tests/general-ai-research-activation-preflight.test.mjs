import assert from "node:assert/strict";
import {assessResearchReadiness as assess} from "../scripts/general-ai-research-activation-preflight.mjs";
const plain=(name,text)=>({name,type:"plain_text",text});
const secret=name=>({name,type:"secret_text"});
const bindings=[plain("APP_ENV","staging"),{name:"DB",type:"d1",id:"ff229eef-7724-49ae-9d68-d3a1db669b63"},secret("SESSION_SECRET"),{name:"GENERAL_AI_RATE_LIMITER",type:"ratelimit",namespace_id:"78212078"},secret("OPENAI_API_KEY"),secret("BRAVE_SEARCH_API_KEY"),plain("THEBE_GENERAL_AI_MODEL","synthetic-model"),plain("THEBE_GENERAL_AI_ENABLED","false"),plain("THEBE_GENERAL_AI_RESEARCH_ENABLED","false")];
const base={worker:"bw-general-ai-staging",sourceSha:"a".repeat(40),bindings};
const ok=assess(base);
assert.equal(ok.configurationCandidate,true);
assert.equal(ok.activationAuthorized,false);
assert.equal(ok.providerVerified,false);
assert.equal(ok.costControlsVerified,false);
for(const b of bindings){
 const result=assess({...base,bindings:bindings.filter(x=>x.name!==b.name)});
 assert.equal(result.configurationCandidate,false);
 assert(result.missingOrInvalidBindings.includes(b.name));
}
assert.equal(assess({...base,bindings:[...bindings,secret("BRAVE_SEARCH_API_KEY")]}).configurationCandidate,false);
assert.equal(assess({...base,bindings:bindings.map(b=>b.name==="DB"?{...b,id:"8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce"}:b)}).configurationCandidate,false);
assert.equal(assess({...base,bindings:bindings.map(b=>b.name==="THEBE_GENERAL_AI_RESEARCH_ENABLED"?{...b,text:"true"}:b)}).configurationCandidate,false);
assert.throws(()=>assess({...base,worker:"bw-compliance-os"}),/invalid_research_staging_target/);
assert.throws(()=>assess({...base,sourceSha:"main"}),/invalid_research_staging_target/);
assert(!JSON.stringify(ok).includes("synthetic-model"));
console.log("Research activation metadata qualification PASS");

const openaiBindings=[...bindings.filter(binding=>binding.name!=="BRAVE_SEARCH_API_KEY"),plain("THEBE_GENERAL_AI_RESEARCH_PROVIDER","openai")];
assert.equal(assess({...base,bindings:openaiBindings}).configurationCandidate,true);
assert.equal(assess({...base,bindings:openaiBindings.filter(binding=>binding.name!=="OPENAI_API_KEY")}).configurationCandidate,false);
