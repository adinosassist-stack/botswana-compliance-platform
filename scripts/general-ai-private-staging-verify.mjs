#!/usr/bin/env node
// Read-only Cloudflare check: no deployment, secret reading, or public endpoint.
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const worker="bw-general-ai-staging";
if(!/^[a-f0-9]{32}$/i.test(account||"")||!token)throw Error("read_only_credentials_required");
const base="https://api.cloudflare.com/client/v4/accounts/"+account+"/workers/scripts/"+worker;
async function get(path){
 const response=await fetch(base+path,{headers:{Authorization:"Bearer "+token},redirect:"error",signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error("cloudflare_read_failed:"+response.status);
 const data=await response.json();
 if(data.success!==true)throw Error("cloudflare_provider_error");
 return data.result;
}
const [subdomain,settings]=await Promise.all([get("/subdomain"),get("/settings")]);
const bindings=(settings?.bindings||[]).map(x=>({name:x.name,type:x.type}));
const forbidden=bindings.filter(x=>["d1","r2_bucket","service","secret_text","kv_namespace","durable_object_namespace"].includes(x.type));
const safe=subdomain?.enabled===false&&subdomain?.previews_enabled===false&&forbidden.length===0;
console.log(JSON.stringify({worker,privateSubdomain:subdomain?.enabled===false,previewsDisabled:subdomain?.previews_enabled===false,bindingTypes:bindings.map(x=>x.type),isolated:safe}));
if(!safe)process.exitCode=1;
