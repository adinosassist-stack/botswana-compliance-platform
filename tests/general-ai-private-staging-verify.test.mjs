import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
const verifier=new URL("../scripts/general-ai-private-staging-verify.mjs",import.meta.url).href;
const bindings=[
 {name:"DB",type:"d1",id:"ff229eef-7724-49ae-9d68-d3a1db669b63"},
 {name:"GENERAL_AI_RATE_LIMITER",type:"ratelimit",namespace_id:"78212078"},
 {name:"SESSION_SECRET",type:"secret_text"},
 ...Object.entries({APP_ENV:"staging",THEBE_GENERAL_AI_ENABLED:"false",THEBE_GENERAL_AI_RESEARCH_ENABLED:"false",THEBE_LIVE_VOICE_ENABLED:"false",THEBE_GPT_LIVE_PREVIEW_ENABLED:"false",THEBE_INTERNAL_AUTONOMY_ENABLED:"false",AGENT_BOUNDED_TASK_EXECUTION_ENABLED:"0",AI_FEATURES_DEFAULT:"off",REGISTRATION_MODE:"hold",PAYMENT_PROVIDER:"none",PUBLIC_ORIGIN:"https://ai-staging.thebedesk.com",PUBLIC_APP_URL:"https://ai-staging.thebedesk.com"}).map(([name,text])=>({name,type:"plain_text",text}))
];
function run({modify=()=>{},subdomain={enabled:false,previews_enabled:false},providerFailure=false}={}){
 const fixture=structuredClone(bindings);modify(fixture);
 const code=`globalThis.fetch=async(url,options)=>{if(options?.method&&options.method!=="GET")throw Error("mutation_prohibited");return {ok:${!providerFailure},status:403,json:async()=>({success:true,result:url.endsWith("/subdomain")?${JSON.stringify(subdomain)}:{bindings:${JSON.stringify(fixture)}}})}};await import(${JSON.stringify(verifier)});`;
 return spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",env:{...process.env,CLOUDFLARE_ACCOUNT_ID:"ddd23cab31928a4bb3d4998df9b26d1d",CLOUDFLARE_API_TOKEN:"fake-test-token"}});
}
test("accepts exact disabled private staging configuration without exposing credentials",()=>{const r=run();assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).isolated,true);assert.ok(!r.stdout.includes("fake-test-token"));});
for(const [name,modify] of Object.entries({
 "wrong database":b=>b[0].id="production",
 "wrong namespace":b=>b[1].namespace_id="1",
 "extra service":b=>b.push({name:"PROD",type:"service"}),
 "extra secret":b=>b.push({name:"OPENAI_API_KEY",type:"secret_text"}),
 "missing session secret":b=>b.splice(2,1),
 "duplicate binding":b=>b.push(b[0]),
 "enabled AI":b=>{b.find(x=>x.name==="THEBE_GENERAL_AI_ENABLED").text="true"},
 "missing flag":b=>b.splice(b.findIndex(x=>x.name==="THEBE_GENERAL_AI_RESEARCH_ENABLED"),1),
 "wrong origin":b=>{b.find(x=>x.name==="PUBLIC_ORIGIN").text="https://thebedesk.com"},
 "unknown binding":b=>b.push({name:"UNKNOWN",type:"queue"})
}))test("rejects "+name,()=>assert.notEqual(run({modify}).status,0));
test("rejects public worker",()=>assert.notEqual(run({subdomain:{enabled:true,previews_enabled:false}}).status,0));
test("rejects previews",()=>assert.notEqual(run({subdomain:{enabled:false,previews_enabled:true}}).status,0));
test("fails closed on provider errors",()=>assert.notEqual(run({providerFailure:true}).status,0));
