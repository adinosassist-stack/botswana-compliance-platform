import {test} from "node:test";
import assert from "node:assert/strict";
import {ACCOUNT,DATABASE,validateInputs,verifyInitialInventory,verifyCurrentDeployment,provisionInertResources,verifyActivationReadiness} from "../scripts/dock-provision-inert-resources.mjs";
import {DOCK_HOST,DOCK_WORKER,AI_WORKER} from "../scripts/dock-hosted-ingress-guard.mjs";
const version="11111111-2222-4333-8444-555555555555", db="11111111-2222-4333-8444-666666666666", app="11111111-2222-4333-8444-777777777777", zone="a".repeat(32);
const vars={APP_ENV:"staging",DOCK_STAGING_RESEARCH_ENABLED:"false",THEBE_GENERAL_AI_ENABLED:"false",THEBE_GENERAL_AI_RESEARCH_ENABLED:"false",AI_FEATURES_DEFAULT:"off",THEBE_INTERNAL_AUTONOMY_ENABLED:"false",AGENT_BOUNDED_TASK_EXECUTION_ENABLED:"0",THEBE_LIVE_VOICE_ENABLED:"false",THEBE_MARKETING_VOICE_ENABLED:"false",PAYMENT_PROVIDER:"none",REGISTRATION_MODE:"hold"};
const settings={bindings:Object.entries(vars).map(([name,text])=>({name,text,type:"plain_text"}))};
const subdomain={enabled:false,previews_enabled:false};
function inventory(){return {apps:[],domains:[],routes:[],dns:[],databases:[],workspaceSubdomain:subdomain,backendSubdomain:subdomain,settings:structuredClone(settings)}}
test("rejects production, credentials absent, wrong version, collisions, and active binding",()=>{
 const env={GITHUB_REPOSITORY:"adinosassist-stack/botswana-compliance-platform",GITHUB_REF:"refs/heads/main",GITHUB_ACTOR:"adinosassist-stack",GITHUB_SHA:"a".repeat(40),EXPECTED_SHA:"a".repeat(40),AUTHORIZATION:"PROVISION_INERT_DOCK_STAGING",CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_API_TOKEN:"mock",DOCK_STAGING_BOOTSTRAP_VERSION_ID:version,DOCK_STAGING_TESTER_EMAILS:"test@example.invalid"};
 assert.deepEqual(validateInputs(env),["test@example.invalid"]);
 for(const patch of [{GITHUB_REF:"refs/heads/test"},{GITHUB_ACTOR:"thusico"},{EXPECTED_SHA:"b".repeat(40)},{AUTHORIZATION:"PREFLIGHT_ONLY"},{CLOUDFLARE_API_TOKEN:""},{DOCK_STAGING_TESTER_EMAILS:"*"}])assert.throws(()=>validateInputs({...env,...patch}));
 assert.equal(verifyInitialInventory(inventory()),true);
 for(const mutate of [x=>x.dns.push({name:DOCK_HOST}),x=>x.apps.push({domain:"*.thebedesk.com"}),x=>x.databases.push({name:DATABASE}),x=>x.domains.push({service:AI_WORKER}),x=>x.settings.bindings.push({name:"DB",type:"d1"}),x=>x.workspaceSubdomain={enabled:true,previews_enabled:false}]){
   const x=inventory();mutate(x);assert.throws(()=>verifyInitialInventory(x));
 }
 assert.throws(()=>verifyCurrentDeployment({deployments:[{versions:[{version_id:version,percentage:50}]}]},version));
});
function mock({collision=false,wrongPolicy=false}={}){
 const calls=[],state=inventory();
 if(collision)state.dns.push({name:DOCK_HOST});
 let policy=[],schemaApplied=false;
 const api=async(method,raw,body)=>{
  const p=raw.split("?")[0];calls.push({method,p,body});
  if(method==="GET"){
   if(p==="/zones")return {result:[{id:zone,name:"thebedesk.com",status:"active",account:{id:ACCOUNT}}]};
   if(p==="/zones/"+zone+"/access/apps")return {result:[]};
   if(p.endsWith("/access/apps"))return {result:state.apps};
   if(p.endsWith("/policies"))return {result:policy};
   if(p.endsWith("/workers/domains"))return {result:state.domains};
   if(p.endsWith("/workers/routes"))return {result:state.routes};
   if(p.endsWith("/dns_records"))return {result:state.dns};
   if(p.endsWith("/d1/database"))return {result:state.databases};
   if(p.endsWith("/d1/database/"+db))return {result:{uuid:db,name:DATABASE}};
   if(p.endsWith("/subdomain"))return {result:subdomain};
   if(p.endsWith("/settings"))return {result:state.settings};
   if(p.endsWith("/deployments"))return {result:{deployments:[{versions:[{version_id:version,percentage:100}]}]}};
  }
  if(method==="POST"&&p.endsWith("/d1/database")){const result={uuid:db,name:DATABASE};state.databases.push(result);return {result};}
  if(method==="POST"&&p.endsWith("/query")){
   if(body.sql)return {result:[{success:true,results:[]}]};
   if(!schemaApplied){schemaApplied=true;assert.ok(body.batch.every(x=>!x.sql.startsWith("--")));assert.ok(body.batch.some(x=>x.sql.startsWith("CREATE TABLE dock_staging_identity")));return {result:body.batch.map(()=>({success:true,results:[]}))}}
   return {result:[{success:true,results:[{database_id:db,environment:"dock-hosted-staging"}]},{success:true,results:[{users:0,tenants:0,sessions:0}]},{success:true,results:[]}]};
  }
  if(method==="POST"&&p.endsWith("/access/apps")){const result={id:app,aud:"test-audience",...body};state.apps.push(result);return {result}}
  if(method==="POST"&&p.endsWith("/policies")){policy=[wrongPolicy?{...body,decision:"bypass"}:body];return {result:policy[0]}}
  if(method==="PUT"&&p.endsWith("/workers/domains")){const result={id:"test-domain",zone_name:"thebedesk.com",...body};state.domains.push(result);return {result}}
  throw Error("unexpected mock call "+method+" "+p);
 };
 return {api,calls};
}
test("provisioning creates isolated schema and exact allow policy before attaching inert domain",async()=>{
 const {api,calls}=mock();let checks=0;
 const r=await provisionInertResources({api,emails:["test@example.invalid"],expectedVersion:version,assertMain:async()=>{checks++}});
 assert.equal(r.inert,true);assert.equal(r.databaseId,db);assert.equal(r.hostname,DOCK_HOST);
 assert.ok(checks>=4);
 const writes=calls.filter(x=>x.method!=="GET");
 assert.equal(writes.at(-1).method,"PUT");
 assert.ok(writes.at(-2).p.endsWith("/policies"));
});
test("collision stops all writes; unsafe Access policy stops domain attachment",async()=>{
 for(const opts of [{collision:true},{wrongPolicy:true}]){
  const {api,calls}=mock(opts);
  await assert.rejects(provisionInertResources({api,emails:["test@example.invalid"],expectedVersion:version,assertMain:async()=>{}}));
  assert.equal(calls.some(x=>x.method==="PUT"),false);
  if(opts.collision)assert.equal(calls.some(x=>x.method!=="GET"),false);
 }
});

test("activation preflight reads only and rejects a drifted backend binding",async()=>{
 const {api,calls}=mock();
 const emails=["test@example.invalid"];
 await provisionInertResources({api,emails,expectedVersion:version,assertMain:async()=>{}});
 calls.length=0;
 const isolatedId="c63255cf-c589-4f6b-99c7-2d2e437566b5";
 let bindingId=isolatedId;
 const readApi=async(method,path)=>{
  assert.equal(method,"GET");
  const response=await api(method,path);
  const endpoint=path.split("?")[0];
  if(endpoint.endsWith("/d1/database"))return {result:[{name:DATABASE,uuid:isolatedId}]};
  if(endpoint.endsWith("/"+AI_WORKER+"/settings")){
   return {result:{bindings:[...response.result.bindings,{name:"DB",type:"d1",id:bindingId}]}};
  }
  return response;
 };
 const options={api:readApi,emails,expectedVersion:version};
 assert.deepEqual(await verifyActivationReadiness(options),{ok:true,hostname:DOCK_HOST,databaseId:isolatedId,inert:true});
 bindingId=db;
 await assert.rejects(verifyActivationReadiness(options),/backend_database_binding_mismatch/);
 assert.ok(calls.every(call=>call.method==="GET"));
});
