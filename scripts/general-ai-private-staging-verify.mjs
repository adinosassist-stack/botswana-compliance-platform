#!/usr/bin/env node
// Read-only Cloudflare check: no deployment, secret reading, or public endpoint.
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const worker="bw-general-ai-staging";
if(!/^[a-f0-9]{32}$/i.test(account||"")||!token)throw Error("read_only_credentials_required");
if(account!=="ddd23cab31928a4bb3d4998df9b26d1d")throw Error("dedicated_staging_account_required");
const base="https://api.cloudflare.com/client/v4/accounts/"+account+"/workers/scripts/"+worker;
async function get(path){
 const response=await fetch(base+path,{headers:{Authorization:"Bearer "+token},redirect:"error",signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error("cloudflare_read_failed:"+response.status);
 const data=await response.json();
 if(data.success!==true)throw Error("cloudflare_provider_error");
 return data.result;
}
const [subdomain,settings]=await Promise.all([get("/subdomain"),get("/settings")]);
// Accept only the reviewed staging resources and disabled configuration. Never log values.
const bindings=Array.isArray(settings?.bindings)?settings.bindings:[];
const expectedVars={APP_ENV:"staging",THEBE_GENERAL_AI_ENABLED:"false",THEBE_GENERAL_AI_RESEARCH_ENABLED:"false",THEBE_LIVE_VOICE_ENABLED:"false",THEBE_GPT_LIVE_PREVIEW_ENABLED:"false",THEBE_INTERNAL_AUTONOMY_ENABLED:"false",AGENT_BOUNDED_TASK_EXECUTION_ENABLED:"0",AI_FEATURES_DEFAULT:"off",REGISTRATION_MODE:"hold",PAYMENT_PROVIDER:"none",PUBLIC_ORIGIN:"https://ai-staging.thebedesk.com",PUBLIC_APP_URL:"https://ai-staging.thebedesk.com"};
const expected={
 DB:b=>b.type==="d1"&&b.id==="ff229eef-7724-49ae-9d68-d3a1db669b63",
 GENERAL_AI_RATE_LIMITER:b=>b.type==="ratelimit"&&b.namespace_id==="78212078",
 SESSION_SECRET:b=>b.type==="secret_text",
 ...Object.fromEntries(Object.entries(expectedVars).map(([name,value])=>[name,b=>b.type==="plain_text"&&b.text===value]))
};
const names=bindings.map(b=>b.name);
const validBindings=names.length===Object.keys(expected).length&&new Set(names).size===names.length&&bindings.every(b=>Object.hasOwn(expected,b.name)&&expected[b.name](b));
const safe=subdomain?.enabled===false&&subdomain?.previews_enabled===false&&validBindings;
console.log(JSON.stringify({worker,privateSubdomain:subdomain?.enabled===false,previewsDisabled:subdomain?.previews_enabled===false,bindingTypes:bindings.map(x=>x.type),isolated:safe}));
if(!safe)process.exitCode=1;
