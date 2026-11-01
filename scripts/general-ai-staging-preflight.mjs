#!/usr/bin/env node
/**
 * Explicit, opt-in staging smoke test.
 * Usage:
 * THEBE_AI_STAGING_ORIGIN=https://<dedicated-staging-host> \
 * THEBE_AI_STAGING_COOKIE=<session-cookie> \
 * THEBE_AI_STAGING_CSRF=<csrf-token> \
 * THEBE_AI_STAGING_LIVE_TEST=I_ACKNOWLEDGE_PROVIDER_COSTS \
 * node scripts/general-ai-staging-preflight.mjs
 *
 * No credentials, response bodies or private prompts are logged.
 * Never runs against production.
 */
const origin=process.env.THEBE_AI_STAGING_ORIGIN||"";
const cookie=process.env.THEBE_AI_STAGING_COOKIE||"";
const csrf=process.env.THEBE_AI_STAGING_CSRF||"";
if(process.env.THEBE_AI_STAGING_LIVE_TEST!=="I_ACKNOWLEDGE_PROVIDER_COSTS")throw Error("live_test_opt_in_required");
let url;
try{url=new URL(origin)}catch{throw Error("invalid_staging_origin")}
if(url.protocol!=="https:"||url.pathname!=="/"||url.search||url.hash||!/^([a-z0-9-]*staging[a-z0-9-]*)\\.thebedesk\\.com$/i.test(url.hostname))throw Error("dedicated_staging_origin_required");
if(!cookie||!csrf)throw Error("staging_auth_required");
const endpoint=new URL("/api/ai/general",url);
// Verify the route refuses unauthenticated callers before issuing paid requests.
const denied=await fetch(endpoint,{method:"POST",redirect:"error",headers:{"content-type":"application/json",origin:url.origin},body:JSON.stringify({question:"Explain gravity."})});
if(denied.status!==401&&denied.status!==404)throw Error("unauthenticated_boundary_failed_"+denied.status);
console.log("unauthenticated boundary: passed");
const scenarios=[
  {name:"general",question:"Explain photosynthesis in two sentences.",requiresCitation:false},
  {name:"research",question:"Research recent publicly reported Botswana renewable energy developments. Cite retrieved sources.",requiresCitation:true}
];
for(const item of scenarios){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),25000);
  try{
    const r=await fetch(endpoint,{method:"POST",redirect:"error",signal:controller.signal,headers:{
      "content-type":"application/json",origin:url.origin,cookie,"x-csrf-token":csrf
    },body:JSON.stringify({question:item.question})});
    const body=await r.json().catch(()=>({}));
    if(r.status!==200||body.ok!==true)throw Error(item.name+"_request_failed_"+r.status);
    if(typeof body.answer!=="string"||body.answer.length<20)throw Error(item.name+"_empty_answer");
    if(item.requiresCitation&&(!body.researchPerformed||!Array.isArray(body.citations)||!body.citations.length))throw Error(item.name+"_citations_missing");
    if(item.requiresCitation){
      for(const source of body.citations){
        const sourceUrl=new URL(source.url);
        if(sourceUrl.protocol!=="https:"||!source.title)throw Error("invalid_research_citation");
      }
    }
    console.log(item.name+": passed (answer and provenance verified structurally)");
  }finally{clearTimeout(timeout)}
}
