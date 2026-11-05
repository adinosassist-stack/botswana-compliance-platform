import test from "node:test";
import assert from "node:assert/strict";
import {auditStaging,ACCOUNT_ID,ZONE_ID,DB_ID} from "../scripts/general-ai-staging-live-audit.mjs";

function fixture({flags={},subdomain={},routes=[],dns=[],domains=[],counts={},missingColumn=false,failPath="",failStatus=403,pages=1}={}){
  const calls=[];
  const bindings=[
    {name:"APP_ENV",type:"plain_text",text:"staging"},
    {name:"THEBE_GENERAL_AI_ENABLED",type:"plain_text",text:"false"},
    {name:"THEBE_GENERAL_AI_RESEARCH_ENABLED",type:"plain_text",text:"false"},
    {name:"AI_FEATURES_DEFAULT",type:"plain_text",text:"off"},
    {name:"PAYMENT_PROVIDER",type:"plain_text",text:"none"},
    {name:"SESSION_SECRET",type:"secret_text"},
    {name:"DB",type:"d1",id:DB_ID},
    {name:"GENERAL_AI_RATE_LIMITER",type:"ratelimit",namespace_id:"78212078"}
  ];
  for(const [name,value] of Object.entries(flags)){
    const target=bindings.find(b=>b.name===name);
    if(target)Object.assign(target,value);
    else bindings.push({name,...value});
  }
  const fetchImpl=async (url,options)=>{
    const path=new URL(url).pathname;
    calls.push({path,method:options.method,body:options.body,headers:options.headers});
    if(failPath&&path.includes(failPath))return Response.json({success:false,errors:[]},{status:failStatus});
    if(path.endsWith("/settings"))return Response.json({success:true,result:{bindings}});
    if(path.endsWith("/subdomain"))return Response.json({success:true,result:{enabled:false,previews_enabled:false,...subdomain}});
    if(path.endsWith("/domains"))return Response.json({success:true,result:domains});
    if(path.endsWith("/routes"))return Response.json({success:true,result:routes,result_info:{total_pages:pages}});
    if(path.endsWith("/dns_records"))return Response.json({success:true,result:dns,result_info:{total_pages:pages}});
    if(path.endsWith("/query")){
      const sql=JSON.parse(options.body).sql;
      let rows=[];
      if(sql.startsWith("SELECT name FROM sqlite_master"))rows=["users","memberships","sessions"].map(name=>({name}));
      else if(sql.startsWith("PRAGMA table_info(")){
        const table=sql.match(/\(([^)]+)\)/)[1];
        const columns={
          users:["id","email","session_generation"],
          memberships:["user_id","tenant_id","role","status"],
          sessions:["token_hash","user_id","tenant_id","csrf_token","session_generation","expires_at"]
        }[table];
        rows=(missingColumn?columns.slice(1):columns).map(name=>({name}));
      }else if(sql.startsWith("PRAGMA foreign_key_list"))rows=[
        {table:"memberships",from:"user_id"},
        {table:"memberships",from:"tenant_id"}
      ];else if(sql.startsWith("SELECT COUNT(*)")){
        const table=sql.split(" FROM ")[1];
        rows=[{n:counts[table]??0}];
      }else throw Error("unexpected_SQL");
      return Response.json({success:true,result:[{success:true,results:rows}]});
    }
    throw Error("unexpected_path:"+path);
  };
  return {calls,fetchImpl};
}
const inspect=(opts={})=>{
  const f=fixture(opts);
  return {calls:f.calls,run:()=>auditStaging({fetchImpl:f.fetchImpl,token:"mock-readonly-token"})};
};
test("verifies staged worker flags, route absence, D1 auth schema and empty fixtures",async()=>{
  const a=inspect();const result=await a.run();
  assert.equal(result.ok,true);assert.equal(result.emptyFixtureStore,true);
  assert.equal(result.credentialPolicyIndependentlyVerified,false);
  assert.equal(result.tablesChecked,3);
  const writes=a.calls.filter(c=>c.method==="POST");
  assert.ok(writes.length>0);
  assert.ok(writes.every(c=>c.path.endsWith("/query")));
  assert.ok(writes.every(c=>/^(SELECT|PRAGMA)/.test(JSON.parse(c.body).sql)));
  assert.ok(a.calls.every(c=>!["PUT","PATCH","DELETE"].includes(c.method)));
  assert.ok(a.calls.every(c=>c.headers?.authorization==="Bearer mock-readonly-token"));
});
test("missing credential fails before network access",async()=>{
  const f=fixture();await assert.rejects(()=>auditStaging({fetchImpl:f.fetchImpl}),/dedicated_readonly_audit_token_required/);
  assert.equal(f.calls.length,0);
});
test("wrong account or zone is rejected before network",async()=>{
  const f=fixture();
  for(const opts of [{accountId:"x"},{zoneId:"x"}])
    await assert.rejects(()=>auditStaging({fetchImpl:f.fetchImpl,token:"token",...opts}),/staging_scope_mismatch/);
  assert.equal(f.calls.length,0);
});
test("fails when worker is public",async()=>{
  await assert.rejects(inspect({subdomain:{enabled:true}}).run(),/public_worker_subdomain_enabled/);
});
test("fails when provider is inadvertently bound",async()=>{
  await assert.rejects(inspect({flags:{OPENAI_API_KEY:{type:"secret_text"}}}).run(),/unreviewed_paid_provider_binding/);
});
test("fails when General AI is enabled",async()=>{
  await assert.rejects(inspect({flags:{THEBE_GENERAL_AI_ENABLED:{text:"true"}}}).run(),/worker_flag_mismatch/);
});
test("fails on public route",async()=>{
  await assert.rejects(inspect({routes:[{script:"bw-general-ai-staging",pattern:"thebedesk.com/*"}]}).run(),/public_worker_route/);
});
test("fails on AI staging DNS",async()=>{
  await assert.rejects(inspect({dns:[{name:"ai-staging.thebedesk.com"}]}).run(),/public_staging_dns/);
});
test("fails on matching custom domain",async()=>{
  await assert.rejects(inspect({domains:[{service:"bw-general-ai-staging",hostname:"unexpected.example"}]}).run(),/public_worker_domain/);
});
test("fails on nonempty synthetic identity store",async()=>{
  await assert.rejects(inspect({counts:{sessions:1}}).run(),/unreviewed_staging_fixture_rows_sessions/);
});
test("fails on missing required auth column",async()=>{
  await assert.rejects(inspect({missingColumn:true}).run(),/staging_auth_column_missing/);
});
test("fails closed on Cloudflare permission errors",async()=>{
  await assert.rejects(inspect({failPath:"/dns_records"}).run(),/cloudflare_audit_http_403/);
});
