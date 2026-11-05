#!/usr/bin/env node
/** Strictly read-only General AI Cloudflare release audit.
 * Only GET metadata and D1 POST queries with fixed SELECT/PRAGMA SQL.
 * No deployments, provider calls, secrets readback, public routes or mutations.
 */
export const ACCOUNT_ID="ddd23cab31928a4bb3d4998df9b26d1d";
export const ZONE_ID="33e363d52b69c4a64dbb8a0891dbb3a9";
export const DB_ID="ff229eef-7724-49ae-9d68-d3a1db669b63";
const WORKER="bw-general-ai-staging";
const BASE="https://api.cloudflare.com/client/v4";
const EXPECTED={
  APP_ENV:"staging",THEBE_GENERAL_AI_ENABLED:"false",
  THEBE_GENERAL_AI_RESEARCH_ENABLED:"false",
  AI_FEATURES_DEFAULT:"off",PAYMENT_PROVIDER:"none"
};
const REQUIRED={
  users:["id","email","session_generation"],
  memberships:["user_id","tenant_id","role","status"],
  sessions:["token_hash","user_id","tenant_id","csrf_token","session_generation","expires_at"]
};
const error=code=>{throw Error(code)};
export async function auditStaging({fetchImpl=fetch,token,accountId=ACCOUNT_ID,zoneId=ZONE_ID}={}){
  if(accountId!==ACCOUNT_ID||zoneId!==ZONE_ID)error("staging_scope_mismatch");
  if(typeof token!=="string"||!token.trim())error("dedicated_readonly_audit_token_required");
  async function call(method,path,body){
    const response=await fetchImpl(BASE+path,{
      method,redirect:"error",signal:AbortSignal.timeout(12000),
      headers:{authorization:"Bearer "+token,...(body?{"content-type":"application/json"}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    if(!response.ok)error("cloudflare_audit_http_"+response.status);
    const value=await response.json();
    if(value?.success!==true)error("cloudflare_audit_provider_error");
    return value;
  }
  // Never fetch script content or any secret values.
  const workers="/accounts/"+ACCOUNT_ID+"/workers";
  const [settings,subdomain]=await Promise.all([
    call("GET",workers+"/scripts/"+WORKER+"/settings"),
    call("GET",workers+"/scripts/"+WORKER+"/subdomain")
  ]);
  if(subdomain.result?.enabled!==false||subdomain.result?.previews_enabled!==false)error("public_worker_subdomain_enabled");
  const bindings=settings.result?.bindings;
  if(!Array.isArray(bindings))error("worker_bindings_unavailable");
  for(const [name,text] of Object.entries(EXPECTED)){
    if(bindings.filter(b=>b.name===name&&b.type==="plain_text"&&b.text===text).length!==1)error("worker_flag_mismatch_"+name);
  }
  const secret=bindings.filter(b=>b.name==="SESSION_SECRET");
  if(secret.length!==1||secret[0].type!=="secret_text")error("staging_secret_binding_missing");
  const db=bindings.filter(b=>b.name==="DB");
  if(db.length!==1||db[0].type!=="d1"||(db[0].id??db[0].database_id)!==DB_ID)error("staging_db_binding_mismatch");
  const limiter=bindings.filter(b=>b.name==="GENERAL_AI_RATE_LIMITER");
  if(limiter.length!==1||limiter[0].type!=="ratelimit"||String(limiter[0].namespace_id)!=="78212078")error("staging_limiter_mismatch");
  if(bindings.some(b=>["OPENAI_API_KEY","BRAVE_SEARCH_API_KEY","THEBE_GENERAL_AI_MODEL"].includes(b.name)))error("unreviewed_paid_provider_binding");
  if(!Array.isArray(domains.result))error("worker_domain_inventory_unavailable");
  if(domains.result.some(d=>d.service===WORKER||/^(ai-staging)\.thebedesk\.com$/i.test(d.hostname||"")))error("public_worker_domain");
  // Exhaust paginated zone-level inventory. Failure to read any page is a no-go.
  async function allPages(path){
    const combined=[];let page=1;
    while(page<=30){
      const join=path.includes("?")?"&":"?";
      const result=await call("GET",path+join+"per_page=100&page="+page);
      if(!Array.isArray(result.result))error("zone_inventory_unavailable");
      combined.push(...result.result);
      const pages=Number(result.result_info?.total_pages??1);
      if(!Number.isInteger(pages)||pages<1||pages>30)error("zone_inventory_pagination_invalid");
      if(page>=pages)return combined;
      page++;
    }
    return error("zone_inventory_pagination_overflow");
  }
  const [routes,dns,domains]=await Promise.all([
    allPages("/zones/"+ZONE_ID+"/workers/routes"),
    allPages("/zones/"+ZONE_ID+"/dns_records"),
    allPages(workers+"/domains")
  ]);
  if(domains.some(d=>d.service===WORKER||/^(ai-staging)\\.thebedesk\\.com$/i.test(d.hostname||"")))error("public_worker_domain");
  if(routes.some(r=>r.script===WORKER||/ai-staging\.thebedesk\.com/i.test(r.pattern||"")))error("public_worker_route");
  if(dns.some(r=>/^(ai-staging)\.thebedesk\.com$/i.test(r.name||"")))error("public_staging_dns");
  const d1="/accounts/"+ACCOUNT_ID+"/d1/database/"+DB_ID+"/query";
  async function readSql(sql){
    if(!/^(?:SELECT name FROM sqlite_master WHERE|PRAGMA table_info\((?:users|memberships|sessions)\)|PRAGMA foreign_key_list\(sessions\)|SELECT COUNT\(\*\) AS n FROM (?:users|memberships|sessions))/.test(sql))error("non_allowlisted_sql");
    const response=await call("POST",d1,{sql});
    if(response.result?.[0]?.success!==true||!Array.isArray(response.result[0].results))error("staging_d1_read_unavailable");
    return response.result[0].results;
  }
  const tables=(await readSql("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','memberships','sessions')")).map(r=>r.name);
  if(Object.keys(REQUIRED).some(t=>!tables.includes(t)))error("staging_auth_table_missing");
  for(const [name,columns] of Object.entries(REQUIRED)){
    const found=(await readSql("PRAGMA table_info("+name+")")).map(r=>r.name);
    if(columns.some(col=>!found.includes(col)))error("staging_auth_column_missing");
  }
  const fks=await readSql("PRAGMA foreign_key_list(sessions)");
  if(!["user_id","tenant_id"].every(col=>fks.some(k=>k.table==="memberships"&&k.from===col)))error("staging_tenant_foreign_key_missing");
  const counts={};
  for(const name of Object.keys(REQUIRED)){
    counts[name]=Number((await readSql("SELECT COUNT(*) AS n FROM "+name))[0]?.n);
    if(!Number.isSafeInteger(counts[name])||counts[name]!==0)error("unreviewed_staging_fixture_rows_"+name);
  }
  return {ok:true,worker:WORKER,account:ACCOUNT_ID,zone:ZONE_ID,database:DB_ID,
    privateSubdomain:true,previewsDisabled:true,noPublicRoutes:true,noStagingDns:true,
    noCustomDomain:true,authSchemaValid:true,emptyFixtureStore:true,
    tablesChecked:Object.keys(REQUIRED).length,routeCount:routes.length,dnsCount:dns.length,
    // Never log credential material or Worker secret values.
    credentialPolicyIndependentlyVerified:false};
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
  auditStaging({token:process.env.GENERAL_AI_STAGING_AUDIT_TOKEN})
    .then(x=>console.log(JSON.stringify(x)))
    .catch(e=>{console.error("general_ai_staging_readonly_audit_failed:"+e.message);process.exitCode=1});
}
