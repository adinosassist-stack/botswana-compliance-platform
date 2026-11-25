// Offline assessment of sanitized Worker binding metadata; never activates or calls providers.
export function assessResearchReadiness({worker,bindings,sourceSha}={}){
 if(worker!=="bw-general-ai-staging"||!Array.isArray(bindings)||!/^[a-f0-9]{40}$/.test(sourceSha||""))throw Error("invalid_research_staging_target");
 const missing=[];
 const one=(name,type,check=()=>true)=>{
  const matches=bindings.filter(b=>b?.name===name);
  if(matches.length!==1||matches[0].type!==type||!check(matches[0]))missing.push(name);
 };
 one("APP_ENV","plain_text",b=>b.text==="staging");
 one("DB","d1",b=>(b.id??b.database_id)==="ff229eef-7724-49ae-9d68-d3a1db669b63");
 one("SESSION_SECRET","secret_text");
 one("GENERAL_AI_RATE_LIMITER","ratelimit",b=>String(b.namespace_id)==="78212078");
 one("OPENAI_API_KEY","secret_text");
 const providers=bindings.filter(b=>b?.name==="THEBE_GENERAL_AI_RESEARCH_PROVIDER");
 if(providers.length)one("THEBE_GENERAL_AI_RESEARCH_PROVIDER","plain_text",b=>["openai","brave"].includes(b.text));
 if(providers[0]?.text!=="openai")one("BRAVE_SEARCH_API_KEY","secret_text");
 one("THEBE_GENERAL_AI_MODEL","plain_text",b=>typeof b.text==="string"&&!!b.text.trim());
 one("THEBE_GENERAL_AI_ENABLED","plain_text",b=>b.text==="false");
 one("THEBE_GENERAL_AI_RESEARCH_ENABLED","plain_text",b=>b.text==="false");
 return {sourceSha,worker,configurationCandidate:missing.length===0,missingOrInvalidBindings:missing,providerVerified:false,costControlsVerified:false,activationAuthorized:false,remaining:["private ingress qualification","authenticated provider and citation tests","global spend cap and timeout qualification","independent review","protected release approval"]};
}
