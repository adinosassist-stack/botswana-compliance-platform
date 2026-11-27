/** Protected provisioning of *inert* Dock resources only.
 * Run from the owner-dispatched, independently approved staging environment.
 * No production resource mutation, provider calls, session minting or flag activation.
 */
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {DOCK_HOST,DOCK_WORKER,AI_WORKER,PRIVATE_DOCK_BACKEND,verifyDockIngress} from "./dock-hosted-ingress-guard.mjs";
export const ACCOUNT="ddd23cab31928a4bb3d4998df9b26d1d";
const DATABASE_ID="c63255cf-c589-4f6b-99c7-2d2e437566b5";
export const DATABASE="bw-dock-hosted-synthetic-staging";
const REPO="adinosassist-stack/botswana-compliance-platform";
const APP_NAME="Thebe Dock Private Staging";
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hex=/^[a-f0-9]{32}$/;
const need=(ok,reason)=>{if(!ok)throw Error(reason)};
const schema=readFileSync(new URL("../cloudflare/schema/dock-hosted-staging-auth-candidate.sql",import.meta.url),"utf8");
const safeEmail=/^[^@\s*]+@[^@\s*]+\.[^@\s*]+$/;
export function validateInputs(env){
  need(env.GITHUB_REPOSITORY===REPO&&env.GITHUB_REF==="refs/heads/main"&&env.GITHUB_ACTOR==="adinosassist-stack","owner_main_required");
  need(/^[a-f0-9]{40}$/.test(env.EXPECTED_SHA||"")&&env.GITHUB_SHA===env.EXPECTED_SHA,"exact_sha_required");
  need(["PROVISION_INERT_DOCK_STAGING","PREFLIGHT_DOCK_STAGING_ACTIVATION"].includes(env.AUTHORIZATION),"explicit_scope_required");
  need(env.CLOUDFLARE_ACCOUNT_ID===ACCOUNT&&!!env.CLOUDFLARE_API_TOKEN,"dedicated_account_credentials_required");
  need(UUID.test(env.DOCK_STAGING_BOOTSTRAP_VERSION_ID||""),"reviewed_inert_version_required");
  const emails=(env.DOCK_STAGING_TESTER_EMAILS||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  need(emails.length>=1&&emails.length<=5&&new Set(emails).size===emails.length&&emails.every(e=>safeEmail.test(e)),"reviewed_tester_allowlist_required");
  return emails;
}
function coveringHost(value){
 const h=String(value||"").replace(/^https:\/\//,"").split("/")[0].toLowerCase();
 return h===DOCK_HOST||h.includes("*")&&DOCK_HOST.endsWith(h.split("*").pop());
}
export function verifyInertSettings(settings){
 const bs=settings?.bindings;
 need(Array.isArray(bs)&&new Set(bs.map(b=>b.name)).size===bs.length,"inert_binding_inventory_invalid");
 const expected={APP_ENV:"staging",DOCK_STAGING_RESEARCH_ENABLED:"false",THEBE_GENERAL_AI_ENABLED:"false",THEBE_GENERAL_AI_RESEARCH_ENABLED:"false",AI_FEATURES_DEFAULT:"off",THEBE_INTERNAL_AUTONOMY_ENABLED:"false",AGENT_BOUNDED_TASK_EXECUTION_ENABLED:"0",THEBE_LIVE_VOICE_ENABLED:"false",THEBE_MARKETING_VOICE_ENABLED:"false",PAYMENT_PROVIDER:"none",REGISTRATION_MODE:"hold"};
 need(bs.every(b=>b.type==="assets"&&b.name==="ASSETS"||b.type==="plain_text"&&Object.hasOwn(expected,b.name)&&b.text===expected[b.name]),"unexpected_inert_binding");
 for(const [name,value] of Object.entries(expected))need(bs.some(b=>b.name===name&&b.type==="plain_text"&&b.text===value),"inert_variable_missing");
 return true;
}
export function verifyCurrentDeployment(deployments,expectedVersion){
 const versions=deployments?.deployments?.[0]?.versions;
 need(UUID.test(expectedVersion||"")&&Array.isArray(versions)&&versions.length===1&&versions[0].version_id===expectedVersion&&versions[0].percentage===100,"inert_deployment_identity_mismatch");
 return true;
}
export function verifyInitialInventory({apps,domains,routes,dns,databases,workspaceSubdomain,backendSubdomain,settings}){
 for(const a of [apps,domains,routes,dns,databases])need(Array.isArray(a),"incomplete_inventory");
 verifyInertSettings(settings);
 for(const s of [workspaceSubdomain,backendSubdomain])need(s?.enabled===false&&s?.previews_enabled===false,"direct_ingress_present");
 need(!apps.some(a=>a.name===APP_NAME||coveringHost(a.domain)||(a.self_hosted_domains||[]).some(coveringHost)||(a.destinations||[]).some(d=>coveringHost(d.uri)||["all_workers","all_preview_workers"].includes(d.type))),"access_collision");
 need(!domains.some(d=>d.hostname===DOCK_HOST||d.hostname==="ai-staging.thebedesk.com"||[DOCK_WORKER,AI_WORKER].includes(d.service)),"custom_domain_collision");
 need(!routes.some(r=>coveringHost(r.pattern)||[DOCK_WORKER,AI_WORKER].includes(r.script)),"worker_route_collision");
 need(!dns.some(d=>coveringHost(d.name)),"dns_collision");
 need(!databases.some(d=>d.name===DATABASE),"database_already_exists");
 return true;
}
export function client(token,fetchImpl=fetch){
 return async(method,path,body)=>{
   const response=await fetchImpl("https://api.cloudflare.com/client/v4"+path,{method,headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,redirect:"error",signal:AbortSignal.timeout(30000)});
   const data=await response.json().catch(()=>null);
   // Error bodies can contain account configuration. Never log them.
   need(response.ok&&data?.success===true,"cloudflare_request_failed_"+method+"_"+response.status);
   return data;
 };
}
async function list(api,path){
 let all=[];
 for(let page=1;page<=100;page++){
   const r=await api("GET",path+(path.includes("?")?"&":"?")+"per_page=100&page="+page);
   need(Array.isArray(r.result),"list_unavailable");
   all.push(...r.result);
   const n=r.result_info;
   if(!n){need(r.result.length<100,"pagination_unqualified");return all;}
   if(Number.isInteger(n.total_pages)&&page>=n.total_pages){if(Number.isInteger(n.total_count))need(all.length===n.total_count,"inventory_count_mismatch");return all;}
   if(Number.isInteger(n.total_count)&&all.length===n.total_count)return all;
   if(r.result.length<100&&!Number.isInteger(n.total_pages)&&!Number.isInteger(n.total_count))return all;
   need(r.result.length>0,"pagination_incomplete");
 }
 throw Error("inventory_limit_exceeded");
}
const result=async(api,path)=>(await api("GET",path)).result;
async function inventory(api,zone){
 const account="/accounts/"+ACCOUNT;
 const a=await list(api,account+"/access/apps");
 const z=await list(api,"/zones/"+zone+"/access/apps");
 const apps=[...a,...z.filter(x=>!a.some(y=>y.id===x.id))];
 return {apps,domains:await list(api,account+"/workers/domains"),routes:await result(api,"/zones/"+zone+"/workers/routes"),dns:await list(api,"/zones/"+zone+"/dns_records"),databases:await list(api,account+"/d1/database"),
 workspaceSubdomain:await result(api,account+"/workers/scripts/"+DOCK_WORKER+"/subdomain"),
 backendSubdomain:await result(api,account+"/workers/scripts/"+AI_WORKER+"/subdomain"),
 settings:await result(api,account+"/workers/scripts/"+DOCK_WORKER+"/settings")};
}
export async function provisionInertResources({api,emails,assertMain,expectedVersion}){
 const account="/accounts/"+ACCOUNT;
 const zones=await list(api,"/zones?name=thebedesk.com&account.id="+ACCOUNT);
 need(zones.length===1&&zones[0].name==="thebedesk.com"&&zones[0].account?.id===ACCOUNT&&hex.test(zones[0].id||"")&&zones[0].status==="active","zone_identity_mismatch");
 const zone=zones[0].id;
 const verifyVersion=async()=>verifyCurrentDeployment(await result(api,account+"/workers/scripts/"+DOCK_WORKER+"/deployments"),expectedVersion);
 await verifyVersion();
 verifyInitialInventory(await inventory(api,zone));
 await assertMain();
 const created=(await api("POST",account+"/d1/database",{name:DATABASE})).result;
 need(created?.name===DATABASE&&UUID.test(created.uuid||"")&&![ "8e6ae3fe-e7bc-4e98-a310-ce5dd85a3dce","ff229eef-7724-49ae-9d68-d3a1db669b63"].includes(created.uuid),"new_database_identity_unconfirmed");
 const database=created.uuid,path=account+"/d1/database/"+database;
 const details=await result(api,path);
 need(details?.name===DATABASE&&details.uuid===database,"database_readback_mismatch");
 const empty=(await api("POST",path+"/query",{sql:"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV'"})).result;
 need(empty?.length===1&&empty[0].success===true&&empty[0].results?.length===0,"new_database_not_empty");
 await assertMain();
 const statements=schema.replace(/^\s*--[^\n]*$/gm,"").split(";").map(sql=>sql.trim()).filter(Boolean).filter(sql=>sql!=="PRAGMA foreign_keys=ON");
 // The schema is checked in and offline-qualified. Never accept arbitrary SQL.
 // Strip checked-in line comments and omit PRAGMA; D1 enforces foreign keys.
 const q=(await api("POST",path+"/query",{batch:statements.map(sql=>({sql})).concat([{sql:"INSERT INTO dock_staging_identity(id,database_id,environment) VALUES(1,?,'dock-hosted-staging')",params:[database]}])})).result;
 need(Array.isArray(q)&&q.length===statements.length+1&&q.every(x=>x.success===true),"schema_apply_unconfirmed");
 const check=(await api("POST",path+"/query",{batch:[{sql:"SELECT database_id,environment FROM dock_staging_identity WHERE id=1"},{sql:"SELECT (SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(*) FROM tenants) AS tenants,(SELECT COUNT(*) FROM sessions) AS sessions"},{sql:"PRAGMA foreign_key_check"}]})).result;
 need(check?.length===3&&check.every(x=>x.success===true)&&check[0].results?.[0]?.database_id===database&&check[0].results[0].environment==="dock-hosted-staging"&&["users","tenants","sessions"].every(k=>check[1].results?.[0]?.[k]===0)&&check[2].results?.length===0,"database_schema_readback_failed");
 await assertMain();
 const app=(await api("POST",account+"/access/apps",{name:APP_NAME,type:"self_hosted",domain:DOCK_HOST,destinations:[{type:"public",uri:DOCK_HOST}],session_duration:"15m",app_launcher_visible:false,options_preflight_bypass:false})).result;
 need(UUID.test(app?.id||"")&&app.domain===DOCK_HOST,"access_app_creation_unconfirmed");
 const appPath=account+"/access/apps/"+app.id;
 await api("POST",appPath+"/policies",{name:"Explicit Dock staging testers",decision:"allow",precedence:1,include:emails.map(email=>({email:{email}})),exclude:[],require:[],session_duration:"15m"});
 const before=await inventory(api,zone);
 verifyInertSettings(before.settings);
 const policies=await list(api,appPath+"/policies");
 verifyDockIngress({...before,policies,appId:app.id,testerEmails:emails,inventoryComplete:true,phase:"before-attach"});
 need(!before.dns.some(d=>coveringHost(d.name)),"dns_drift_before_attach");
 await verifyVersion();
 await assertMain();
 // The Worker is still inert: no origin, DB, session, service or provider binding.
 const domain=(await api("PUT",account+"/workers/domains",{hostname:DOCK_HOST,service:DOCK_WORKER,zone_id:zone,enabled:true,previews_enabled:false})).result;
 need(domain?.hostname===DOCK_HOST&&domain.service===DOCK_WORKER&&typeof domain.id==="string","domain_attachment_unconfirmed");
 const after=await inventory(api,zone);
 await verifyVersion();
 verifyInertSettings(after.settings);
 verifyDockIngress({...after,policies:await list(api,appPath+"/policies"),appId:app.id,testerEmails:emails,inventoryComplete:true,phase:"after-attach"});
 return {ok:true,databaseId:database,accessAppId:app.id,domainId:domain.id,hostname:DOCK_HOST,inert:true,productionUntouched:true};
}
export async function verifyActivationReadiness({api, emails, expectedVersion, serviceTokenId, expectedBackendVersion, includeAccessAudience=false}){
 const account="/accounts/"+ACCOUNT;
 const zones=await list(api,"/zones?name=thebedesk.com&account.id="+ACCOUNT);
 need(zones.length===1&&zones[0].name==="thebedesk.com"&&zones[0].account?.id===ACCOUNT&&hex.test(zones[0].id||"")&&zones[0].status==="active","zone_identity_mismatch");
 const current=await inventory(api,zones[0].id);
 const inert=expectedBackendVersion===undefined;
 if(inert)verifyInertSettings(current.settings);
 verifyCurrentDeployment(await result(api,account+"/workers/scripts/"+DOCK_WORKER+"/deployments"),expectedVersion);
 const apps=current.apps.filter(app=>app.name===APP_NAME);
 need(apps.length===1&&UUID.test(apps[0].id||""),"staging_access_app_identity_mismatch");
 const appId=apps[0].id;
 const policies=await list(api,account+"/access/apps/"+appId+"/policies");
 verifyDockIngress({...current,policies,appId,testerEmails:emails,serviceTokenId,inventoryComplete:true,phase:"after-attach"});
 const databases=current.databases.filter(database=>database.name===DATABASE);
 need(databases.length===1&&databases[0].uuid===DATABASE_ID,"staging_database_identity_mismatch");
 const backendSubdomain=await result(api,account+"/workers/scripts/"+PRIVATE_DOCK_BACKEND+"/subdomain");
 need(backendSubdomain?.enabled===false&&backendSubdomain?.previews_enabled===false,"private_backend_direct_ingress_present");
 const backendPath=account+"/workers/scripts/"+PRIVATE_DOCK_BACKEND;
 const backendDeployments=await result(api,backendPath+"/deployments");
 const backendVersion=expectedBackendVersion??backendDeployments?.deployments?.[0]?.versions?.[0]?.version_id;
 verifyCurrentDeployment(backendDeployments,backendVersion);
 if(inert){
  const settings=await result(api,backendPath+"/settings");
  const bindings=settings?.bindings;
  need(Array.isArray(bindings)&&new Set(bindings.map(binding=>binding.name)).size===bindings.length,"backend_binding_inventory_invalid");
  const resources=bindings.filter(binding=>binding.type!=="plain_text");
  need(resources.length===1&&resources[0].type==="d1"&&resources[0].name==="DB"&&resources[0].id===DATABASE_ID,"backend_database_binding_mismatch");
  for(const name of ["THEBE_GENERAL_AI_ENABLED","THEBE_GENERAL_AI_RESEARCH_ENABLED","THEBE_LIVE_VOICE_ENABLED"]){
    need(bindings.some(binding=>binding.name===name&&binding.type==="plain_text"&&binding.text==="false"),"backend_feature_not_disabled");
  }
 }
 // Confirm neither Worker changed while the inventory and bindings were checked.
 verifyCurrentDeployment(await result(api,backendPath+"/deployments"),backendVersion);
 verifyCurrentDeployment(await result(api,account+"/workers/scripts/"+DOCK_WORKER+"/deployments"),expectedVersion);
 return {ok:true,hostname:DOCK_HOST,databaseId:DATABASE_ID,inert,
   ...(includeAccessAudience?{accessAudience:apps[0].aud}:{}),
   rollbackVersions:{workspace:expectedVersion,backend:backendVersion}};
}
async function main(){
 const env=process.env,emails=validateInputs(env);
 need(!!env.GH_TOKEN,"github_read_token_required");
 const assertMain=async()=>{
   const response=await fetch("https://api.github.com/repos/"+REPO+"/git/ref/heads/main",{headers:{Authorization:"Bearer "+env.GH_TOKEN,Accept:"application/vnd.github+json"},redirect:"error",signal:AbortSignal.timeout(15000)});
   need(response.ok&&(await response.json()).object?.sha===env.EXPECTED_SHA,"protected_main_drift");
 };
 const options={api:client(env.CLOUDFLARE_API_TOKEN),emails,assertMain,expectedVersion:env.DOCK_STAGING_BOOTSTRAP_VERSION_ID};
 let report;
 if(env.AUTHORIZATION==="PREFLIGHT_DOCK_STAGING_ACTIVATION"){
   await assertMain();
   report=await verifyActivationReadiness({...options,serviceTokenId:env.DOCK_RESEARCH_SERVICE_TOKEN_ID||undefined});
   await assertMain();
 }else{
   report=await provisionInertResources(options);
 }
 console.log(JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await main()}catch(e){console.error("Dock inert provisioning stopped:",String(e.message||"unknown").replace(/[^a-zA-Z0-9_ -]/g,"").slice(0,120));process.exitCode=1}
}
